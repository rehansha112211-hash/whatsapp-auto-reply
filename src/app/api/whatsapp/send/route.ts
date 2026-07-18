import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ENGINE_URL } from '@/lib/engine-url'

// ============================================================
// Send a REAL WhatsApp message to a contact.
// Proxies to the Baileys engine (port 3004) which calls
// sock.sendMessage() to deliver via actual WhatsApp.
// Also saves the message to the database.
// ============================================================

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { contactId?: string; phone?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = (body.text || '').trim()
  if (!text) {
    return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
  }

  // Resolve the phone number — either from the body or from the contact
  let phone = body.phone || ''
  let contactId = body.contactId || ''

  if (!phone && contactId) {
    const contact = await db.contact.findUnique({ where: { id: contactId } })
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }
    phone = contact.phone
  }

  if (!phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  // Send via the REAL Baileys engine
  try {
    const engineRes = await fetch(ENGINE_URL + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text }),
      signal: AbortSignal.timeout(10000),
    })

    if (!engineRes.ok) {
      const err = await engineRes.json().catch(() => ({ error: 'Engine error' }))
      return NextResponse.json(
        { error: err.error || 'Failed to send WhatsApp message' },
        { status: 502 },
      )
    }

    const result = await engineRes.json()

    // Save the outgoing message to the database
    if (contactId) {
      await db.message.create({
        data: {
          contactId,
          direction: 'outgoing',
          source: 'owner',
          text,
          status: 'sent',
        },
      })
      await db.contact.update({
        where: { id: contactId },
        data: { lastMessageAt: new Date(), lastSeen: new Date() },
      })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json(
      { error: 'WhatsApp engine not running or message failed to send' },
      { status: 503 },
    )
  }
}

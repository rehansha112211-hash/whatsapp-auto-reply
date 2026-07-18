// ============================================================
// Messages API
//
// GET  /api/messages?contactId=<id>&limit=<n>&before=<iso>
//   → { items: ChatMessage[] }
//   Items are returned in ASCENDING timestamp order (oldest first)
//   so the chat window can render them top-to-bottom without an
//   extra reverse pass on the client. Opening a conversation also
//   marks all its incoming messages as read (clears unread badge).
//
// POST /api/messages   body: { contactId, text }
//   → { ok: true, message: ChatMessage }
//   Owner sends a manual message. Calls wa-engine.sendOwnerMessage,
//   then fires a realtime broadcast so other open tabs refresh.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { sendOwnerMessage } from '@/lib/wa-engine'
import type { ChatMessage, MessageDirection, MessageSource, MessageStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

function toChatMessage(m: {
  id: string
  contactId: string
  direction: string
  source: string
  text: string
  status: string
  read: boolean
  timestamp: Date
  detectedLanguage?: string
  translatedText?: string
  isTranslated?: boolean
}): ChatMessage {
  return {
    id: m.id,
    contactId: m.contactId,
    direction: m.direction as MessageDirection,
    source: m.source as MessageSource,
    text: m.text,
    status: m.status as MessageStatus,
    read: m.read,
    timestamp: m.timestamp.toISOString(),
    detectedLanguage: m.detectedLanguage ?? '',
    translatedText: m.translatedText ?? '',
    isTranslated: m.isTranslated ?? false,
  }
}

// ------------------------------------------------------------
// GET — fetch conversation thread
// ------------------------------------------------------------
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const contactId = (searchParams.get('contactId') ?? '').trim()
  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  const limitRaw = Number(searchParams.get('limit') ?? 200)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(1000, Math.floor(limitRaw))
      : 200

  const beforeRaw = searchParams.get('before')
  const before = beforeRaw ? new Date(beforeRaw) : null
  const beforeValid = before && Number.isFinite(before.getTime()) ? before : null

  // Verify the contact exists (avoids silently returning empty list for a typo)
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Fetch most recent `limit` messages (DESC), then reverse for ASC order.
  const rows = await db.message.findMany({
    where: {
      contactId,
      ...(beforeValid ? { timestamp: { lt: beforeValid } } : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
    select: {
      id: true,
      contactId: true,
      direction: true,
      source: true,
      text: true,
      status: true,
      read: true,
      timestamp: true,
      detectedLanguage: true,
      translatedText: true,
      isTranslated: true,
    },
  })

  // Side effect: mark incoming messages as read so the unread badge clears.
  // Best-effort — failures shouldn't break the read.
  try {
    await db.message.updateMany({
      where: { contactId, direction: 'incoming', read: false },
      data: { read: true },
    })
  } catch {
    /* non-fatal */
  }

  const items = rows.reverse().map(toChatMessage)
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — owner sends a manual message
// ------------------------------------------------------------
interface PostBody {
  contactId?: unknown
  text?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canSendMessages')) {
    return NextResponse.json(
      { error: 'You need operator role to send messages' },
      { status: 403 },
    )
  }

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const contactId = typeof body.contactId === 'string' ? body.contactId.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: 'Message too long (max 4000 chars)' },
      { status: 400 },
    )
  }

  // Verify contact exists (sendOwnerMessage would error with a less helpful message)
  const exists = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true },
  })
  if (!exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  try {
    const msg = await sendOwnerMessage(contactId, text)
    const message = toChatMessage({
      id: msg.id,
      contactId: msg.contactId,
      direction: msg.direction,
      source: msg.source,
      text: msg.text,
      status: msg.status,
      read: msg.read,
      timestamp: msg.timestamp,
    })

    // Best-effort: tell the realtime mini-service to fan out a refresh.
    // Failures are silent — the 3s dashboard:tick will pick it up anyway.
    void broadcastRealtime({
      event: 'simulator:message',
      payload: { contactId, ts: Date.now() },
    }).catch(() => {})

    return NextResponse.json({ ok: true, message })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Fire-and-forget helper: POST an event to the realtime mini-service so it
// can fan-out to all connected dashboard clients over websocket.
async function broadcastRealtime(payload: { event: string; payload: unknown }) {
  try {
    await fetch('http://localhost:3003/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Realtime service may be down — non-fatal. Polling will refresh.
  }
}

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ENGINE_URL } from '@/lib/engine-url'

// ============================================================
// Phone number pairing — WhatsApp's official alternative to QR.
// User enters their phone number → gets a pairing code →
// enters it in WhatsApp → Linked Devices → connects.
// ============================================================

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const phone = (body.phone || '').trim()
  if (!phone || phone.length < 7) {
    return NextResponse.json({ error: 'Valid phone number required' }, { status: 400 })
  }

  try {
    const engineRes = await fetch(ENGINE_URL + '/pair-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(20000),
    })

    if (!engineRes.ok) {
      const err = await engineRes.json().catch(() => ({ error: 'Engine error' }))
      return NextResponse.json(
        { error: err.error || 'Failed to get pairing code' },
        { status: 502 },
      )
    }

    const data = await engineRes.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'WhatsApp engine not running at ' + ENGINE_URL },
      { status: 503 },
    )
  }
}

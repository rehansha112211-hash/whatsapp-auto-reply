// ============================================================
// POST /api/simulator/send
// End-to-end test: simulate an incoming WhatsApp customer message
// and run it through the REAL AI auto-reply pipeline (wa-engine.ts
// → ai-engine.ts → z-ai-web-dev-sdk LLM). Returns the full result
// so the simulator UI can render the AI reply + metadata.
// ============================================================
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { processIncomingMessage } from '@/lib/wa-engine'
import { db } from '@/lib/db'

interface SendBody {
  phone?: unknown
  name?: unknown
  text?: unknown
  countryCode?: unknown
}

// Basic sanity check: digits, spaces, +, -, () allowed; 6-20 chars total.
const PHONE_RE = /^[0-9+()\-\s]{6,20}$/

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: SendBody
  try {
    body = (await req.json()) as SendBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim() : ''

  if (!phone) {
    return NextResponse.json({ error: 'Phone is required' }, { status: 400 })
  }
  if (!PHONE_RE.test(phone)) {
    return NextResponse.json(
      { error: 'Phone format invalid (6-20 chars, digits/spaces/+ allowed)' },
      { status: 400 },
    )
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

  const started = Date.now()
  try {
    const result = await processIncomingMessage({
      phone,
      name: name || undefined,
      text,
      countryCode: countryCode || undefined,
    })

    // The wa-engine return type doesn't include the detected category, so
    // pull it from the freshly-updated contact for the UI's metadata panel.
    let detectedService = ''
    try {
      const c = await db.contact.findUnique({ where: { id: result.contactId } })
      detectedService = c?.detectedService ?? ''
    } catch {
      /* non-fatal */
    }

    // Best-effort: notify the realtime service so any open dashboards
    // refresh their conversation list immediately. Failures are silent —
    // the 3s dashboard:tick will pick it up anyway.
    void broadcastRealtime({
      event: 'simulator:message',
      payload: {
        contactId: result.contactId,
        phone,
        replyText: result.replyText,
        leadScore: result.leadScore,
        ownerRequested: result.ownerRequested,
        ownerNotified: result.ownerNotified,
        aiSkipped: result.aiSkipped,
        ts: Date.now(),
      },
    }).catch(() => {})

    return NextResponse.json({
      ...result,
      detectedService,
      responseMs: Date.now() - started,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { ok: false, error: message, responseMs: Date.now() - started },
      { status: 500 },
    )
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
    // Realtime service may be down — non-fatal. The 3s tick will refresh.
  }
}

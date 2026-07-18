import { NextResponse } from 'next/server'
import { processIncomingMessage } from '@/lib/wa-engine'

// ============================================================
// Incoming WhatsApp message callback — called by the REAL
// Baileys WhatsApp engine (mini-services/whatsapp-engine) when
// a genuine WhatsApp message arrives. This runs the full AI
// auto-reply pipeline and sends the reply back via the engine.
// ============================================================
export async function POST(req: Request) {
  // This route is called internally by the WhatsApp engine service
  // (localhost:3004). No browser auth required — it's server-to-server.

  let body: { phone?: string; name?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const phone = (body.phone || '').trim()
  const text = (body.text || '').trim()
  if (!phone || !text) {
    return NextResponse.json({ error: 'phone and text are required' }, { status: 400 })
  }

  // Run the full AI auto-reply pipeline (same as the simulator)
  const result = await processIncomingMessage({
    phone,
    name: body.name,
    text,
  })

  // If the AI generated a reply, send it back via the real WhatsApp engine
  if (result.ok && result.replyText) {
    try {
      await fetch('http://localhost:3004/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text: result.replyText }),
      })
    } catch {
      // Engine might not be running (sandbox) — the reply is still saved in DB
      // and visible in the dashboard. In production this sends the real WA message.
    }
  }

  return NextResponse.json(result)
}

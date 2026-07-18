import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// Generate QR — proxies to the REAL Baileys engine.
// Calls POST http://localhost:3004/connect which starts the
// Baileys connection and generates a genuine WhatsApp QR.
// ============================================================

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const engineRes = await fetch('http://localhost:3004/connect', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    })

    if (!engineRes.ok) {
      const err = await engineRes.text()
      return NextResponse.json(
        { error: `Engine error: ${err}` },
        { status: 502 },
      )
    }

    const data = await engineRes.json()
    return NextResponse.json({ ok: true, ...data })
  } catch {
    return NextResponse.json(
      {
        error: 'WhatsApp engine not running. Start it: cd mini-services/whatsapp-engine && bun run dev',
      },
      { status: 503 },
    )
  }
}

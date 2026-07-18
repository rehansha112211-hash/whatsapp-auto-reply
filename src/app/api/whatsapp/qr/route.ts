import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ENGINE_URL } from '@/lib/engine-url'

// ============================================================
// Generate QR — proxies to the REAL Baileys engine.
// Calls POST {ENGINE_URL}/connect which starts the
// Baileys connection and generates a genuine WhatsApp QR.
// ============================================================

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const engineRes = await fetch(ENGINE_URL + '/connect', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
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
        error: 'WhatsApp engine not running at ' + ENGINE_URL,
      },
      { status: 503 },
    )
  }
}

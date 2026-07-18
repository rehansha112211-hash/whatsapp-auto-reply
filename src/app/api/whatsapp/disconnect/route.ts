import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ENGINE_URL } from '@/lib/engine-url'

// ============================================================
// Disconnect — proxies to the REAL Baileys engine.
// ============================================================

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const engineRes = await fetch(ENGINE_URL + '/disconnect', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    })

    if (!engineRes.ok) {
      return NextResponse.json(
        { error: 'Engine error' },
        { status: 502 },
      )
    }

    const data = await engineRes.json()
    return NextResponse.json({ ok: true, ...data })
  } catch {
    return NextResponse.json(
      { error: 'WhatsApp engine not running' },
      { status: 503 },
    )
  }
}

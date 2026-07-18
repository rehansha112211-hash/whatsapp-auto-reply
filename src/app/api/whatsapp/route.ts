import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ENGINE_URL } from '@/lib/engine-url'

// ============================================================
// WhatsApp session state — proxies to the REAL Baileys engine.
// ============================================================

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const engineRes = await fetch(ENGINE_URL + '/', {
      signal: AbortSignal.timeout(15000),
    })

    if (!engineRes.ok) {
      return NextResponse.json({
        state: 'disconnected',
        connectedNumber: '',
        connectedName: '',
        connectedAt: null,
        deviceInfo: '',
        qrCode: '',
        lastSeen: new Date().toISOString(),
        engineAvailable: false,
      })
    }

    const engine = await engineRes.json()

    return NextResponse.json({
      state: engine.connectionState === 'connected'
        ? 'connected'
        : engine.connectionState === 'connecting'
          ? 'connecting'
          : engine.connectionState === 'logged_out'
            ? 'logged_out'
            : 'disconnected',
      connectedNumber: engine.phoneNumber || '',
      connectedName: engine.userName || '',
      connectedAt: engine.connectedAt || null,
      deviceInfo: engine.userName ? `Baileys · ${engine.userName}` : '',
      qrCode: engine.qrCode || '',
      lastSeen: engine.lastSeen || new Date().toISOString(),
      engineAvailable: true,
      error: engine.error || '',
    })
  } catch {
    return NextResponse.json({
      state: 'disconnected',
      connectedNumber: '',
      connectedName: '',
      connectedAt: null,
      deviceInfo: '',
      qrCode: '',
      lastSeen: new Date().toISOString(),
      engineAvailable: false,
      error: 'WhatsApp engine not running at ' + ENGINE_URL,
    })
  }
}

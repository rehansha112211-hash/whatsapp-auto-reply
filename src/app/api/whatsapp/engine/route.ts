import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// WhatsApp Engine proxy — checks if the REAL Baileys engine
// (mini-services/whatsapp-engine on port 3004) is running and
// returns its state. If the engine is not running, falls back
// to the simulation layer.
// ============================================================

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Check if the real engine is alive
    const healthRes = await fetch('http://localhost:3004/health', {
      signal: AbortSignal.timeout(2000),
    })
    if (healthRes.ok) {
      const health = await healthRes.json()
      // Fetch full state
      const stateRes = await fetch('http://localhost:3004/')
      if (stateRes.ok) {
        const engineState = await stateRes.json()
        return NextResponse.json({
          engineAvailable: true,
          engine: engineState,
        })
      }
      return NextResponse.json({ engineAvailable: true, engine: health })
    }
  } catch {
    // Engine not running — fall through to simulation
  }

  return NextResponse.json({ engineAvailable: false, engine: null })
}

// Proxy connect/disconnect/logout/send to the real engine
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string; phone?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body.action || 'connect'
  let endpoint = 'connect'
  if (action === 'disconnect') endpoint = 'disconnect'
  else if (action === 'logout') endpoint = 'logout'
  else if (action === 'send') endpoint = 'send'

  try {
    const engineRes = await fetch(`http://localhost:3004/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body.action === 'send' ? { phone: body.phone, text: body.text } : {}),
      signal: AbortSignal.timeout(5000),
    })
    const data = await engineRes.json()
    return NextResponse.json({ engineAvailable: true, ...data })
  } catch {
    return NextResponse.json(
      {
        engineAvailable: false,
        error: 'WhatsApp engine not running. Start it with: cd mini-services/whatsapp-engine && bun run dev',
      },
      { status: 503 },
    )
  }
}

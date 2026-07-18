// ============================================================
// Contacts API — human-mode toggle
//
// POST /api/contacts/[id]/human-mode   body: { enabled: boolean }
//   → { ok: true, humanMode: boolean }
//
// Toggles human takeover on/off for a conversation. When human mode
// is ON, the AI auto-reply pipeline skips this contact entirely and
// the operator is expected to reply manually. Also broadcasts a
// realtime event so other open tabs refresh immediately.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { setHumanMode } from '@/lib/wa-engine'

export const dynamic = 'force-dynamic'

interface PostBody {
  enabled?: unknown
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'enabled (boolean) is required' },
      { status: 400 },
    )
  }

  // Verify the contact exists so we can return a 404 instead of a 500
  const exists = await db.contact.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  try {
    await setHumanMode(id, body.enabled)

    // Best-effort: tell the realtime mini-service to fan out a refresh.
    void broadcastRealtime({
      event: 'simulator:message',
      payload: { contactId: id, humanMode: body.enabled, ts: Date.now() },
    }).catch(() => {})

    return NextResponse.json({ ok: true, humanMode: body.enabled })
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

// ============================================================
// Broadcast API
//
// GET  /api/broadcast                  → { items: Broadcast[] }
//   Returns all past campaigns (newest first).
//
// POST /api/broadcast                  body: { name, message, audience }
//   Resolves the audience (filtered Contacts), sends each one an
//   owner-source message via wa-engine.sendOwnerMessage, persists a
//   Broadcast record with sentCount = number of recipients, logs the
//   action, and returns the broadcast + the resolved sentCount.
//
//   audience: all | leads | hot | active | customer | custom
//     all      → every contact
//     leads    → leadScore >= 25
//     hot      → leadScore >= 70
//     active   → status = 'active'
//     customer → status = 'customer'
//     custom   → not supported yet; treated as 'all'
//
//   Concurrency is capped at 5 to avoid hammering the DB / WhatsApp
//   simulation layer when audiences are large.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { sendOwnerMessage } from '@/lib/wa-engine'

export const dynamic = 'force-dynamic'

type Audience = 'all' | 'leads' | 'hot' | 'active' | 'customer' | 'custom'

const VALID_AUDIENCES: readonly Audience[] = [
  'all',
  'leads',
  'hot',
  'active',
  'customer',
  'custom',
] as const

function isAudience(v: unknown): v is Audience {
  return typeof v === 'string' && (VALID_AUDIENCES as readonly string[]).includes(v)
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'All Contacts',
  leads: 'Leads (score ≥ 25)',
  hot: 'Hot Leads (score ≥ 70)',
  active: 'Active',
  customer: 'Customers',
  custom: 'Custom',
}

interface BroadcastRow {
  id: string
  name: string
  message: string
  audience: string
  sentCount: number
  deliveredCount: number
  status: string
  createdAt: string
  updatedAt: string
}

function toRow(b: {
  id: string
  name: string
  message: string
  audience: string
  sentCount: number
  deliveredCount: number
  status: string
  createdAt: Date
  updatedAt: Date
}): BroadcastRow {
  return {
    id: b.id,
    name: b.name,
    message: b.message,
    audience: b.audience,
    sentCount: b.sentCount,
    deliveredCount: b.deliveredCount,
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }
}

// ------------------------------------------------------------
// GET — list all broadcasts
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const items = rows.map(toRow)
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create + send a broadcast
// ------------------------------------------------------------
interface PostBody {
  name?: unknown
  message?: unknown
  audience?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const audience: Audience = isAudience(body.audience) ? body.audience : 'all'

  if (!name) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
  }
  if (!message) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: 'Message too long (max 4000 chars)' },
      { status: 400 },
    )
  }

  // --- Resolve the audience filter ---
  const effectiveAudience: Audience = audience === 'custom' ? 'all' : audience
  const where = buildAudienceWhere(effectiveAudience)
  const contacts = await db.contact.findMany({
    where,
    select: { id: true, name: true },
  })

  if (contacts.length === 0) {
    // Still record an empty broadcast so the owner has a paper trail.
    const empty = await db.broadcast.create({
      data: {
        name,
        message,
        audience: effectiveAudience,
        sentCount: 0,
        deliveredCount: 0,
        status: 'sent',
      },
    })
    await db.log.create({
      data: {
        category: 'whatsapp',
        level: 'warn',
        message: `Broadcast "${name}" sent to 0 contacts (audience "${effectiveAudience}" was empty)`,
      },
    })
    return NextResponse.json({
      ok: true,
      broadcast: toRow(empty),
      sentCount: 0,
      warning: 'No contacts matched the selected audience.',
    })
  }

  // --- Send to each contact with bounded concurrency (5) ---
  let sentCount = 0
  let failedCount = 0
  const CONCURRENCY = 5
  let cursor = 0

  async function worker() {
    while (cursor < contacts.length) {
      const idx = cursor++
      const c = contacts[idx]
      try {
        await sendOwnerMessage(c.id, message)
        sentCount += 1
      } catch {
        failedCount += 1
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  // --- Persist the broadcast record ---
  const broadcast = await db.broadcast.create({
    data: {
      name,
      message,
      audience: effectiveAudience,
      sentCount,
      deliveredCount: sentCount,
      status: failedCount === contacts.length ? 'draft' : 'sent',
    },
  })

  // --- Log it (single info line; per-contact logs come from sendOwnerMessage) ---
  await db.log.create({
    data: {
      category: 'whatsapp',
      level: failedCount > 0 ? 'warn' : 'info',
      message: `Broadcast "${name}" sent to ${sentCount} contact${sentCount === 1 ? '' : 's'} (audience: ${AUDIENCE_LABELS[effectiveAudience]})${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
      meta: JSON.stringify({
        audience: effectiveAudience,
        sentCount,
        failedCount,
        total: contacts.length,
      }),
    },
  })

  // Best-effort realtime broadcast so other open tabs refresh.
  void broadcastRealtime({
    event: 'broadcast:sent',
    payload: { id: broadcast.id, sentCount },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    broadcast: toRow(broadcast),
    sentCount,
    failedCount,
  })
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function buildAudienceWhere(audience: Audience) {
  if (audience === 'leads') return { leadScore: { gte: 25 } }
  if (audience === 'hot') return { leadScore: { gte: 70 } }
  if (audience === 'active') return { status: 'active' }
  if (audience === 'customer') return { status: 'customer' }
  return {} // all
}

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

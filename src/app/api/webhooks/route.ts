// ============================================================
// Webhooks API
//
// GET    /api/webhooks               → { items: WebhookListItem[] }
//   Lists all webhooks with masked secrets + delivery stats
//   (total / delivered / failed / lastDeliveryAt over the last
//   10 deliveries per webhook).
//
// POST   /api/webhooks               body: { name, url, secret?, events: string[] }
//   Creates a new webhook. URL must be http(s). Auto-generates
//   a secret if not provided. Returns the full secret one time
//   only (subsequent GET responses mask it).
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUPPORTED_EVENTS } from '@/lib/webhook-dispatcher'
import type { WebhookListItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

function maskSecret(secret: string): string {
  if (!secret) return ''
  if (secret.length <= 8) return '••••'
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`
}

function parseEvents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    if (Array.isArray(parsed)) {
      return parsed.filter((e): e is string => typeof e === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const e of input) {
    if (typeof e === 'string' && (SUPPORTED_EVENTS as readonly string[]).includes(e)) {
      if (!out.includes(e)) out.push(e)
    }
  }
  return out
}

interface WebhookWithStats {
  id: string
  name: string
  url: string
  secret: string
  events: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  deliveries: { status: string; createdAt: Date }[]
}

function toItem(w: WebhookWithStats): WebhookListItem {
  const recent = w.deliveries ?? []
  const total = recent.length
  const delivered = recent.filter((d) => d.status === 'delivered').length
  const failed = recent.filter((d) => d.status === 'failed').length
  const lastDeliveryAt = recent.length
    ? recent
        .map((d) => d.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0]
        .toISOString()
    : null
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    secret: maskSecret(w.secret),
    events: parseEvents(w.events),
    isActive: w.isActive,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    deliveries: { total, delivered, failed, lastDeliveryAt },
  }
}

// ------------------------------------------------------------
// GET — list all webhooks with delivery stats
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.webhook.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { status: true, createdAt: true },
      },
    },
  })

  const items = rows.map((r) => toItem(r as unknown as WebhookWithStats))
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create a webhook
// ------------------------------------------------------------
interface CreateBody {
  name?: unknown
  url?: unknown
  secret?: unknown
  events?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Name too long (max 80 chars)' }, { status: 400 })
  }
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }
  if (!isValidUrl(url)) {
    return NextResponse.json(
      { error: 'URL must be a valid http(s) URL' },
      { status: 400 },
    )
  }
  if (url.length > 2048) {
    return NextResponse.json({ error: 'URL too long (max 2048 chars)' }, { status: 400 })
  }

  const events = sanitizeEvents(body.events)
  // Allow empty events array (subscribe to all). But warn if user
  // provided events that weren't recognised.
  const rawEventsArr = Array.isArray(body.events) ? body.events : []
  const dropped = rawEventsArr.filter(
    (e) => typeof e === 'string' && !(SUPPORTED_EVENTS as readonly string[]).includes(e),
  ).length

  const secret =
    typeof body.secret === 'string' && body.secret.trim().length >= 8
      ? body.secret.trim()
      : crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')

  const created = await db.webhook.create({
    data: {
      name,
      url,
      secret,
      events: JSON.stringify(events),
      isActive: true,
    },
  })

  const item: WebhookListItem = {
    id: created.id,
    name: created.name,
    url: created.url,
    secret: created.secret, // full secret — one-time view
    events: parseEvents(created.events),
    isActive: created.isActive,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    deliveries: { total: 0, delivered: 0, failed: 0, lastDeliveryAt: null },
  }

  return NextResponse.json({
    ok: true,
    webhook: item,
    secretShown: true,
    warning:
      dropped > 0
        ? `${dropped} unrecognised event(s) were ignored.`
        : undefined,
  })
}

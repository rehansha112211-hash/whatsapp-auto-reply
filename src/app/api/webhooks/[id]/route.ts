// ============================================================
// Webhook [id] API — update / delete a single webhook
//
// PATCH   /api/webhooks/[id]   body: { name?, url?, events?, isActive? }
//   Updates editable fields. The secret cannot be changed here —
//   use POST /api/webhooks/[id]/secret to regenerate.
//
// DELETE  /api/webhooks/[id]
//   Removes a webhook. Cascades to all its deliveries.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUPPORTED_EVENTS } from '@/lib/webhook-dispatcher'

export const dynamic = 'force-dynamic'

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

interface PatchBody {
  name?: unknown
  url?: unknown
  events?: unknown
  isActive?: unknown
}

// ------------------------------------------------------------
// PATCH — update webhook fields
// ------------------------------------------------------------
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data: { name?: string; url?: string; events?: string; isActive?: boolean } = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (name.length === 0) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }
    if (name.length > 80) {
      return NextResponse.json({ error: 'Name too long (max 80 chars)' }, { status: 400 })
    }
    data.name = name
  }

  if (typeof body.url === 'string') {
    const url = body.url.trim()
    if (!url) {
      return NextResponse.json({ error: 'URL cannot be empty' }, { status: 400 })
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
    data.url = url
  }

  if (body.events !== undefined) {
    const events = sanitizeEvents(body.events)
    data.events = JSON.stringify(events)
  }

  if (typeof body.isActive === 'boolean') {
    data.isActive = body.isActive
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update (name, url, events, isActive)' },
      { status: 400 },
    )
  }

  try {
    const updated = await db.webhook.update({
      where: { id },
      data,
    })
    return NextResponse.json({
      ok: true,
      webhook: {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        events: JSON.parse(updated.events || '[]') as string[],
        isActive: updated.isActive,
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ------------------------------------------------------------
// DELETE — remove a webhook (cascades deliveries)
// ------------------------------------------------------------
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    await db.webhook.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

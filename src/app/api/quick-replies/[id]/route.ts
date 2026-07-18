// ============================================================
// Quick Replies API — per-item mutations
//
// PUT    /api/quick-replies/[id]            body: { shortcut?, title?, body?, category? }
//   Updates any provided fields. When `?used=1` query param is
//   present, only `usageCount` is incremented (the body is
//   ignored), and the updated row is returned — used by the
//   composer each time a quick reply is inserted.
//
// DELETE /api/quick-replies/[id]
//   Removes a quick reply permanently.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { QuickReplyRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Category = 'greeting' | 'pricing' | 'support' | 'hours' | 'general'

const VALID_CATEGORIES: readonly Category[] = [
  'greeting',
  'pricing',
  'support',
  'hours',
  'general',
] as const

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (VALID_CATEGORIES as readonly string[]).includes(v)
}

const SHORTCUT_RE = /^[a-zA-Z0-9_]+$/

function toRow(q: {
  id: string
  shortcut: string
  title: string
  body: string
  category: string
  usageCount: number
  createdAt: Date
  updatedAt: Date
}): QuickReplyRow {
  return {
    id: q.id,
    shortcut: q.shortcut,
    title: q.title,
    body: q.body,
    category: q.category,
    usageCount: q.usageCount,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }
}

// ------------------------------------------------------------
// PUT — update fields OR bump usageCount (when ?used=1)
// ------------------------------------------------------------
interface PutBody {
  shortcut?: unknown
  title?: unknown
  body?: unknown
  category?: unknown
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const url = new URL(req.url)
  const used = url.searchParams.get('used') === '1'

  const existing = await db.quickReply.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Quick reply not found' }, { status: 404 })
  }

  // Usage-bump shortcut: ignore body, just +1 the counter.
  if (used) {
    const updated = await db.quickReply.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    })
    return NextResponse.json({ ok: true, quickReply: toRow(updated) })
  }

  let body: PutBody
  try {
    body = (await req.json()) as PutBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data: {
    shortcut?: string
    title?: string
    body?: string
    category?: Category
  } = {}

  if (typeof body.shortcut === 'string') {
    const shortcut = body.shortcut.trim()
    if (!shortcut) {
      return NextResponse.json({ error: 'Shortcut cannot be empty' }, { status: 400 })
    }
    if (shortcut.length > 40) {
      return NextResponse.json(
        { error: 'Shortcut too long (max 40 chars)' },
        { status: 400 },
      )
    }
    if (!SHORTCUT_RE.test(shortcut)) {
      return NextResponse.json(
        { error: 'Shortcut must be alphanumeric (letters, numbers, underscore)' },
        { status: 400 },
      )
    }
    if (shortcut !== existing.shortcut) {
      const conflict = await db.quickReply.findUnique({ where: { shortcut } })
      if (conflict) {
        return NextResponse.json(
          { error: `Shortcut "/${shortcut}" already exists` },
          { status: 409 },
        )
      }
    }
    data.shortcut = shortcut
  }

  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    if (title.length > 120) {
      return NextResponse.json(
        { error: 'Title too long (max 120 chars)' },
        { status: 400 },
      )
    }
    data.title = title
  }

  if (typeof body.body === 'string') {
    const text = body.body.trim()
    if (!text) {
      return NextResponse.json({ error: 'Body cannot be empty' }, { status: 400 })
    }
    if (text.length > 4000) {
      return NextResponse.json(
        { error: 'Body too long (max 4000 chars)' },
        { status: 400 },
      )
    }
    data.body = text
  }

  if (body.category !== undefined) {
    if (!isCategory(body.category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 },
      )
    }
    data.category = body.category
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 },
    )
  }

  const updated = await db.quickReply.update({ where: { id }, data })
  return NextResponse.json({ ok: true, quickReply: toRow(updated) })
}

// ------------------------------------------------------------
// DELETE — remove a quick reply
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
  const existing = await db.quickReply.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Quick reply not found' }, { status: 404 })
  }

  await db.quickReply.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

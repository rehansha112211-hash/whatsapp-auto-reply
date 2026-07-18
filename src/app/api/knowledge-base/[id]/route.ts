// ============================================================
// Knowledge Base [id] API — fetch / update / delete a single article
//
// GET     /api/knowledge-base/[id]
//   Returns the full article. Increments viewCount (best-effort,
//   non-blocking — view tracking must never block a read).
//
// PATCH   /api/knowledge-base/[id]   body: { title?, content?, category?, tags?, isActive?, priority? }
//   Admin only. Updates any provided fields.
//
// DELETE  /api/knowledge-base/[id]
//   Admin only. Removes the article permanently.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import type { KnowledgeArticleItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = new Set([
  'pricing',
  'services',
  'policies',
  'faq',
  'general',
])

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

function toItem(a: {
  id: string
  title: string
  content: string
  category: string
  tags: string
  isActive: boolean
  priority: number
  viewCount: number
  createdAt: Date
  updatedAt: Date
}): KnowledgeArticleItem {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category,
    tags: parseTags(a.tags),
    isActive: a.isActive,
    priority: a.priority,
    viewCount: a.viewCount,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const t of input) {
    if (typeof t !== 'string') continue
    const trimmed = t.trim()
    if (trimmed && !out.includes(trimmed)) out.push(trimmed)
  }
  return out
}

// ------------------------------------------------------------
// GET — single article (increments viewCount)
// ------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const article = await db.knowledgeArticle.findUnique({ where: { id } })
  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  // Best-effort view tracking — fire and forget so a failure here
  // never blocks the read.
  db.knowledgeArticle
    .update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    })
    .catch(() => {})

  return NextResponse.json({ article: toItem(article) })
}

// ------------------------------------------------------------
// PATCH — update fields (admin only)
// ------------------------------------------------------------
interface PatchBody {
  title?: unknown
  content?: unknown
  category?: unknown
  tags?: unknown
  isActive?: unknown
  priority?: unknown
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canManageKnowledgeBase')) {
    return NextResponse.json(
      { error: 'You need admin role to manage knowledge base articles' },
      { status: 403 },
    )
  }

  const { id } = await params

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data: {
    title?: string
    content?: string
    category?: string
    tags?: string
    isActive?: boolean
    priority?: number
  } = {}

  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title too long (max 200 chars)' }, { status: 400 })
    }
    data.title = title
  }

  if (typeof body.content === 'string') {
    if (!body.content.trim()) {
      return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 })
    }
    if (body.content.length > 16000) {
      return NextResponse.json(
        { error: 'Content too long (max 16000 chars)' },
        { status: 400 },
      )
    }
    data.content = body.content
  }

  if (typeof body.category === 'string') {
    const cat = body.category.trim()
    data.category = VALID_CATEGORIES.has(cat) ? cat : 'general'
  }

  if (body.tags !== undefined) {
    const tags = sanitizeTags(body.tags)
    data.tags = JSON.stringify(tags)
  }

  if (typeof body.isActive === 'boolean') {
    data.isActive = body.isActive
  }

  if (body.priority !== undefined) {
    const raw =
      typeof body.priority === 'number'
        ? body.priority
        : typeof body.priority === 'string'
          ? Number.parseInt(body.priority, 10)
          : Number.NaN
    if (!Number.isFinite(raw)) {
      return NextResponse.json({ error: 'Priority must be a number' }, { status: 400 })
    }
    data.priority = Math.max(-100, Math.min(100, raw))
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update (title, content, category, tags, isActive, priority)' },
      { status: 400 },
    )
  }

  try {
    const updated = await db.knowledgeArticle.update({
      where: { id },
      data,
    })
    await db.log.create({
      data: {
        category: 'frontend',
        level: 'info',
        message: `Knowledge Base article updated: "${updated.title}"`,
        meta: JSON.stringify({ id, fields: Object.keys(data), user: user.username }),
      },
    })
    return NextResponse.json({ ok: true, article: toItem(updated) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ------------------------------------------------------------
// DELETE — remove article (admin only)
// ------------------------------------------------------------
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canManageKnowledgeBase')) {
    return NextResponse.json(
      { error: 'You need admin role to manage knowledge base articles' },
      { status: 403 },
    )
  }

  const { id } = await params

  try {
    const deleted = await db.knowledgeArticle.delete({ where: { id } })
    await db.log.create({
      data: {
        category: 'frontend',
        level: 'info',
        message: `Knowledge Base article deleted: "${deleted.title}"`,
        meta: JSON.stringify({ id, user: user.username }),
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

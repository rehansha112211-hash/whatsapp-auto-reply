// ============================================================
// Tags [id] API — update / delete a single tag
//
// PUT    /api/tags/[id]   body: { name?, color? } → TagItem
// DELETE /api/tags/[id]   → { ok: true }  (cascades to ContactTag)
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { TagItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_COLORS = [
  'emerald',
  'amber',
  'rose',
  'sky',
  'violet',
  'zinc',
  'orange',
  'teal',
] as const

type ColorKey = (typeof VALID_COLORS)[number]

function isColorKey(v: string): v is ColorKey {
  return (VALID_COLORS as readonly string[]).includes(v)
}

function mapTag(t: { id: string; name: string; color: string }): TagItem {
  return { id: t.id, name: t.name, color: t.color }
}

interface UpdateTagBody {
  name?: unknown
  color?: unknown
}

// ------------------------------------------------------------
// PUT — update tag name and/or color
// ------------------------------------------------------------
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: UpdateTagBody
  try {
    body = (await req.json()) as UpdateTagBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data: { name?: string; color?: string } = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 40)
    if (name.length === 0) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    }
    data.name = name
  }
  if (typeof body.color === 'string') {
    if (!isColorKey(body.color)) {
      return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
    }
    data.color = body.color as ColorKey
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update (name, color)' },
      { status: 400 },
    )
  }

  // If renaming, ensure no name collision with another tag.
  if (data.name) {
    const clash = await db.tag.findFirst({
      where: { name: { equals: data.name }, NOT: { id } },
    })
    if (clash) {
      return NextResponse.json(
        { error: `Tag "${clash.name}" already exists` },
        { status: 409 },
      )
    }
  }

  try {
    const tag = await db.tag.update({ where: { id }, data })
    return NextResponse.json(mapTag(tag))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Tag name must be unique' }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ------------------------------------------------------------
// DELETE — remove a tag (cascades to ContactTag)
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
    await db.tag.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

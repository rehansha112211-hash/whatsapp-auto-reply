// ============================================================
// Contact tags API — list / add / remove tags on a contact
//
// GET    /api/contacts/[id]/tags                → { items: TagItem[] }
// POST   /api/contacts/[id]/tags   body: { tagId } | { name }
//        → { items: TagItem[] }   (full updated set)
//        When `name` is provided, the tag is created if it does not exist.
// DELETE /api/contacts/[id]/tags?tagId=X        → { ok: true }
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

// ------------------------------------------------------------
// GET — list tags for a contact
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

  const contact = await db.contact.findUnique({
    where: { id },
    select: {
      tags: {
        orderBy: [{ tag: { name: 'asc' } }],
        select: { tag: { select: { id: true, name: true, color: true } } },
      },
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const items: TagItem[] = contact.tags.map((ct) => mapTag(ct.tag))
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — add a tag to a contact (by tagId, or by name with create-if-not-exists)
// ------------------------------------------------------------
interface AddTagBody {
  tagId?: unknown
  name?: unknown
  color?: unknown
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

  let body: AddTagBody
  try {
    body = (await req.json()) as AddTagBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let tagId: string | null = null

  if (typeof body.tagId === 'string' && body.tagId.trim().length > 0) {
    tagId = body.tagId.trim()
  } else if (typeof body.name === 'string' && body.name.trim().length > 0) {
    const name = body.name.trim().slice(0, 40)
    const color: ColorKey =
      typeof body.color === 'string' && isColorKey(body.color) ? body.color : 'emerald'
    // Upsert by name — create-if-not-exists
    const tag = await db.tag.upsert({
      where: { name },
      update: {},
      create: { name, color },
    })
    tagId = tag.id
  } else {
    return NextResponse.json(
      { error: 'Either tagId or name is required' },
      { status: 400 },
    )
  }

  // Validate contact exists
  const contact = await db.contact.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Validate tag exists (defensive — should always be true here)
  const tag = await db.tag.findUnique({ where: { id: tagId } })
  if (!tag) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Upsert the join row (idempotent)
  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId: id, tagId } },
    update: {},
    create: { contactId: id, tagId },
  })

  // Return the full updated set of tags for this contact
  const updated = await db.contact.findUnique({
    where: { id },
    select: {
      tags: {
        orderBy: [{ tag: { name: 'asc' } }],
        select: { tag: { select: { id: true, name: true, color: true } } },
      },
    },
  })

  const items: TagItem[] = (updated?.tags ?? []).map((ct) => mapTag(ct.tag))
  return NextResponse.json({ items }, { status: 201 })
}

// ------------------------------------------------------------
// DELETE — remove a tag from a contact (?tagId=X)
// ------------------------------------------------------------
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const tagId = (searchParams.get('tagId') ?? '').trim()

  if (!tagId) {
    return NextResponse.json({ error: 'tagId query param is required' }, { status: 400 })
  }

  try {
    await db.contactTag.delete({
      where: { contactId_tagId: { contactId: id, tagId } },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // P2025 = record not found → treat as success (idempotent)
    if (!message.includes('P2025') && !message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

// ============================================================
// Tags API — conversation labels (urgent, follow-up, vip, …)
//
// GET  /api/tags           → { items: TagWithCount[] }
// POST /api/tags           body: { name, color } → TagItem
//
// On the first GET, if no tags exist, 5 default tags are seeded:
//   Urgent (rose), Follow-up (amber), VIP (violet), Closed (zinc), Hot Lead (emerald)
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { TagItem, TagWithCount } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Valid color keys; must match TAG_COLORS in src/lib/format.ts
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

const DEFAULT_TAGS: { name: string; color: ColorKey }[] = [
  { name: 'Urgent', color: 'rose' },
  { name: 'Follow-up', color: 'amber' },
  { name: 'VIP', color: 'violet' },
  { name: 'Closed', color: 'zinc' },
  { name: 'Hot Lead', color: 'emerald' },
]

// Ensure the default tag set exists. Runs once (when no tags exist).
async function ensureDefaultTags(): Promise<void> {
  const count = await db.tag.count()
  if (count > 0) return
  // SQLite's Prisma adapter doesn't support `skipDuplicates` on createMany,
  // but we've already short-circuited above when any tag exists, so a plain
  // createMany is safe here.
  await db.tag.createMany({
    data: DEFAULT_TAGS.map((t) => ({ name: t.name, color: t.color })),
  })
}

// ------------------------------------------------------------
// GET — list all tags with contact counts (auto-seeds defaults)
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureDefaultTags()

  const tags = await db.tag.findMany({
    orderBy: [{ name: 'asc' }],
    include: { _count: { select: { contacts: true } } },
  })

  const items: TagWithCount[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    contactCount: t._count.contacts,
  }))

  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create a tag
// ------------------------------------------------------------
interface CreateTagBody {
  name?: unknown
  color?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateTagBody
  try {
    body = (await req.json()) as CreateTagBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const name = body.name.trim().slice(0, 40)
  if (name.length === 0) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
  }

  const color: ColorKey =
    typeof body.color === 'string' && isColorKey(body.color) ? body.color : 'emerald'

  // Check for an existing tag with the same name (case-insensitive unique)
  const existing = await db.tag.findFirst({
    where: { name: { equals: name } },
  })
  if (existing) {
    return NextResponse.json(
      { error: `Tag "${existing.name}" already exists`, tag: mapTag(existing) },
      { status: 409 },
    )
  }

  try {
    const tag = await db.tag.create({ data: { name, color } })
    return NextResponse.json(mapTag(tag), { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Tag name must be unique' }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

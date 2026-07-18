// ============================================================
// Templates API
//
// GET    /api/templates                  → { items: Template[] }
//   Lists all reusable message templates. Seeds 4 QorvixNode-branded
//   defaults (greeting / promotion / followup / support) on first call
//   so the page never starts empty.
//
// POST   /api/templates                  body: { id?, name, body, category }
//   Upsert a template. If `id` is present and exists, update it;
//   otherwise create a new one.
//
// DELETE /api/templates?id=<id>          → { ok: true }
//   Deletes a template by id.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Category = 'greeting' | 'promotion' | 'followup' | 'support' | 'general'

const VALID_CATEGORIES: readonly Category[] = [
  'greeting',
  'promotion',
  'followup',
  'support',
  'general',
] as const

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (VALID_CATEGORIES as readonly string[]).includes(v)
}

interface TemplateRow {
  id: string
  name: string
  body: string
  category: string
  createdAt: string
  updatedAt: string
}

function toRow(t: {
  id: string
  name: string
  body: string
  category: string
  createdAt: Date
  updatedAt: Date
}): TemplateRow {
  return {
    id: t.id,
    name: t.name,
    body: t.body,
    category: t.category,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

// ------------------------------------------------------------
// Default seed templates (QorvixNode branded)
// ------------------------------------------------------------
const SEED_TEMPLATES: Array<{ name: string; body: string; category: Category }> = [
  {
    name: 'Welcome Greeting',
    category: 'greeting',
    body:
      'Hi {name}! 👋 Thanks for reaching out to QorvixNode Technologies. We build custom websites, Android apps, AI automation, CRMs and business software. How can we help you today?',
  },
  {
    name: 'Festive Offer',
    category: 'promotion',
    body:
      'Hi {name}! 🎉 QorvixNode Technologies is running a limited-time offer — 20% off all new website & app development projects this month. Reply YES to book a free consultation.',
  },
  {
    name: 'Follow-up After Quote',
    category: 'followup',
    body:
      'Hi {name}, just following up on the proposal we shared for your project. Do you have any questions, or would you like to move forward? Our team is ready to start immediately. — QorvixNode Technologies',
  },
  {
    name: 'Support Response',
    category: 'support',
    body:
      'Hi {name}, thanks for reaching support. We\'ve received your request and a QorvixNode engineer will get back to you within 2 business hours. For urgent issues, reply URGENT. Reference ID: {ref}.',
  },
]

async function ensureSeedTemplates() {
  const count = await db.template.count()
  if (count > 0) return
  await db.template.createMany({ data: SEED_TEMPLATES })
}

// ------------------------------------------------------------
// GET — list all templates (with seeding)
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureSeedTemplates()

  const rows = await db.template.findMany({
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
  })
  const items = rows.map(toRow)
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create or update a template (upsert)
// ------------------------------------------------------------
interface PostBody {
  id?: unknown
  name?: unknown
  body?: unknown
  category?: unknown
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

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const category: Category = isCategory(body.category) ? body.category : 'general'

  if (!name) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ error: 'Template body is required' }, { status: 400 })
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: 'Template body too long (max 4000 chars)' },
      { status: 400 },
    )
  }

  let template
  if (id) {
    const existing = await db.template.findUnique({ where: { id } })
    if (existing) {
      template = await db.template.update({
        where: { id },
        data: { name, body: text, category },
      })
    } else {
      template = await db.template.create({
        data: { id, name, body: text, category },
      })
    }
  } else {
    template = await db.template.create({
      data: { name, body: text, category },
    })
  }

  return NextResponse.json({ ok: true, template: toRow(template) })
}

// ------------------------------------------------------------
// DELETE — remove a template by id
// ------------------------------------------------------------
export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = (searchParams.get('id') ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }

  const existing = await db.template.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  await db.template.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

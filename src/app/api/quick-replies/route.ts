// ============================================================
// Quick Replies API — composer snippets with slash shortcuts
//
// GET    /api/quick-replies                  → { items: QuickReply[] }
//   Lists all quick replies, sorted by category then shortcut.
//   Auto-seeds 6 QorvixNode-branded defaults on first call so
//   the composer never starts empty.
//
// POST   /api/quick-replies                  body: { shortcut, title, body, category }
//   Creates a new quick reply. Shortcut must be unique + alphanumeric.
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
// Default seed quick replies (QorvixNode branded)
// ------------------------------------------------------------
const SEED_QUICK_REPLIES: Array<{
  shortcut: string
  title: string
  body: string
  category: Category
}> = [
  {
    shortcut: 'hi',
    title: 'Greeting',
    category: 'greeting',
    body: 'Hi! 👋 Thanks for reaching out to QorvixNode Technologies. How can I help you today?',
  },
  {
    shortcut: 'price',
    title: 'Pricing',
    category: 'pricing',
    body: 'Our pricing depends on your requirements. Could you share more details about your project so I can give you an accurate quote?',
  },
  {
    shortcut: 'hours',
    title: 'Business Hours',
    category: 'hours',
    body: "We're available Mon-Sat, 9:00 AM to 7:00 PM IST. We'll get back to you during business hours. 🙏",
  },
  {
    shortcut: 'website',
    title: 'Share Website',
    category: 'general',
    body: 'You can check our portfolio and services here: https://qorvixnodetechnologies.indevs.in',
  },
  {
    shortcut: 'owner',
    title: 'Forward to Owner',
    category: 'support',
    body: "I've forwarded your request to our team. They'll reach out to you shortly. Thank you for your patience! 🙏",
  },
  {
    shortcut: 'thanks',
    title: 'Thank You',
    category: 'greeting',
    body: 'Thank you for choosing QorvixNode Technologies! We look forward to working with you. 🚀',
  },
]

async function ensureSeedQuickReplies() {
  const count = await db.quickReply.count()
  if (count > 0) return
  await db.quickReply.createMany({ data: SEED_QUICK_REPLIES })
}

// ------------------------------------------------------------
// GET — list all quick replies (with seeding)
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureSeedQuickReplies()

  const rows = await db.quickReply.findMany({
    orderBy: [{ category: 'asc' }, { shortcut: 'asc' }],
  })
  const items = rows.map(toRow)
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create a new quick reply
// ------------------------------------------------------------
interface PostBody {
  shortcut?: unknown
  title?: unknown
  body?: unknown
  category?: unknown
}

const SHORTCUT_RE = /^[a-zA-Z0-9_]+$/

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

  const shortcut = typeof body.shortcut === 'string' ? body.shortcut.trim() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const category: Category = isCategory(body.category) ? body.category : 'general'

  if (!shortcut) {
    return NextResponse.json({ error: 'Shortcut is required' }, { status: 400 })
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
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (title.length > 120) {
    return NextResponse.json(
      { error: 'Title too long (max 120 chars)' },
      { status: 400 },
    )
  }
  if (!text) {
    return NextResponse.json({ error: 'Body is required' }, { status: 400 })
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: 'Body too long (max 4000 chars)' },
      { status: 400 },
    )
  }

  const conflict = await db.quickReply.findUnique({ where: { shortcut } })
  if (conflict) {
    return NextResponse.json(
      { error: `Shortcut "/${shortcut}" already exists` },
      { status: 409 },
    )
  }

  const created = await db.quickReply.create({
    data: { shortcut, title, body: text, category },
  })

  return NextResponse.json({ ok: true, quickReply: toRow(created) }, { status: 201 })
}

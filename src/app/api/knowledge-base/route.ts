// ============================================================
// Knowledge Base API
//
// GET    /api/knowledge-base
//   Query params:
//     · category  — filter by category (pricing | services | policies | faq | general)
//     · search    — full-text search across title + content
//     · activeOnly=1 — only return active articles
//   Returns { items: KnowledgeArticleItem[] } sorted by priority DESC
//   then updatedAt DESC. If the table is empty, the first GET
//   auto-seeds 5 default articles (pricing, services, refund,
//   timeline, support hours) so the AI engine has context out of
//   the box.
//
// POST   /api/knowledge-base   body: { title, content, category?, tags?, isActive?, priority? }
//   Admin only (canManageKnowledgeBase). Creates a new article.
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

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
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
// Default articles — auto-seeded on first access so the AI engine
// has real company context out of the box.
// ------------------------------------------------------------
const DEFAULT_ARTICLES: Array<{
  title: string
  content: string
  category: string
  tags: string[]
  priority: number
}> = [
  {
    title: 'Pricing Guidelines',
    category: 'pricing',
    priority: 90,
    tags: ['pricing', 'cost', 'quote', 'budget'],
    content: `# Pricing Guidelines

Typical project cost ranges (in INR):

- **Portfolio / Landing page website**: ₹15,000 – ₹35,000
- **Custom business website (multi-page)**: ₹25,000 – ₹50,000
- **E-commerce website**: ₹40,000 – ₹80,000
- **Android app (basic)**: ₹30,000 – ₹80,000
- **Android app (complex, backend, integrations)**: ₹80,000 – ₹2,00,000
- **CRM / business software**: ₹40,000 – ₹80,000 (and up)
- **AI automation / WhatsApp bot**: ₹20,000 – ₹1,00,000 depending on complexity
- **Maintenance / support**: from ₹5,000 / month

Rules:
1. Always say pricing DEPENDS ON REQUIREMENTS — never commit to a fixed price without understanding scope.
2. Ask 1–2 clarifying questions to scope the project (features, timeline, integrations).
3. Mention that a detailed quote is shared after the discovery call.
4. For very small budgets, suggest a phased approach (MVP first, features later).
5. We offer flexible payment terms — typically 50% advance, 50% on delivery.`,
  },
  {
    title: 'Our Services',
    category: 'services',
    priority: 85,
    tags: ['services', 'offerings', 'what we do'],
    content: `# Our Services

QorvixNode Technologies is a software development company. We offer:

- Custom Website Development (business, portfolio, landing pages)
- E-Commerce Website Development
- Android App Development (native + cross-platform)
- CRM Development & Business Software
- AI Automation (chatbots, WhatsApp auto-reply, workflow automation)
- Dashboard & Admin Panel Development
- UI/UX Design
- API Integration & Third-party services
- Hosting & Deployment assistance
- Ongoing Maintenance & Support

Key differentiators:
- End-to-end delivery (design, build, deploy, maintain)
- Modern stack (Next.js, React, Node, Prisma, TypeScript)
- WhatsApp-first customer engagement
- Post-launch support included for the first 30 days

Website: https://qorvixnodetechnologies.indevs.in`,
  },
  {
    title: 'Refund Policy',
    category: 'policies',
    priority: 70,
    tags: ['refund', 'cancellation', 'policy'],
    content: `# Refund & Cancellation Policy

1. **Advance payment**: Typically 50% advance before work starts. This is non-refundable once development has begun, as it covers discovery + initial design.
2. **Before work starts**: If a project is cancelled before any work has begun, the advance is refunded minus a 10% processing fee.
3. **During development**: Refunds are calculated on a pro-rata basis for work completed. The client receives the work product delivered up to the cancellation date.
4. **After delivery**: Once the project is delivered and accepted, no refunds apply. Bugs are fixed free of charge during the 30-day support window.
5. **Maintenance plans**: Refundable on a pro-rata basis for unused full months.
6. **Disputes**: Email the team — we resolve disputes in good faith within 7 business days.

Always tell the customer: "Our team will review your specific case and respond within 7 business days. Please share your project details or invoice number."`,
  },
  {
    title: 'Project Timeline',
    category: 'faq',
    priority: 60,
    tags: ['timeline', 'delivery', 'how long', 'deadline'],
    content: `# Project Timeline (typical delivery)

- **Landing page / portfolio website**: 5–10 business days
- **Custom business website (5–10 pages)**: 2–4 weeks
- **E-commerce website**: 3–6 weeks
- **Android app (basic, no backend)**: 3–5 weeks
- **Android app (with backend, integrations)**: 6–12 weeks
- **CRM / business software**: 6–10 weeks
- **AI automation / bot**: 1–4 weeks depending on scope

Notes:
- Timelines start AFTER the advance payment and final requirements are confirmed.
- Client review rounds can extend timelines — share this expectation.
- Rush delivery (within 50% of normal timeline) may attract a 25–40% rush fee.
- We provide a milestone schedule with every quote.`,
  },
  {
    title: 'Support Hours & Response SLA',
    category: 'faq',
    priority: 75,
    tags: ['hours', 'support', 'sla', 'response time'],
    content: `# Support Hours & Response SLA

Business hours: Monday – Saturday, 9:00 AM – 7:00 PM IST.
Sunday: Closed (emergency-only for active maintenance clients).

Response SLA (during business hours):
- WhatsApp messages: within 1–2 hours
- Email: within 4 hours
- Bug reports (production-down): within 30 minutes for active maintenance clients

After-hours:
- Messages received outside business hours are answered the next business day.
- Critical production-down issues for active maintenance clients are handled 24/7.

Free post-launch support window: 30 days from delivery (bug fixes only).
Ongoing maintenance plans start at ₹5,000 / month.`,
  },
]

async function seedDefaultsIfEmpty(): Promise<void> {
  const count = await db.knowledgeArticle.count()
  if (count > 0) return
  for (const a of DEFAULT_ARTICLES) {
    await db.knowledgeArticle.create({
      data: {
        title: a.title,
        content: a.content,
        category: a.category,
        tags: JSON.stringify(a.tags),
        isActive: true,
        priority: a.priority,
      },
    })
  }
  await db.log.create({
    data: {
      category: 'startup',
      level: 'info',
      message: `Knowledge Base auto-seeded with ${DEFAULT_ARTICLES.length} default articles`,
      meta: JSON.stringify({ titles: DEFAULT_ARTICLES.map((a) => a.title) }),
    },
  })
}

// ------------------------------------------------------------
// GET — list (and auto-seed on first access)
// ------------------------------------------------------------
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await seedDefaultsIfEmpty()
  } catch (err) {
    // Non-fatal — continue with whatever's in the DB.
    await db.log
      .create({
        data: {
          category: 'database',
          level: 'warn',
          message: `Knowledge Base auto-seed failed: ${(err as Error).message}`,
          meta: '',
        },
      })
      .catch(() => {})
  }

  const url = new URL(req.url)
  const category = url.searchParams.get('category')?.trim() || ''
  const search = url.searchParams.get('search')?.trim() || ''
  const activeOnly = url.searchParams.get('activeOnly') === '1'

  const where: {
    category?: string
    isActive?: boolean
    OR?: Array<{ title?: { contains: string }; content?: { contains: string } }>
  } = {}
  if (category && VALID_CATEGORIES.has(category)) where.category = category
  if (activeOnly) where.isActive = true
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { content: { contains: search } },
    ]
  }

  const rows = await db.knowledgeArticle.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const items = rows.map(toItem)
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create article (admin only)
// ------------------------------------------------------------
interface CreateBody {
  title?: unknown
  content?: unknown
  category?: unknown
  tags?: unknown
  isActive?: unknown
  priority?: unknown
}

export async function POST(req: Request) {
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

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content : ''
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (title.length > 200) {
    return NextResponse.json({ error: 'Title too long (max 200 chars)' }, { status: 400 })
  }
  if (!content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }
  if (content.length > 16000) {
    return NextResponse.json(
      { error: 'Content too long (max 16000 chars)' },
      { status: 400 },
    )
  }

  const rawCategory =
    typeof body.category === 'string' ? body.category.trim() : 'general'
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'general'

  const tags = sanitizeTags(body.tags)
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : true
  const priorityRaw =
    typeof body.priority === 'number' && Number.isFinite(body.priority)
      ? body.priority
      : typeof body.priority === 'string'
        ? Number.parseInt(body.priority, 10)
        : 0
  const priority = Number.isFinite(priorityRaw)
    ? Math.max(-100, Math.min(100, priorityRaw))
    : 0

  const created = await db.knowledgeArticle.create({
    data: {
      title,
      content,
      category,
      tags: JSON.stringify(tags),
      isActive,
      priority,
    },
  })

  await db.log.create({
    data: {
      category: 'frontend',
      level: 'info',
      message: `Knowledge Base article created: "${title}"`,
      meta: JSON.stringify({ id: created.id, category, user: user.username }),
    },
  })

  return NextResponse.json({ ok: true, article: toItem(created) })
}

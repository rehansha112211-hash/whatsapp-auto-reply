// ============================================================
// Leads CSV export
// GET /api/leads/export?search=&category=&minScore=&sort=&status=
// Returns text/csv with Content-Disposition attachment header.
// Uses the same filtering logic as /api/leads.
// ============================================================
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { toCsv } from '@/lib/format'
import type { LeadRow, LeadCategory } from '@/lib/types'

export const dynamic = 'force-dynamic'

type SortKey = 'score_desc' | 'score_asc' | 'recent' | 'oldest' | 'name_asc'

const SORT_OPTIONS: Record<SortKey, Record<string, 'asc' | 'desc'>> = {
  score_desc: { leadScore: 'desc' },
  score_asc: { leadScore: 'asc' },
  recent: { lastMessageAt: 'desc' },
  oldest: { lastMessageAt: 'asc' },
  name_asc: { name: 'asc' },
}

const VALID_STATUSES = ['all', 'lead', 'active', 'customer', 'new'] as const
const VALID_CATEGORIES = [
  'all',
  'website',
  'app',
  'crm',
  'software',
  'ai_automation',
  'maintenance',
  'general',
  'support',
  'high_priority',
] as const

function isSortKey(v: string | null): v is SortKey {
  return v !== null && Object.prototype.hasOwnProperty.call(SORT_OPTIONS, v)
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const categoryRaw = searchParams.get('category') ?? 'all'
  const category: string = VALID_CATEGORIES.includes(categoryRaw as (typeof VALID_CATEGORIES)[number])
    ? categoryRaw
    : 'all'
  const minScoreRaw = Number(searchParams.get('minScore') ?? 0)
  const minScore = Number.isFinite(minScoreRaw) ? Math.max(0, Math.min(100, Math.floor(minScoreRaw))) : 0
  const sortRaw = searchParams.get('sort') ?? 'score_desc'
  const sort: SortKey = isSortKey(sortRaw) ? sortRaw : 'score_desc'
  const statusRaw = searchParams.get('status') ?? 'all'
  const status: string = VALID_STATUSES.includes(statusRaw as (typeof VALID_STATUSES)[number])
    ? statusRaw
    : 'all'

  const where: {
    leadScore: { gte: number }
    status?: string
  } = {
    leadScore: { gte: minScore },
  }
  if (status !== 'all') where.status = status

  const contacts = await db.contact.findMany({
    where,
    orderBy: SORT_OPTIONS[sort],
    include: {
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: { text: true, timestamp: true },
      },
    },
  })

  // --- Fetch latest LeadScore per contact (most recent createdAt wins) ---
  const contactIds = contacts.map((c) => c.id)
  const leadScoreRows = contactIds.length
    ? await db.leadScore.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: [{ contactId: 'asc' }, { createdAt: 'desc' }],
        select: { contactId: true, category: true, notified: true, createdAt: true },
      })
    : []

  const latestScoreByContact = new Map<
    string,
    { category: string; notified: boolean }
  >()
  for (const ls of leadScoreRows) {
    if (!latestScoreByContact.has(ls.contactId)) {
      latestScoreByContact.set(ls.contactId, {
        category: ls.category,
        notified: ls.notified,
      })
    }
  }

  let rows: LeadRow[] = contacts.map((c) => {
    const lastMsg = c.messages[0]
    const latestScore = latestScoreByContact.get(c.id)
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      detectedService: c.detectedService || '—',
      leadScore: c.leadScore,
      status: c.status,
      lastMessage: lastMsg?.text ?? '',
      lastMessageAt: lastMsg?.timestamp.toISOString() ?? c.lastMessageAt?.toISOString() ?? null,
      category: latestScore?.category ?? 'general',
      notified: latestScore?.notified ?? false,
    }
  })

  if (category !== 'all') {
    rows = rows.filter((r) => r.category === (category as LeadCategory | 'all'))
  }
  if (search) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.phone.toLowerCase().includes(search) ||
        r.lastMessage.toLowerCase().includes(search),
    )
  }

  const csvRows = rows.map((r) => ({
    Name: r.name,
    Phone: r.phone,
    Service: r.detectedService,
    Category: r.category,
    LeadScore: r.leadScore,
    Status: r.status,
    LastMessage: r.lastMessage,
    LastMessageAt: r.lastMessageAt ?? '',
    Notified: r.notified ? 'yes' : 'no',
  }))

  const csv = toCsv(csvRows)

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads.csv"',
      'Cache-Control': 'no-store',
    },
  })
}

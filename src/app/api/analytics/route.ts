import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Analytics payload types — every value below is computed from real DB rows.
// ---------------------------------------------------------------------------
interface OverviewPayload {
  totalContacts: number
  totalMessages: number
  aiReplies: number
  ownerReplies: number
  avgResponseMs: number
  conversionRate: number
  hotLeadRate: number
}

interface ResponseTrendPoint {
  date: string
  avgMs: number
}

interface AiVsOwnerPoint {
  day: string
  ai: number
  owner: number
}

interface PeakHourPoint {
  hour: string
  count: number
}

interface FunnelStage {
  stage: string
  count: number
}

interface CategoryBreakdownRow {
  category: string
  count: number
  avgScore: number
}

interface TopContactRow {
  id: string
  name: string
  phone: string
  leadScore: number
  messageCount: number
  lastMessageAt: string | null
}

interface GrowthTrendPoint {
  date: string
  newContacts: number
  newMessages: number
}

interface LanguageRow {
  language: string
  count: number
}

interface AnalyticsPayload {
  overview: OverviewPayload
  responseTimeTrend: ResponseTrendPoint[]
  aiVsOwner: AiVsOwnerPoint[]
  peakHours: PeakHourPoint[]
  leadFunnel: FunnelStage[]
  categoryBreakdown: CategoryBreakdownRow[]
  topContacts: TopContactRow[]
  growthTrend: GrowthTrendPoint[]
  languageDistribution: LanguageRow[]
}

// Short month-day string (e.g. "Jul 11")
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Parse the AI-engine log message for the response time in milliseconds.
//   Format: "AI replied to {name} in {responseMs}ms (model {model})"
// Falls back to the meta JSON if it ever carries a `responseMs` field.
function parseResponseMs(message: string, meta: string): number | null {
  const m = /in\s+(\d+)\s*ms/i.exec(message)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 0) return n
  }
  if (meta) {
    try {
      const parsed = JSON.parse(meta) as Record<string, unknown>
      const v = parsed['responseMs']
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
      if (typeof v === 'string') {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 0) return n
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return null
}

function dayBuckets(days: number): { start: Date; end: Date }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out: { start: Date; end: Date }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today)
    start.setDate(start.getDate() - i)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    out.push({ start, end })
  }
  return out
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ---- Overview counters -------------------------------------------------
  const [
    totalContacts,
    totalMessages,
    aiReplies,
    ownerReplies,
    customerCount,
    hotLeadCount,
    aiLogs,
    allMessages,
    allContactsForFunnel,
    allContactsForCategory,
    allContactsForLanguage,
    growthContacts,
    growthMessages,
  ] = await Promise.all([
    db.contact.count(),
    db.message.count(),
    db.message.count({ where: { direction: 'outgoing', source: 'ai' } }),
    db.message.count({ where: { direction: 'outgoing', source: 'owner' } }),
    db.contact.count({ where: { status: 'customer' } }),
    db.contact.count({ where: { leadScore: { gte: 70 } } }),
    db.log.findMany({
      where: { category: 'ai' },
      select: { message: true, meta: true, createdAt: true },
    }),
    db.message.findMany({
      select: { timestamp: true, direction: true, source: true, contactId: true },
    }),
    db.contact.findMany({
      select: { id: true, leadScore: true, status: true },
    }),
    db.contact.findMany({
      select: { detectedService: true, leadScore: true },
    }),
    db.contact.findMany({
      select: { language: true },
    }),
    db.contact.findMany({
      where: { createdAt: { gte: dayBuckets(14)[0]!.start } },
      select: { createdAt: true },
    }),
    db.message.findMany({
      where: { timestamp: { gte: dayBuckets(14)[0]!.start } },
      select: { timestamp: true },
    }),
  ])

  // ---- avgResponseMs (overall) ------------------------------------------
  let sumMs = 0
  let msCount = 0
  for (const log of aiLogs) {
    const ms = parseResponseMs(log.message, log.meta)
    if (ms !== null) {
      sumMs += ms
      msCount += 1
    }
  }
  const avgResponseMs = msCount > 0 ? Math.round(sumMs / msCount) : 0

  // ---- responseTimeTrend (last 7 days) ----------------------------------
  const sevenDayBuckets = dayBuckets(7)
  const responseTimeTrend: ResponseTrendPoint[] = sevenDayBuckets.map(({ start, end }) => {
    let daySum = 0
    let dayCount = 0
    for (const log of aiLogs) {
      const ts = log.createdAt
      if (ts >= start && ts < end) {
        const ms = parseResponseMs(log.message, log.meta)
        if (ms !== null) {
          daySum += ms
          dayCount += 1
        }
      }
    }
    return {
      date: shortDate(start),
      avgMs: dayCount > 0 ? Math.round(daySum / dayCount) : 0,
    }
  })

  // ---- aiVsOwner (last 7 days) ------------------------------------------
  const aiVsOwner: AiVsOwnerPoint[] = sevenDayBuckets.map(({ start, end }) => {
    let ai = 0
    let owner = 0
    for (const m of allMessages) {
      if (m.direction !== 'outgoing') continue
      if (m.timestamp >= start && m.timestamp < end) {
        if (m.source === 'ai') ai += 1
        else if (m.source === 'owner') owner += 1
      }
    }
    return { day: WEEKDAYS[start.getDay()] ?? '', ai, owner }
  })

  // ---- peakHours (24 buckets) -------------------------------------------
  const hourBuckets = Array.from({ length: 24 }, () => 0)
  for (const m of allMessages) {
    const h = m.timestamp.getHours()
    if (h >= 0 && h <= 23) hourBuckets[h]! += 1
  }
  const peakHours: PeakHourPoint[] = hourBuckets.map((count, hour) => ({
    hour: String(hour).padStart(2, '0'),
    count,
  }))

  // ---- leadFunnel --------------------------------------------------------
  // Stage 2 (Engaged) requires message counts per contact — compute from
  // allMessages in-memory.
  const msgCountByContact = new Map<string, number>()
  for (const m of allMessages) {
    msgCountByContact.set(m.contactId, (msgCountByContact.get(m.contactId) ?? 0) + 1)
  }
  let engagedCount = 0
  let leadsCount = 0
  let hotLeadsCount = 0
  let customersCount = 0
  for (const c of allContactsForFunnel) {
    const mc = msgCountByContact.get(c.id) ?? 0
    if (mc > 1) engagedCount += 1
    if (c.leadScore >= 25) leadsCount += 1
    if (c.leadScore >= 70) hotLeadsCount += 1
    if (c.status === 'customer') customersCount += 1
  }
  const leadFunnel: FunnelStage[] = [
    { stage: 'Total Contacts', count: totalContacts },
    { stage: 'Engaged (msg>1)', count: engagedCount },
    { stage: 'Leads (score≥25)', count: leadsCount },
    { stage: 'Hot Leads (≥70)', count: hotLeadsCount },
    { stage: 'Customers', count: customersCount },
  ]

  // ---- categoryBreakdown -------------------------------------------------
  const catMap = new Map<string, { count: number; scoreSum: number }>()
  for (const c of allContactsForCategory) {
    const key = (c.detectedService || '').trim() || 'unknown'
    const entry = catMap.get(key) ?? { count: 0, scoreSum: 0 }
    entry.count += 1
    entry.scoreSum += c.leadScore ?? 0
    catMap.set(key, entry)
  }
  const categoryBreakdown: CategoryBreakdownRow[] = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      count: v.count,
      avgScore: v.count > 0 ? Math.round(v.scoreSum / v.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // ---- topContacts (top 5 by message count) ------------------------------
  const topContactIds = Array.from(msgCountByContact.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const topContactIdsArr = topContactIds.map(([id]) => id)
  const topContactRows = topContactIdsArr.length
    ? await db.contact.findMany({
        where: { id: { in: topContactIdsArr } },
        select: {
          id: true,
          name: true,
          phone: true,
          leadScore: true,
          lastMessageAt: true,
        },
      })
    : []
  const topContacts: TopContactRow[] = topContactIds
    .map(([id, messageCount]) => {
      const c = topContactRows.find((r) => r.id === id)
      if (!c) return null
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        leadScore: c.leadScore,
        messageCount,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      }
    })
    .filter((r): r is TopContactRow => r !== null)

  // ---- growthTrend (last 14 days) ---------------------------------------
  const fourteenBuckets = dayBuckets(14)
  const growthTrend: GrowthTrendPoint[] = fourteenBuckets.map(({ start, end }) => {
    let newContacts = 0
    let newMessages = 0
    for (const c of growthContacts) {
      if (c.createdAt >= start && c.createdAt < end) newContacts += 1
    }
    for (const m of growthMessages) {
      if (m.timestamp >= start && m.timestamp < end) newMessages += 1
    }
    return { date: shortDate(start), newContacts, newMessages }
  })

  // ---- languageDistribution ---------------------------------------------
  const langMap = new Map<string, number>()
  for (const c of allContactsForLanguage) {
    const key = (c.language || '').trim() || 'unknown'
    langMap.set(key, (langMap.get(key) ?? 0) + 1)
  }
  const languageDistribution: LanguageRow[] = Array.from(langMap.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)

  // ---- overview rates ----------------------------------------------------
  const conversionRate =
    totalContacts > 0 ? Number(((customerCount / totalContacts) * 100).toFixed(1)) : 0
  const hotLeadRate =
    totalContacts > 0 ? Number(((hotLeadCount / totalContacts) * 100).toFixed(1)) : 0

  const payload: AnalyticsPayload = {
    overview: {
      totalContacts,
      totalMessages,
      aiReplies,
      ownerReplies,
      avgResponseMs,
      conversionRate,
      hotLeadRate,
    },
    responseTimeTrend,
    aiVsOwner,
    peakHours,
    leadFunnel,
    categoryBreakdown,
    topContacts,
    growthTrend,
    languageDistribution,
  }
  return NextResponse.json(payload)
}

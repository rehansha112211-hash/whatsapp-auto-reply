// ============================================================
// Sentiment Analytics API
//
// GET /api/sentiment
//   Returns aggregated sentiment analytics for the dashboard:
//     - overview: total counts + percentages by sentiment label
//     - trend: 7-day time series of daily sentiment counts
//     - recentNegative: last 5 negative/urgent messages
//     - byIntent: top intents across all analyzed messages
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface SentimentTrendPoint {
  date: string
  positive: number
  neutral: number
  negative: number
  urgent: number
}

interface RecentNegativeItem {
  messageId: string
  contactId: string
  contactName: string
  text: string
  sentiment: string
  summary: string
  timestamp: string
}

interface IntentCount {
  intent: string
  count: number
}

interface SentimentOverview {
  totalAnalyzed: number
  positive: number
  neutral: number
  negative: number
  urgent: number
  positivePct: number
  negativePct: number
}

interface SentimentResponse {
  overview: SentimentOverview
  trend: SentimentTrendPoint[]
  recentNegative: RecentNegativeItem[]
  byIntent: IntentCount[]
}

// "Jul 11" short label
function shortDate(d: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[d.getMonth()]} ${d.getDate()}`
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ---- 7-day window (local midnight boundaries) ----
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayBuckets: { start: Date; end: Date }[] = []
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today)
    start.setDate(start.getDate() - i)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    dayBuckets.push({ start, end })
  }
  const windowStart = dayBuckets[0]!.start
  const windowEnd = dayBuckets[dayBuckets.length - 1]!.end

  // ---- Pull analyzed incoming messages + recent negative/urgent ----
  const [
    analyzedMessages,
    recentNegativeRaw,
    intentRows,
  ] = await Promise.all([
    db.message.findMany({
      where: {
        direction: 'incoming',
        sentiment: { not: 'unknown' },
        timestamp: { gte: windowStart, lt: windowEnd },
      },
      select: {
        id: true,
        sentiment: true,
        intent: true,
        timestamp: true,
      },
    }),
    db.message.findMany({
      where: {
        direction: 'incoming',
        sentiment: { in: ['negative', 'urgent'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: {
        id: true,
        contactId: true,
        text: true,
        sentiment: true,
        timestamp: true,
        contact: { select: { name: true } },
      },
    }),
    db.sentimentAnalysis.findMany({
      where: { intent: { not: '' } },
      select: { intent: true },
    }),
  ])

  // ---- Overview: counts by sentiment label (7-day window) ----
  const overview: SentimentOverview = {
    totalAnalyzed: analyzedMessages.length,
    positive: 0,
    neutral: 0,
    negative: 0,
    urgent: 0,
    positivePct: 0,
    negativePct: 0,
  }
  for (const m of analyzedMessages) {
    if (m.sentiment === 'positive') overview.positive += 1
    else if (m.sentiment === 'neutral') overview.neutral += 1
    else if (m.sentiment === 'negative') overview.negative += 1
    else if (m.sentiment === 'urgent') overview.urgent += 1
  }
  if (overview.totalAnalyzed > 0) {
    overview.positivePct = Math.round((overview.positive / overview.totalAnalyzed) * 100)
    overview.negativePct = Math.round(((overview.negative + overview.urgent) / overview.totalAnalyzed) * 100)
  }

  // ---- Trend: bucket by day ----
  const trend: SentimentTrendPoint[] = dayBuckets.map((b) => ({
    date: shortDate(b.start),
    positive: 0,
    neutral: 0,
    negative: 0,
    urgent: 0,
  }))
  for (const m of analyzedMessages) {
    const idx = dayBuckets.findIndex(
      (b) => m.timestamp >= b.start && m.timestamp < b.end,
    )
    if (idx === -1) continue
    const point = trend[idx]!
    if (m.sentiment === 'positive') point.positive += 1
    else if (m.sentiment === 'neutral') point.neutral += 1
    else if (m.sentiment === 'negative') point.negative += 1
    else if (m.sentiment === 'urgent') point.urgent += 1
  }

  // ---- Recent negative / urgent messages (with summary lookup) ----
  const recentNegativeIds = recentNegativeRaw.map((m) => m.id)
  const summaries = recentNegativeIds.length
    ? await db.sentimentAnalysis.findMany({
        where: { messageId: { in: recentNegativeIds } },
        select: { messageId: true, summary: true },
      })
    : []
  const summaryMap = new Map<string, string>()
  for (const s of summaries) summaryMap.set(s.messageId, s.summary)

  const recentNegative: RecentNegativeItem[] = recentNegativeRaw.map((m) => ({
    messageId: m.id,
    contactId: m.contactId,
    contactName: m.contact.name,
    text: m.text,
    sentiment: m.sentiment,
    summary: summaryMap.get(m.id) ?? '',
    timestamp: m.timestamp.toISOString(),
  }))

  // ---- By intent: aggregate top 8 intents across all history ----
  const intentCounts = new Map<string, number>()
  for (const r of intentRows) {
    const key = r.intent || 'general'
    intentCounts.set(key, (intentCounts.get(key) ?? 0) + 1)
  }
  const byIntent: IntentCount[] = Array.from(intentCounts.entries())
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const payload: SentimentResponse = {
    overview,
    trend,
    recentNegative,
    byIntent,
  }

  return NextResponse.json(payload)
}

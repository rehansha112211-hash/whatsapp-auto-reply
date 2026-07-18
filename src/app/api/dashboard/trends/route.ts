import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types returned to the dashboard charts
// ---------------------------------------------------------------------------
interface TrendDay {
  date: string
  label: string
  incoming: number
  outgoing: number
  ai: number
  owner: number
  newContacts: number
}

interface CategoryCount {
  category: string
  count: number
}

interface LeadBucket {
  range: string
  count: number
}

interface TrendsResponse {
  days: TrendDay[]
  byCategory: CategoryCount[]
  leadDistribution: LeadBucket[]
}

// Short weekday label (e.g. "Mon")
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Short month-day string (e.g. "Jul 11")
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

  // ---- Build the 7-day window (oldest → newest), local-midnight boundaries ----
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

  // ---- Pull raw rows in the 7-day window in a single query each ----
  // SQLite doesn't do great date grouping, so we aggregate in JS.
  const [messages, newContacts] = await Promise.all([
    db.message.findMany({
      where: { timestamp: { gte: windowStart, lt: windowEnd } },
      select: { direction: true, source: true, timestamp: true },
    }),
    db.contact.findMany({
      where: { createdAt: { gte: windowStart, lt: windowEnd } },
      select: { createdAt: true, detectedService: true, leadScore: true },
    }),
  ])

  // All contacts (regardless of when created) are used for the lead-distribution
  // buckets and the by-category tally so the chart is meaningful even on day 1.
  const allContacts = await db.contact.findMany({
    select: { detectedService: true, leadScore: true },
  })

  // ---- Per-day aggregation ----
  const days: TrendDay[] = dayBuckets.map(({ start, end }) => {
    const inDay = (ts: Date) => ts >= start && ts < end
    let incoming = 0
    let outgoing = 0
    let ai = 0
    let owner = 0
    for (const m of messages) {
      if (!inDay(m.timestamp)) continue
      if (m.direction === 'incoming') incoming += 1
      if (m.direction === 'outgoing') {
        outgoing += 1
        if (m.source === 'ai') ai += 1
        else if (m.source === 'owner') owner += 1
      }
    }
    const newContactsCount = newContacts.filter((c) =>
      inDay(c.createdAt),
    ).length

    return {
      date: shortDate(start),
      label: WEEKDAY_LABELS[start.getDay()] ?? '',
      incoming,
      outgoing,
      ai,
      owner,
      newContacts: newContactsCount,
    }
  })

  // ---- byCategory: count contacts per detectedService ----
  const categoryMap = new Map<string, number>()
  for (const c of allContacts) {
    const key = (c.detectedService || '').trim() || 'unknown'
    categoryMap.set(key, (categoryMap.get(key) ?? 0) + 1)
  }
  const byCategory: CategoryCount[] = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  // ---- leadDistribution: 4 buckets ----
  // Cold 0-24, Warm 25-49, Hot 50-74, Flame 75-100
  const buckets: LeadBucket[] = [
    { range: '0-24', count: 0 },
    { range: '25-49', count: 0 },
    { range: '50-74', count: 0 },
    { range: '75-100', count: 0 },
  ]
  for (const c of allContacts) {
    const s = c.leadScore ?? 0
    if (s <= 24) buckets[0]!.count += 1
    else if (s <= 49) buckets[1]!.count += 1
    else if (s <= 74) buckets[2]!.count += 1
    else buckets[3]!.count += 1
  }

  const payload: TrendsResponse = { days, byCategory, leadDistribution: buckets }
  return NextResponse.json(payload)
}

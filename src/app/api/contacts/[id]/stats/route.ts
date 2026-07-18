// ============================================================
// Contacts API — per-contact conversation statistics
//
// GET /api/contacts/[id]/stats
//   → {
//       overview: {
//         totalMessages, incomingCount, outgoingCount, aiCount, ownerCount,
//         customerInitiated, avgResponseTimeMs, avgCustomerResponseMs,
//         firstMessageAt, lastMessageAt, conversationDuration (days),
//         messagesPerDay, longestStreak,
//       },
//       messageTimeline: [{ date, incoming, outgoing }],  // last 30 days, daily
//       hourlyHeatmap: [{ hour, count }],                  // 24 buckets
//       responseTimes: [{ replyMs, timestamp }],           // last 20 AI reply times
//       dayOfWeekDistribution: [{ day, count }],           // 7 buckets
//       sourceDistribution: [{ source, count }],           // ai | owner | customer
//       conversationFlow: [{ direction, gap_minutes, timestamp }],
//     }
//
// All numbers are computed from real DB rows.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Response payload types
// ---------------------------------------------------------------------------
interface OverviewStats {
  totalMessages: number
  incomingCount: number
  outgoingCount: number
  aiCount: number
  ownerCount: number
  customerInitiated: number
  avgResponseTimeMs: number
  avgCustomerResponseMs: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  conversationDuration: number
  messagesPerDay: number
  longestStreak: number
}

interface TimelinePoint {
  date: string
  incoming: number
  outgoing: number
}

interface HourlyBucket {
  hour: number
  count: number
}

interface ResponseTimePoint {
  replyMs: number
  timestamp: string
}

interface DayOfWeekBucket {
  day: string
  count: number
}

interface SourceBucket {
  source: string
  count: number
}

interface ConversationFlowPoint {
  direction: 'in' | 'out'
  gap_minutes: number
  timestamp: string
}

interface StatsPayload {
  overview: OverviewStats
  messageTimeline: TimelinePoint[]
  hourlyHeatmap: HourlyBucket[]
  responseTimes: ResponseTimePoint[]
  dayOfWeekDistribution: DayOfWeekBucket[]
  sourceDistribution: SourceBucket[]
  conversationFlow: ConversationFlowPoint[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
// JS getDay(): Sun=0..Sat=6 → Mon-first index used by the chart.
const DAY_INDEX_FROM_JS = [6, 0, 1, 2, 3, 4, 5] as const

/**
 * Best-effort extraction of responseMs from an AI-engine log line.
 * The wa-engine writes lines like:
 *   "AI replied to {name} in {responseMs}ms (model {model})"
 * Returns null when nothing parsable is found.
 */
function parseResponseMs(message: string, meta: string): number | null {
  const m = /in\s+(\d+)\s*ms/i.exec(message)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) return n
  }
  if (meta) {
    try {
      const obj = JSON.parse(meta) as { responseMs?: unknown }
      if (typeof obj.responseMs === 'number' && obj.responseMs > 0) {
        return obj.responseMs
      }
    } catch {
      /* meta isn't always JSON — ignore */
    }
  }
  return null
}

/** Format a Date as a short label like "Jul 11". */
function shortMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Convert a Date to a YYYY-MM-DD string in local time. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
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
    select: { id: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Fetch the message timeline + AI logs in parallel.
  const [messages, aiLogs] = await Promise.all([
    db.message.findMany({
      where: { contactId: id },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        direction: true,
        source: true,
        timestamp: true,
      },
    }),
    db.log.findMany({
      where: { contactId: id, category: 'ai' },
      orderBy: { createdAt: 'asc' },
      select: { message: true, meta: true, createdAt: true },
    }),
  ])

  // ----- Overview counts -----
  let incomingCount = 0
  let outgoingCount = 0
  let aiCount = 0
  let ownerCount = 0
  let customerSourceCount = 0
  for (const m of messages) {
    if (m.direction === 'incoming') incomingCount += 1
    else outgoingCount += 1
    if (m.source === 'ai') aiCount += 1
    else if (m.source === 'owner') ownerCount += 1
    else if (m.source === 'customer') customerSourceCount += 1
  }

  // ----- Conversation flow + customer-initiated conversations -----
  // A "customer-initiated" conversation = an incoming message that comes
  // after either no prior message, or after a gap of > 6 hours from the
  // last message of any direction. (Heuristic for a new conversation thread.)
  const CONV_GAP_MS = 6 * 60 * 60 * 1000 // 6 hours
  const conversationFlow: ConversationFlowPoint[] = []
  let prevTs: number | null = null
  for (const m of messages) {
    const ts = m.timestamp.getTime()
    const gapMinutes =
      prevTs === null ? 0 : Math.max(0, Math.round((ts - prevTs) / 60000))
    conversationFlow.push({
      direction: m.direction === 'incoming' ? 'in' : 'out',
      gap_minutes: gapMinutes,
      timestamp: m.timestamp.toISOString(),
    })
    prevTs = ts
  }

  // Count customer-initiated threads cleanly.
  let customerInitiated = 0
  let lastTs: number | null = null
  for (const m of messages) {
    const ts = m.timestamp.getTime()
    if (m.direction === 'incoming') {
      if (lastTs === null || ts - lastTs > CONV_GAP_MS) {
        customerInitiated += 1
      }
    }
    lastTs = ts
  }

  // ----- Avg response time (customer -> our reply) -----
  // For each incoming message, find the next outgoing message within 1 hour.
  const ONE_HOUR_MS = 60 * 60 * 1000
  const responseGapsMs: number[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.direction !== 'incoming') continue
    const inTs = m.timestamp.getTime()
    for (let j = i + 1; j < messages.length; j++) {
      const n = messages[j]
      const outTs = n.timestamp.getTime()
      if (outTs < inTs) continue
      if (outTs - inTs > ONE_HOUR_MS) break
      if (n.direction === 'outgoing') {
        responseGapsMs.push(outTs - inTs)
        break
      }
    }
  }
  const avgResponseTimeMs =
    responseGapsMs.length > 0
      ? Math.round(responseGapsMs.reduce((s, x) => s + x, 0) / responseGapsMs.length)
      : 0

  // ----- Avg customer response time (our reply -> customer's next message) -----
  // For each outgoing message, find the next incoming message within 24 hours.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const customerResponseGapsMs: number[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.direction !== 'outgoing') continue
    const outTs = m.timestamp.getTime()
    for (let j = i + 1; j < messages.length; j++) {
      const n = messages[j]
      const inTs = n.timestamp.getTime()
      if (inTs < outTs) continue
      if (inTs - outTs > ONE_DAY_MS) break
      if (n.direction === 'incoming') {
        customerResponseGapsMs.push(inTs - outTs)
        break
      }
    }
  }
  const avgCustomerResponseMs =
    customerResponseGapsMs.length > 0
      ? Math.round(
          customerResponseGapsMs.reduce((s, x) => s + x, 0) /
            customerResponseGapsMs.length,
        )
      : 0

  // ----- First/last + duration -----
  const firstMessageAt =
    messages.length > 0 ? messages[0].timestamp.toISOString() : null
  const lastMessageAt =
    messages.length > 0
      ? messages[messages.length - 1].timestamp.toISOString()
      : null
  let conversationDuration = 0
  if (firstMessageAt && lastMessageAt) {
    const ms =
      new Date(lastMessageAt).getTime() - new Date(firstMessageAt).getTime()
    conversationDuration = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
  }

  // ----- Messages per day (avg) -----
  const messagesPerDay =
    conversationDuration > 0
      ? Math.round((messages.length / conversationDuration) * 10) / 10
      : messages.length

  // ----- Longest streak of consecutive days with at least one message -----
  const dayKeys = new Set<string>()
  for (const m of messages) dayKeys.add(localDayKey(m.timestamp))
  const dayDates: number[] = Array.from(dayKeys)
    .map((k) => {
      const [y, mo, d] = k.split('-').map(Number)
      return new Date(y, (mo ?? 1) - 1, d ?? 1).getTime()
    })
    .sort((a, b) => a - b)
  let longestStreak = 0
  let currentStreak = 0
  let prevDay: number | null = null
  const ONE_DAY = 24 * 60 * 60 * 1000
  for (const day of dayDates) {
    if (prevDay !== null && day - prevDay === ONE_DAY) {
      currentStreak += 1
    } else if (prevDay !== null && day - prevDay === 0) {
      // duplicate (shouldn't happen with a Set, but guard)
      // no-op
    } else {
      currentStreak = 1
    }
    if (currentStreak > longestStreak) longestStreak = currentStreak
    prevDay = day
  }
  if (dayDates.length === 1) longestStreak = 1

  // ----- Message timeline (last 30 days, daily counts) -----
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const timelineBuckets: TimelinePoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    timelineBuckets.push({
      date: shortMonthDay(d),
      incoming: 0,
      outgoing: 0,
    })
  }
  // Build a quick lookup: dateLabel -> bucket index.
  const timelineIndex = new Map<string, number>()
  for (let i = 0; i < timelineBuckets.length; i++) {
    timelineIndex.set(timelineBuckets[i].date, i)
  }
  const thirtyDaysAgoMs = today.getTime() - 29 * ONE_DAY
  for (const m of messages) {
    const ts = m.timestamp.getTime()
    if (ts < thirtyDaysAgoMs) continue
    const label = shortMonthDay(m.timestamp)
    const idx = timelineIndex.get(label)
    if (idx === undefined) continue
    if (m.direction === 'incoming') timelineBuckets[idx].incoming += 1
    else timelineBuckets[idx].outgoing += 1
  }

  // ----- Hourly heatmap (24 buckets) -----
  const hourlyHeatmap: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: 0,
  }))
  for (const m of messages) {
    const h = m.timestamp.getHours()
    if (h >= 0 && h < 24) hourlyHeatmap[h].count += 1
  }

  // ----- Day-of-week distribution (7 buckets, Mon-first) -----
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]
  for (const m of messages) {
    const jsDay = m.timestamp.getDay() // 0=Sun..6=Sat
    const monFirstIdx = DAY_INDEX_FROM_JS[jsDay]
    dayOfWeekCounts[monFirstIdx] += 1
  }
  const dayOfWeekDistribution: DayOfWeekBucket[] = DAY_NAMES.map((day, i) => ({
    day,
    count: dayOfWeekCounts[i],
  }))

  // ----- Source distribution (ai | owner | customer) -----
  // Map "system" and any other source into customer if it's incoming,
  // otherwise treat as owner — but per spec we only need the three buckets.
  let customerCount = 0
  for (const m of messages) {
    if (m.source === 'customer') customerCount += 1
    else if (m.source !== 'ai' && m.source !== 'owner' && m.direction === 'incoming') {
      customerCount += 1
    }
  }
  const sourceDistribution: SourceBucket[] = [
    { source: 'ai', count: aiCount },
    { source: 'owner', count: ownerCount },
    {
      source: 'customer',
      count: customerCount > 0 ? customerCount : customerSourceCount,
    },
  ]

  // ----- Response times (last 20 AI reply times from logs) -----
  const responseTimesAll: ResponseTimePoint[] = []
  for (const log of aiLogs) {
    const ms = parseResponseMs(log.message, log.meta)
    if (ms !== null) {
      responseTimesAll.push({ replyMs: ms, timestamp: log.createdAt.toISOString() })
    }
  }
  const responseTimes = responseTimesAll.slice(-20)

  // ---------------------------------------------------------------------------
  const payload: StatsPayload = {
    overview: {
      totalMessages: messages.length,
      incomingCount,
      outgoingCount,
      aiCount,
      ownerCount,
      customerInitiated,
      avgResponseTimeMs,
      avgCustomerResponseMs,
      firstMessageAt,
      lastMessageAt,
      conversationDuration,
      messagesPerDay,
      longestStreak,
    },
    messageTimeline: timelineBuckets,
    hourlyHeatmap,
    responseTimes,
    dayOfWeekDistribution,
    sourceDistribution,
    conversationFlow,
  }

  return NextResponse.json(payload)
}

// ============================================================
// Contacts API — comprehensive profile payload
//
// GET /api/contacts/[id]/profile
//   → {
//       contact: { id, name, phone, countryCode, language, status,
//                  leadScore, detectedService, notes, pinned, humanMode,
//                  firstSeen, lastSeen, lastMessageAt, createdAt },
//       messages: [{ id, direction, source, text, status, read, timestamp }],  // ASC
//       memories: [{ id, key, value, updatedAt }],
//       leadScoreHistory: [{ id, score, category, reason, createdAt }],         // ASC
//       stats: {
//         totalMessages, incomingCount, outgoingCount, aiCount, ownerCount,
//         avgResponseMs, firstMessageAt, lastMessageAt, conversationDays,
//       },
//       notifications: [{ id, type, title, body, severity, createdAt }],
//     }
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface ProfileMessage {
  id: string
  direction: string
  source: string
  text: string
  status: string
  read: boolean
  sentiment: string
  sentimentScore: number
  intent: string
  timestamp: string
}

interface ProfileMemory {
  id: string
  key: string
  value: string
  updatedAt: string
}

interface ProfileLeadScore {
  id: string
  score: number
  category: string
  reason: string
  createdAt: string
}

interface ProfileNotification {
  id: string
  type: string
  title: string
  body: string
  severity: string
  createdAt: string
}

interface ProfileStats {
  totalMessages: number
  incomingCount: number
  outgoingCount: number
  aiCount: number
  ownerCount: number
  avgResponseMs: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  conversationDays: number
}

interface ProfilePayload {
  contact: {
    id: string
    name: string
    phone: string
    countryCode: string
    language: string
    status: string
    leadScore: number
    detectedService: string
    notes: string
    pinned: boolean
    humanMode: boolean
    firstSeen: string
    lastSeen: string
    lastMessageAt: string | null
    createdAt: string
  }
  messages: ProfileMessage[]
  memories: ProfileMemory[]
  leadScoreHistory: ProfileLeadScore[]
  stats: ProfileStats
  notifications: ProfileNotification[]
}

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
      id: true,
      name: true,
      phone: true,
      countryCode: true,
      language: true,
      status: true,
      leadScore: true,
      detectedService: true,
      notes: true,
      pinned: true,
      humanMode: true,
      firstSeen: true,
      lastSeen: true,
      lastMessageAt: true,
      createdAt: true,
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Parallel fetch of related records.
  const [messages, memories, leadScoreHistory, notifications, aiLogs] = await Promise.all([
    db.message.findMany({
      where: { contactId: id },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        direction: true,
        source: true,
        text: true,
        status: true,
        read: true,
        sentiment: true,
        sentimentScore: true,
        intent: true,
        timestamp: true,
      },
    }),
    db.conversationMemory.findMany({
      where: { contactId: id },
      orderBy: { updatedAt: 'asc' },
      select: { id: true, key: true, value: true, updatedAt: true },
    }),
    db.leadScore.findMany({
      where: { contactId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, score: true, category: true, reason: true, createdAt: true },
    }),
    db.notification.findMany({
      where: { contactId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        severity: true,
        createdAt: true,
      },
    }),
    db.log.findMany({
      where: { contactId: id, category: 'ai' },
      orderBy: { createdAt: 'asc' },
      select: { message: true, meta: true, createdAt: true },
    }),
  ])

  // ----- Stats -----
  let incomingCount = 0
  let outgoingCount = 0
  let aiCount = 0
  let ownerCount = 0
  for (const m of messages) {
    if (m.direction === 'incoming') incomingCount += 1
    else outgoingCount += 1
    if (m.source === 'ai') aiCount += 1
    else if (m.source === 'owner') ownerCount += 1
  }

  let responseMsSum = 0
  let responseMsCount = 0
  for (const log of aiLogs) {
    const ms = parseResponseMs(log.message, log.meta)
    if (ms !== null) {
      responseMsSum += ms
      responseMsCount += 1
    }
  }
  const avgResponseMs = responseMsCount > 0 ? Math.round(responseMsSum / responseMsCount) : 0

  const firstMessageAt = messages.length > 0 ? messages[0].timestamp.toISOString() : null
  const lastMessageAt =
    messages.length > 0 ? messages[messages.length - 1].timestamp.toISOString() : null

  let conversationDays = 0
  if (firstMessageAt && lastMessageAt) {
    const ms =
      new Date(lastMessageAt).getTime() - new Date(firstMessageAt).getTime()
    conversationDays = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
  }

  const payload: ProfilePayload = {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      countryCode: contact.countryCode,
      language: contact.language,
      status: contact.status,
      leadScore: contact.leadScore,
      detectedService: contact.detectedService,
      notes: contact.notes,
      pinned: contact.pinned,
      humanMode: contact.humanMode,
      firstSeen: contact.firstSeen.toISOString(),
      lastSeen: contact.lastSeen.toISOString(),
      lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      createdAt: contact.createdAt.toISOString(),
    },
    messages: messages.map<ProfileMessage>((m) => ({
      id: m.id,
      direction: m.direction,
      source: m.source,
      text: m.text,
      status: m.status,
      read: m.read,
      sentiment: m.sentiment,
      sentimentScore: m.sentimentScore,
      intent: m.intent,
      timestamp: m.timestamp.toISOString(),
    })),
    memories: memories.map<ProfileMemory>((m) => ({
      id: m.id,
      key: m.key,
      value: m.value,
      updatedAt: m.updatedAt.toISOString(),
    })),
    leadScoreHistory: leadScoreHistory.map<ProfileLeadScore>((s) => ({
      id: s.id,
      score: s.score,
      category: s.category,
      reason: s.reason,
      createdAt: s.createdAt.toISOString(),
    })),
    stats: {
      totalMessages: messages.length,
      incomingCount,
      outgoingCount,
      aiCount,
      ownerCount,
      avgResponseMs,
      firstMessageAt,
      lastMessageAt,
      conversationDays,
    },
    notifications: notifications.map<ProfileNotification>((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      severity: n.severity,
      createdAt: n.createdAt.toISOString(),
    })),
  }

  return NextResponse.json(payload)
}

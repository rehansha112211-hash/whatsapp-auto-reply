import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Unified activity feed for the dashboard.
//
// Pulls recent events from multiple sources (AI replies, owner messages,
// new contacts, hot leads, owner-request notifications, WhatsApp events,
// AI errors), merges them into a single timeline and returns the 15 newest.
// ---------------------------------------------------------------------------

type ActivityType =
  | 'ai_reply'
  | 'owner_message'
  | 'new_contact'
  | 'new_lead'
  | 'owner_request'
  | 'whatsapp_event'
  | 'ai_error'
  | 'scheduled_sent'

type Severity = 'info' | 'success' | 'warning' | 'error'

type IconKey =
  | 'bot'
  | 'user'
  | 'user-plus'
  | 'flame'
  | 'bell'
  | 'message-circle'
  | 'alert'
  | 'clock'

interface ActivityMeta {
  replyMs?: number
  leadScore?: number
  category?: string
}

interface ActivityItem {
  id: string
  type: ActivityType
  title: string
  description: string
  timestamp: string // ISO
  contactId: string | null
  contactName: string | null
  contactPhone: string | null
  severity: Severity
  icon: IconKey
  meta: ActivityMeta
}

interface ActivityResponse {
  items: ActivityItem[]
}

// Parse "AI replied to {name} in {n}ms ..." → n
// Mirrors the analytics route so timings stay consistent.
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

// Truncate long message text for a one-line preview.
function preview(text: string, max = 90): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max).trimEnd() + '…'
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ---- Pull every source in parallel -----------------------------------
  // Note: LeadScore has no relation to Contact, so we look up those contacts
  //       in a second pass below (after we know the contactIds we need).
  const [
    aiReplies,
    ownerMessages,
    newContacts,
    hotLeadScores,
    ownerRequestNotifs,
    waEvents,
    aiErrorLogs,
    aiReplyLogs,
  ] = await Promise.all([
    // Last 5 AI outgoing replies
    db.message.findMany({
      where: { source: 'ai', direction: 'outgoing' },
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: {
        id: true,
        text: true,
        timestamp: true,
        contactId: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
    // Last 3 owner messages (any direction — usually outgoing)
    db.message.findMany({
      where: { source: 'owner' },
      orderBy: { timestamp: 'desc' },
      take: 3,
      select: {
        id: true,
        text: true,
        direction: true,
        timestamp: true,
        contactId: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
    // Last 3 new contacts
    db.contact.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        name: true,
        phone: true,
        detectedService: true,
        leadScore: true,
        createdAt: true,
      },
    }),
    // Last 3 hot lead-score events (score >= 70) — no contact relation,
    // we resolve the names in a follow-up query.
    db.leadScore.findMany({
      where: { score: { gte: 70 } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        score: true,
        category: true,
        reason: true,
        createdAt: true,
        contactId: true,
      },
    }),
    // Last 3 owner-request notifications
    db.notification.findMany({
      where: { type: 'owner_request' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        body: true,
        severity: true,
        createdAt: true,
        contactId: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
    // Last 2 WhatsApp events
    db.log.findMany({
      where: { category: 'whatsapp' },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: {
        id: true,
        message: true,
        level: true,
        createdAt: true,
        contactId: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
    // Last 2 AI errors
    db.log.findMany({
      where: { category: 'ai', level: 'error' },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: {
        id: true,
        message: true,
        createdAt: true,
        contactId: true,
        contact: { select: { name: true, phone: true } },
      },
    }),
    // AI logs that recorded a reply time — used to enrich ai_reply rows.
    db.log.findMany({
      where: { category: 'ai', message: { contains: 'AI replied to' } },
      orderBy: { createdAt: 'desc' },
      take: 30, // enough to cover the 5 most recent replies
      select: {
        id: true,
        message: true,
        meta: true,
        createdAt: true,
        contactId: true,
      },
    }),
  ])

  // ---- Resolve contact names for hot lead-score rows (no relation) ------
  const leadContactIds = Array.from(
    new Set(hotLeadScores.map((l) => l.contactId).filter(Boolean)),
  )
  const leadContacts =
    leadContactIds.length > 0
      ? await db.contact.findMany({
          where: { id: { in: leadContactIds } },
          select: { id: true, name: true, phone: true },
        })
      : []
  const leadContactMap = new Map(leadContacts.map((c) => [c.id, c]))

  // ---- Build a lookup of contactId → most recent replyMs from logs ------
  // Match AI reply rows to their log entry by contactId (closest preceding
  // log within a 5-minute window). This is best-effort because the engine
  // writes the log right after the outgoing message.
  const replyMsByContact = new Map<string, number>()
  for (const log of aiReplyLogs) {
    if (!log.contactId) continue
    if (replyMsByContact.has(log.contactId)) continue // keep newest (logs are desc)
    const ms = parseResponseMs(log.message, log.meta)
    if (ms !== null) replyMsByContact.set(log.contactId, ms)
  }

  const items: ActivityItem[] = []

  // ---- AI replies -------------------------------------------------------
  for (const m of aiReplies) {
    const replyMs = m.contactId ? replyMsByContact.get(m.contactId) ?? null : null
    items.push({
      id: `ai_reply:${m.id}`,
      type: 'ai_reply',
      title: 'AI replied',
      description: preview(m.text),
      timestamp: m.timestamp.toISOString(),
      contactId: m.contactId,
      contactName: m.contact?.name ?? null,
      contactPhone: m.contact?.phone ?? null,
      severity: 'success',
      icon: 'bot',
      meta: replyMs !== null ? { replyMs } : {},
    })
  }

  // ---- Owner messages ---------------------------------------------------
  for (const m of ownerMessages) {
    items.push({
      id: `owner_message:${m.id}`,
      type: 'owner_message',
      title: m.direction === 'incoming' ? 'Owner received a message' : 'Owner replied',
      description: preview(m.text),
      timestamp: m.timestamp.toISOString(),
      contactId: m.contactId,
      contactName: m.contact?.name ?? null,
      contactPhone: m.contact?.phone ?? null,
      severity: 'info',
      icon: 'user',
      meta: {},
    })
  }

  // ---- New contacts -----------------------------------------------------
  for (const c of newContacts) {
    items.push({
      id: `new_contact:${c.id}`,
      type: 'new_contact',
      title: 'New contact',
      description: c.detectedService
        ? `${c.name} · ${c.detectedService.replace(/_/g, ' ')}`
        : c.name,
      timestamp: c.createdAt.toISOString(),
      contactId: c.id,
      contactName: c.name,
      contactPhone: c.phone,
      severity: 'info',
      icon: 'user-plus',
      meta: { leadScore: c.leadScore },
    })
  }

  // ---- Hot leads --------------------------------------------------------
  for (const ls of hotLeadScores) {
    const c = ls.contactId ? leadContactMap.get(ls.contactId) : undefined
    items.push({
      id: `new_lead:${ls.id}`,
      type: 'new_lead',
      title: 'Hot lead detected',
      description: ls.reason
        ? `${c?.name ?? 'Contact'} · ${preview(ls.reason, 60)}`
        : `${c?.name ?? 'Contact'} reached score ${ls.score}`,
      timestamp: ls.createdAt.toISOString(),
      contactId: ls.contactId,
      contactName: c?.name ?? null,
      contactPhone: c?.phone ?? null,
      severity: 'warning',
      icon: 'flame',
      meta: { leadScore: ls.score, category: ls.category },
    })
  }

  // ---- Owner-request notifications --------------------------------------
  for (const n of ownerRequestNotifs) {
    const sev: Severity =
      n.severity === 'error'
        ? 'error'
        : n.severity === 'warning'
          ? 'warning'
          : n.severity === 'success'
            ? 'success'
            : 'info'
    items.push({
      id: `owner_request:${n.id}`,
      type: 'owner_request',
      title: n.title || 'Owner requested',
      description: preview(n.body, 120),
      timestamp: n.createdAt.toISOString(),
      contactId: n.contactId,
      contactName: n.contact?.name ?? null,
      contactPhone: n.contact?.phone ?? null,
      severity: sev,
      icon: 'bell',
      meta: {},
    })
  }

  // ---- WhatsApp events --------------------------------------------------
  for (const log of waEvents) {
    const isError = log.level === 'error'
    items.push({
      id: `whatsapp_event:${log.id}`,
      type: 'whatsapp_event',
      title: 'WhatsApp event',
      description: preview(log.message, 120),
      timestamp: log.createdAt.toISOString(),
      contactId: log.contactId,
      contactName: log.contact?.name ?? null,
      contactPhone: log.contact?.phone ?? null,
      severity: isError ? 'error' : 'info',
      icon: 'message-circle',
      meta: {},
    })
  }

  // ---- AI errors --------------------------------------------------------
  for (const log of aiErrorLogs) {
    items.push({
      id: `ai_error:${log.id}`,
      type: 'ai_error',
      title: 'AI error',
      description: preview(log.message, 120),
      timestamp: log.createdAt.toISOString(),
      contactId: log.contactId,
      contactName: log.contact?.name ?? null,
      contactPhone: log.contact?.phone ?? null,
      severity: 'error',
      icon: 'alert',
      meta: {},
    })
  }

  // ---- Merge, sort by timestamp DESC, take top 15 -----------------------
  items.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime()
    const tb = new Date(b.timestamp).getTime()
    return tb - ta
  })

  const payload: ActivityResponse = { items: items.slice(0, 15) }
  return NextResponse.json(payload)
}

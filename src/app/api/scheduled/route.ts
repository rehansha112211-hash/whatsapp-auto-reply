// ============================================================
// Scheduled Messages API
//
// GET  /api/scheduled
//   → { items: ScheduledMessageRow[] }
//   Returns all scheduled messages. Pending items are sorted by
//   scheduledAt ASC (soonest first); everything else by createdAt
//   DESC. Each row carries the parent contact's name + phone so the
//   client can render without a second round-trip.
//
// POST /api/scheduled   body: { contactId, text, scheduledAt }
//   Validates the contact exists, the text is non-empty, and the
//   scheduledAt is in the future. Creates the record with status
//   'pending', logs the action, and returns the new row.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import type { ScheduledMessageRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

type ScheduledStatus = 'pending' | 'sent' | 'cancelled' | 'failed'

interface DbRow {
  id: string
  contactId: string
  text: string
  scheduledAt: Date
  status: string
  sentAt: Date | null
  createdAt: Date
  contact: { id: string; name: string; phone: string } | null
}

function toRow(r: DbRow): ScheduledMessageRow {
  return {
    id: r.id,
    contactId: r.contactId,
    contactName: r.contact?.name ?? 'Unknown',
    contactPhone: r.contact?.phone ?? '',
    text: r.text,
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status as ScheduledStatus,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }
}

// ------------------------------------------------------------
// GET — list scheduled messages
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pending first (soonest first), then the rest newest-first.
  const [pending, others] = await Promise.all([
    db.scheduledMessage.findMany({
      where: { status: 'pending' },
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    }),
    db.scheduledMessage.findMany({
      where: { status: { not: 'pending' } },
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ])

  const items = [...pending, ...others].map(toRow)
  return NextResponse.json({ items })
}

// ------------------------------------------------------------
// POST — create a scheduled message
// ------------------------------------------------------------
interface PostBody {
  contactId?: unknown
  text?: unknown
  scheduledAt?: unknown
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

  const contactId = typeof body.contactId === 'string' ? body.contactId.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const scheduledAtRaw = typeof body.scheduledAt === 'string' ? body.scheduledAt : ''

  if (!contactId) {
    return NextResponse.json({ error: 'Contact is required' }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: 'Message too long (max 1000 chars)' }, { status: 400 })
  }
  if (!scheduledAtRaw) {
    return NextResponse.json({ error: 'Scheduled time is required' }, { status: 400 })
  }

  const scheduledAt = new Date(scheduledAtRaw)
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 })
  }
  // Give a small (15s) grace window so "right now" requests don't get rejected
  // by sub-second clock drift between client and server.
  const now = new Date()
  if (scheduledAt.getTime() < now.getTime() - 15_000) {
    return NextResponse.json(
      { error: 'Scheduled time must be in the future' },
      { status: 400 },
    )
  }

  // Verify contact exists
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, phone: true },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const created = await db.scheduledMessage.create({
    data: {
      contactId,
      text,
      scheduledAt,
      status: 'pending',
    },
    include: { contact: { select: { id: true, name: true, phone: true } } },
  })

  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `Message scheduled for ${contact.name} at ${formatDateTime(scheduledAt)}`,
      contactId,
      meta: JSON.stringify({ scheduledId: created.id, scheduledAt: scheduledAt.toISOString() }),
    },
  })

  return NextResponse.json({ item: toRow(created) })
}

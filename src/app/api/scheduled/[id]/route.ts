// ============================================================
// Scheduled Messages — single-item API
//
// PATCH  /api/scheduled/[id]   body: { text?, scheduledAt? }
//   Only allowed while the record is still 'pending'. Updates the
//   editable fields, logs the change, returns the updated row.
//
// DELETE /api/scheduled/[id]
//   Cancels a pending scheduled message (status -> 'cancelled').
//   Already-terminal records (sent / cancelled / failed) are left
//   alone — the API just returns 404 to keep the contract simple
//   and match the "delete" intent (it's a no-op for them).
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

interface RouteContext {
  params: Promise<{ id: string }>
}

// ------------------------------------------------------------
// PATCH — update text and/or scheduledAt (only if pending)
// ------------------------------------------------------------
interface PatchBody {
  text?: unknown
  scheduledAt?: unknown
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const existing = await db.scheduledMessage.findUnique({
    where: { id },
    include: { contact: { select: { id: true, name: true, phone: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot edit a scheduled message that is already ${existing.status}` },
      { status: 409 },
    )
  }

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data: { text?: string; scheduledAt?: Date } = {}

  if (typeof body.text === 'string') {
    const trimmed = body.text.trim()
    if (!trimmed) {
      return NextResponse.json({ error: 'Message text cannot be empty' }, { status: 400 })
    }
    if (trimmed.length > 1000) {
      return NextResponse.json({ error: 'Message too long (max 1000 chars)' }, { status: 400 })
    }
    data.text = trimmed
  }

  if (typeof body.scheduledAt === 'string') {
    const scheduledAt = new Date(body.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 })
    }
    if (scheduledAt.getTime() < Date.now() - 15_000) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 },
      )
    }
    data.scheduledAt = scheduledAt
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const updated = await db.scheduledMessage.update({
    where: { id },
    data,
    include: { contact: { select: { id: true, name: true, phone: true } } },
  })

  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `Scheduled message for ${updated.contact?.name ?? 'contact'} updated`,
      contactId: updated.contactId,
      meta: JSON.stringify({
        scheduledId: updated.id,
        scheduledAt: updated.scheduledAt.toISOString(),
        fields: Object.keys(data),
      }),
    },
  })

  return NextResponse.json({ item: toRow(updated) })
}

// ------------------------------------------------------------
// DELETE — cancel a pending scheduled message
// ------------------------------------------------------------
export async function DELETE(_req: Request, ctx: RouteContext) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const existing = await db.scheduledMessage.findUnique({
    where: { id },
    include: { contact: { select: { id: true, name: true, phone: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.status === 'pending') {
    await db.scheduledMessage.update({
      where: { id },
      data: { status: 'cancelled' },
    })
    await db.log.create({
      data: {
        category: 'whatsapp',
        level: 'warn',
        message: `Scheduled message for ${existing.contact?.name ?? 'contact'} cancelled (was due ${formatDateTime(existing.scheduledAt)})`,
        contactId: existing.contactId,
        meta: JSON.stringify({ scheduledId: existing.id }),
      },
    })
    return NextResponse.json({
      ok: true,
      status: 'cancelled' as ScheduledStatus,
    })
  }

  // Already terminal — return its current status so the client can
  // reconcile its local list without an extra round-trip.
  return NextResponse.json({
    ok: true,
    status: existing.status as ScheduledStatus,
    noop: true,
  })
}

// ============================================================
// Scheduled Messages — process due ones
//
// POST /api/scheduled/process
//   Auth-required. Finds every ScheduledMessage where
//   status='pending' AND scheduledAt <= now, sends each through
//   wa-engine.sendOwnerMessage (which creates the outgoing owner
//   message + updates the contact's lastMessageAt), flips the
//   record to status='sent' with sentAt=now, logs the send, and
//   returns { ok, processed }.
//
//   This endpoint is polled by the ScheduledView every 30s and can
//   also be called manually (e.g. via curl) for testing.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { sendOwnerMessage } from '@/lib/wa-engine'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const due = await db.scheduledMessage.findMany({
    where: { status: 'pending', scheduledAt: { lte: now } },
    include: { contact: { select: { id: true, name: true, phone: true } } },
    orderBy: { scheduledAt: 'asc' },
    take: 100, // cap per tick to keep latency bounded
  })

  if (due.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0
  let failed = 0

  // Send sequentially — sends are DB writes, not network IO, and the
  // SQLite driver serialises writes anyway. Keeps the failure path
  // straightforward: a failed send marks the record 'failed' without
  // affecting siblings.
  for (const sm of due) {
    try {
      await sendOwnerMessage(sm.contactId, sm.text)
      await db.scheduledMessage.update({
        where: { id: sm.id },
        data: { status: 'sent', sentAt: new Date() },
      })
      await db.log.create({
        data: {
          category: 'whatsapp',
          level: 'info',
          message: `Scheduled message sent to ${sm.contact?.name ?? 'contact'}`,
          contactId: sm.contactId,
          meta: JSON.stringify({ scheduledId: sm.id, text: sm.text.slice(0, 120) }),
        },
      })
      processed += 1
    } catch (err) {
      failed += 1
      await db.scheduledMessage.update({
        where: { id: sm.id },
        data: { status: 'failed' },
      })
      await db.log.create({
        data: {
          category: 'whatsapp',
          level: 'error',
          message: `Scheduled message ${sm.id} failed to send: ${(err as Error).message}`,
          contactId: sm.contactId,
          meta: JSON.stringify({ scheduledId: sm.id }),
        },
      })
    }
  }

  return NextResponse.json({ ok: true, processed, failed })
}

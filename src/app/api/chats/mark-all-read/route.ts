// ============================================================
// Mark all chats as read API
//
// POST /api/chats/mark-all-read
//   → marks ALL incoming messages with read=false as read=true
//     across every contact in the database.
//
//   Returns: { ok: true, updated: N }
//   Side effect: writes an info log (category='whatsapp') so the
//   audit trail records who cleared the unread badge.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await db.message.updateMany({
    where: { direction: 'incoming', read: false },
    data: { read: true },
  })

  const updated = result.count

  // Audit log entry — best-effort, must not break the request on failure.
  try {
    await db.log.create({
      data: {
        category: 'whatsapp',
        level: 'info',
        message: `Marked ${updated} messages as read`,
        meta: JSON.stringify({
          actor: user.username,
          count: updated,
        }),
      },
    })
  } catch {
    /* non-fatal — DB may be locked transiently on SQLite */
  }

  return NextResponse.json({ ok: true, updated })
}

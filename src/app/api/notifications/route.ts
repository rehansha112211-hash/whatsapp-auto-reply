import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ensureSeed } from '@/lib/seed'

export async function GET(req: Request) {
  await ensureSeed()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
  const onlyUnread = searchParams.get('unread') === '1'

  const items = await db.notification.findMany({
    where: onlyUnread ? { read: false } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { contact: { select: { name: true, phone: true } } },
  })

  return NextResponse.json({
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      severity: n.severity,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      contactId: n.contactId,
      contactName: n.contact?.name ?? null,
    })),
  })
}

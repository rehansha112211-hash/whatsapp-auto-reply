import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const owner = await db.owner.findUnique({ where: { id: 'owner' } })
  const ownerName = owner?.name ?? 'Owner'
  const time = new Date().toISOString()

  await db.notification.create({
    data: {
      type: 'owner_request',
      title: 'Test Notification',
      body: `Test notification from ${ownerName} at ${time}`,
      severity: 'info',
    },
  })

  await db.log.create({
    data: {
      category: 'owner_notify',
      level: 'info',
      message: `Test owner notification sent by ${user.username}`,
      meta: JSON.stringify({ ownerName }),
    },
  })

  return NextResponse.json({ ok: true })
}

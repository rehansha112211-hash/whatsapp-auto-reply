import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ensureSeed } from '@/lib/seed'
import { SYSTEM_START } from '@/lib/wa-engine'
import type { DashboardStats } from '@/lib/types'

export async function GET() {
  await ensureSeed()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)

  const [
    session,
    todayMessages,
    totalContacts,
    todayAiReplies,
    todayOwnerReplies,
    hotLeads,
    newCustomersToday,
    apiSetting,
    unreadNotifications,
  ] = await Promise.all([
    db.session.findUnique({ where: { id: 'whatsapp' } }),
    db.message.count({ where: { timestamp: { gte: startToday } } }),
    db.contact.count(),
    db.message.count({
      where: { source: 'ai', timestamp: { gte: startToday } },
    }),
    db.message.count({
      where: { source: 'owner', timestamp: { gte: startToday } },
    }),
    db.contact.count({ where: { leadScore: { gte: 70 } } }),
    db.contact.count({ where: { createdAt: { gte: startToday } } }),
    db.apiSetting.findUnique({ where: { id: 'api' } }),
    db.notification.count({ where: { read: false } }),
  ])

  // DB health check
  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    dbStatus = 'error'
  }

  const stats: DashboardStats = {
    whatsappState: (session?.state as DashboardStats['whatsappState']) ?? 'disconnected',
    connectedNumber: session?.connectedNumber ?? '',
    connectedName: session?.connectedName ?? '',
    connectedAt: session?.connectedAt?.toISOString() ?? null,
    todayMessages,
    totalContacts,
    aiReplies: todayAiReplies,
    ownerReplies: todayOwnerReplies,
    hotLeads,
    uptimeSec: Math.floor((Date.now() - SYSTEM_START.getTime()) / 1000),
    dbStatus,
    aiProvider: apiSetting?.provider ?? 'zai',
    aiModel: apiSetting?.model ?? 'glm-4.5',
    aiStatus: (apiSetting?.status as DashboardStats['aiStatus']) ?? 'untested',
    newCustomersToday,
    unreadNotifications,
    systemStartedAt: SYSTEM_START.toISOString(),
  }

  return NextResponse.json(stats)
}

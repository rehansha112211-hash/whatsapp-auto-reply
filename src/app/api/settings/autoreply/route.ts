import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'

interface AutoReplyPayload {
  enabled?: boolean
  replyDelaySec?: number
  typingDelaySec?: number
  businessHoursOnly?: boolean
  greeting?: string
  awayMessage?: string
  maxReplyLength?: number
  languagePref?: string
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await db.autoReplySetting.findUnique({ where: { id: 'autoreply' } })
  if (!row) {
    return NextResponse.json({
      id: 'autoreply',
      enabled: true,
      replyDelaySec: 1,
      typingDelaySec: 2,
      businessHoursOnly: false,
      greeting: '',
      awayMessage: '',
      maxReplyLength: 600,
      languagePref: 'auto',
      updatedAt: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    id: row.id,
    enabled: row.enabled,
    replyDelaySec: row.replyDelaySec,
    typingDelaySec: row.typingDelaySec,
    businessHoursOnly: row.businessHoursOnly,
    greeting: row.greeting,
    awayMessage: row.awayMessage,
    maxReplyLength: row.maxReplyLength,
    languagePref: row.languagePref,
    updatedAt: row.updatedAt.toISOString(),
  })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(user, 'canManageSettings')) {
    return NextResponse.json(
      { error: 'You need admin role to manage settings' },
      { status: 403 },
    )
  }

  let body: AutoReplyPayload
  try {
    body = (await req.json()) as AutoReplyPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.autoReplySetting.findUnique({ where: { id: 'autoreply' } })

  const languagePref = normalizeLanguage(body.languagePref ?? existing?.languagePref ?? 'auto')
  const replyDelaySec = clampInt(body.replyDelaySec, existing?.replyDelaySec ?? 1, 0, 60)
  const typingDelaySec = clampInt(body.typingDelaySec, existing?.typingDelaySec ?? 2, 0, 60)
  const maxReplyLength = clampInt(body.maxReplyLength, existing?.maxReplyLength ?? 600, 100, 2000)

  const data = {
    id: 'autoreply',
    enabled: body.enabled ?? existing?.enabled ?? true,
    replyDelaySec,
    typingDelaySec,
    businessHoursOnly: body.businessHoursOnly ?? existing?.businessHoursOnly ?? false,
    greeting: body.greeting ?? existing?.greeting ?? '',
    awayMessage: body.awayMessage ?? existing?.awayMessage ?? '',
    maxReplyLength,
    languagePref,
  }

  const upserted = await db.autoReplySetting.upsert({
    where: { id: 'autoreply' },
    update: {
      enabled: data.enabled,
      replyDelaySec: data.replyDelaySec,
      typingDelaySec: data.typingDelaySec,
      businessHoursOnly: data.businessHoursOnly,
      greeting: data.greeting,
      awayMessage: data.awayMessage,
      maxReplyLength: data.maxReplyLength,
      languagePref: data.languagePref,
    },
    create: data,
  })

  await db.log.create({
    data: {
      category: 'frontend',
      level: 'info',
      message: 'Auto-reply settings updated',
      meta: JSON.stringify({ enabled: upserted.enabled, languagePref: upserted.languagePref }),
    },
  })

  return NextResponse.json({
    ok: true,
    updatedAt: upserted.updatedAt.toISOString(),
  })
}

function normalizeLanguage(value: string): 'auto' | 'en' | 'hi' | 'hinglish' {
  if (value === 'auto' || value === 'en' || value === 'hi' || value === 'hinglish') return value
  return 'auto'
}

function clampInt(
  incoming: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (incoming === undefined || Number.isNaN(incoming)) return fallback
  return Math.min(max, Math.max(min, Math.floor(Number(incoming))))
}

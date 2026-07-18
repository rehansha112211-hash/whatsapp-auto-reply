import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { toCsv } from '@/lib/format'
import type { LogCategory, LogLevel, LogRow } from '@/lib/types'

const VALID_CATEGORIES: LogCategory[] = [
  'startup',
  'backend',
  'whatsapp',
  'ai',
  'database',
  'errors',
  'security',
  'owner_notify',
  'lead',
  'frontend',
]

const VALID_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'debug']

function isCategory(v: string | null): v is LogCategory {
  return v !== null && (VALID_CATEGORIES as string[]).includes(v)
}

function isLevel(v: string | null): v is LogLevel {
  return v !== null && (VALID_LEVELS as string[]).includes(v)
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = req.nextUrl.searchParams
  const categoryParam = params.get('category') ?? 'all'
  const levelParam = params.get('level') ?? 'all'
  const search = (params.get('search') ?? '').trim()
  const contactId = (params.get('contactId') ?? '').trim()
  const limitRaw = Number.parseInt(params.get('limit') ?? '200', 10)
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(1000, limitRaw))
    : 200
  const beforeRaw = params.get('before')
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null
  const exportFmt = params.get('export')

  const category = isCategory(categoryParam) ? categoryParam : null
  const level = isLevel(levelParam) ? levelParam : null

  const where: Record<string, unknown> = {}
  if (category) where.category = category
  if (level) where.level = level
  if (search) {
    where.message = { contains: search }
  }
  if (contactId) {
    where.contactId = contactId
  }
  if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
    where.createdAt = { lt: beforeDate }
  }

  // Fetch one extra to determine hasMore
  const rows = await db.log.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })
  const hasMore = rows.length > limit
  const trimmed = hasMore ? rows.slice(0, limit) : rows

  const items: LogRow[] = trimmed.map((r) => ({
    id: r.id,
    category: r.category as LogCategory,
    level: r.level as LogLevel,
    message: r.message,
    meta: r.meta,
    contactId: r.contactId,
    createdAt: r.createdAt.toISOString(),
  }))

  // CSV / JSON export
  if (exportFmt === 'csv') {
    const csv = toCsv(
      items.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        category: i.category,
        level: i.level,
        message: i.message,
        contactId: i.contactId ?? '',
        meta: i.meta,
      })),
    )
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="logs-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (exportFmt === 'json') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const json = JSON.stringify(items, null, 2)
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="logs-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({ items, hasMore })
}

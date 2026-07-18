import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { QORVIX_COMPANY, QORVIX_SERVICES } from '@/lib/types'

interface CompanyPayload {
  name?: string
  website?: string
  description?: string
  services?: string[]
  greetingMsg?: string
  closingMsg?: string
  supportMsg?: string
  businessHours?: Record<string, string>
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await db.company.findUnique({ where: { id: 'company' } })
  if (!row) {
    return NextResponse.json({
      id: 'company',
      name: QORVIX_COMPANY.name,
      website: QORVIX_COMPANY.website,
      description: QORVIX_COMPANY.description,
      services: QORVIX_SERVICES,
      businessHours: defaultBusinessHours(),
      greetingMsg: '',
      closingMsg: '',
      supportMsg: '',
      updatedAt: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    id: row.id,
    name: row.name,
    website: row.website,
    description: row.description,
    services: safeJsonParse<string[]>(row.services, []),
    businessHours: safeJsonParse<Record<string, string>>(row.businessHours, defaultBusinessHours()),
    greetingMsg: row.greetingMsg,
    closingMsg: row.closingMsg,
    supportMsg: row.supportMsg,
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

  let body: CompanyPayload
  try {
    body = (await req.json()) as CompanyPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.company.findUnique({ where: { id: 'company' } })

  const services = Array.isArray(body.services) ? body.services : safeJsonParse<string[]>(existing?.services ?? '[]', [])
  const businessHours =
    body.businessHours && typeof body.businessHours === 'object'
      ? body.businessHours
      : safeJsonParse<Record<string, string>>(existing?.businessHours ?? '{}', defaultBusinessHours())

  const data = {
    id: 'company',
    name: body.name ?? existing?.name ?? QORVIX_COMPANY.name,
    website: body.website ?? existing?.website ?? QORVIX_COMPANY.website,
    description: body.description ?? existing?.description ?? QORVIX_COMPANY.description,
    services: JSON.stringify(services),
    businessHours: JSON.stringify(businessHours),
    greetingMsg: body.greetingMsg ?? existing?.greetingMsg ?? '',
    closingMsg: body.closingMsg ?? existing?.closingMsg ?? '',
    supportMsg: body.supportMsg ?? existing?.supportMsg ?? '',
  }

  const upserted = await db.company.upsert({
    where: { id: 'company' },
    update: {
      name: data.name,
      website: data.website,
      description: data.description,
      services: data.services,
      businessHours: data.businessHours,
      greetingMsg: data.greetingMsg,
      closingMsg: data.closingMsg,
      supportMsg: data.supportMsg,
    },
    create: data,
  })

  await db.log.create({
    data: {
      category: 'frontend',
      level: 'info',
      message: 'Company settings updated',
      meta: JSON.stringify({ name: upserted.name }),
    },
  })

  return NextResponse.json({
    ok: true,
    updatedAt: upserted.updatedAt.toISOString(),
  })
}

function defaultBusinessHours(): Record<string, string> {
  return {
    mon: '09:00-19:00',
    tue: '09:00-19:00',
    wed: '09:00-19:00',
    thu: '09:00-19:00',
    fri: '09:00-19:00',
    sat: '09:00-14:00',
    sun: 'closed',
  }
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

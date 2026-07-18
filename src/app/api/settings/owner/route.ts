import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

interface OwnerPayload {
  name?: string
  phoneNumber?: string
  availability?: string
  businessHours?: string
  humanTakeover?: boolean
  leadNotify?: boolean
  autoNotify?: boolean
  leadThreshold?: number
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await db.owner.findUnique({ where: { id: 'owner' } })
  if (!row) {
    return NextResponse.json({
      id: 'owner',
      name: 'QorvixNode Owner',
      phoneNumber: '',
      availability: 'available',
      businessHours: 'Mon-Sat 09:00-19:00 IST',
      humanTakeover: true,
      leadNotify: true,
      autoNotify: true,
      leadThreshold: 70,
      updatedAt: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    id: row.id,
    name: row.name,
    phoneNumber: row.phoneNumber,
    availability: row.availability,
    businessHours: row.businessHours,
    humanTakeover: row.humanTakeover,
    leadNotify: row.leadNotify,
    autoNotify: row.autoNotify,
    leadThreshold: row.leadThreshold,
    updatedAt: row.updatedAt.toISOString(),
  })
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: OwnerPayload
  try {
    body = (await req.json()) as OwnerPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.owner.findUnique({ where: { id: 'owner' } })

  const availability = normalizeAvailability(body.availability ?? existing?.availability ?? 'available')
  const leadThreshold = clampInt(body.leadThreshold, existing?.leadThreshold ?? 70, 0, 100)

  const data = {
    id: 'owner',
    name: body.name ?? existing?.name ?? 'Owner',
    phoneNumber: body.phoneNumber ?? existing?.phoneNumber ?? '',
    availability,
    businessHours: body.businessHours ?? existing?.businessHours ?? 'Mon-Sat 09:00-19:00 IST',
    humanTakeover: body.humanTakeover ?? existing?.humanTakeover ?? true,
    leadNotify: body.leadNotify ?? existing?.leadNotify ?? true,
    autoNotify: body.autoNotify ?? existing?.autoNotify ?? true,
    leadThreshold,
  }

  const upserted = await db.owner.upsert({
    where: { id: 'owner' },
    update: {
      name: data.name,
      phoneNumber: data.phoneNumber,
      availability: data.availability,
      businessHours: data.businessHours,
      humanTakeover: data.humanTakeover,
      leadNotify: data.leadNotify,
      autoNotify: data.autoNotify,
      leadThreshold: data.leadThreshold,
    },
    create: data,
  })

  await db.log.create({
    data: {
      category: 'security',
      level: 'info',
      message: 'Owner settings updated',
      meta: JSON.stringify({
        name: upserted.name,
        availability: upserted.availability,
        leadThreshold: upserted.leadThreshold,
      }),
    },
  })

  return NextResponse.json({
    ok: true,
    updatedAt: upserted.updatedAt.toISOString(),
  })
}

function normalizeAvailability(value: string): 'available' | 'busy' | 'away' {
  if (value === 'busy' || value === 'away' || value === 'available') return value
  return 'available'
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

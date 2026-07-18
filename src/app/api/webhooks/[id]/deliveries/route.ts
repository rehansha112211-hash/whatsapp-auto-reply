// ============================================================
// Webhook deliveries API
//
// GET /api/webhooks/[id]/deliveries
//   Lists the most recent 50 deliveries for a webhook.
//   Returns { items: WebhookDeliveryRow[] }.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import type { WebhookDeliveryRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

function toRow(d: {
  id: string
  event: string
  payload: string
  status: string
  statusCode: number
  response: string
  attempts: number
  createdAt: Date
  deliveredAt: Date | null
}): WebhookDeliveryRow {
  return {
    id: d.id,
    event: d.event,
    payload: d.payload,
    status: d.status,
    statusCode: d.statusCode,
    response: d.response,
    attempts: d.attempts,
    createdAt: d.createdAt.toISOString(),
    deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canManageWebhooks')) {
    return NextResponse.json(
      { error: 'You need admin role to manage webhooks' },
      { status: 403 },
    )
  }

  const { id } = await params

  const exists = await db.webhook.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!exists) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
  }

  const rows = await db.webhookDelivery.findMany({
    where: { webhookId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const items = rows.map(toRow)
  return NextResponse.json({ items })
}

// ============================================================
// Webhook secret regeneration API
//
// POST /api/webhooks/[id]/secret
//   Generates a new HMAC secret for the webhook. The old secret
//   stops working immediately. The new secret is returned one
//   time only (subsequent GET /api/webhooks masks it).
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

function generateSecret(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
}

export async function POST(
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

  const secret = generateSecret()
  await db.webhook.update({
    where: { id },
    data: { secret },
  })

  // Audit log
  try {
    await db.log.create({
      data: {
        category: 'security',
        level: 'warn',
        message: `Webhook ${id} secret regenerated`,
        meta: JSON.stringify({ webhookId: id }),
      },
    })
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, secret, secretShown: true })
}

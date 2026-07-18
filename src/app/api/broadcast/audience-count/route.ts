// ============================================================
// Broadcast audience-count API
//
// GET /api/broadcast/audience-count?audience=<audience>
//   → { audience, count }
//
// Returns the number of contacts that would receive a broadcast for
// the given audience filter. Used by the New Broadcast form to show
// "This will reach N contacts" before the operator hits send.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Audience = 'all' | 'leads' | 'hot' | 'active' | 'customer' | 'custom'

const VALID_AUDIENCES: readonly Audience[] = [
  'all',
  'leads',
  'hot',
  'active',
  'customer',
  'custom',
] as const

function isAudience(v: string | null): v is Audience {
  return v !== null && (VALID_AUDIENCES as readonly string[]).includes(v)
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('audience')
  const audience: Audience = isAudience(raw) ? raw : 'all'

  // 'custom' is not supported yet — mirror the broadcast route and treat
  // it as 'all' so the count preview stays truthful.
  const effective: Audience = audience === 'custom' ? 'all' : audience

  const where =
    effective === 'leads'
      ? { leadScore: { gte: 25 } }
      : effective === 'hot'
        ? { leadScore: { gte: 70 } }
        : effective === 'active'
          ? { status: 'active' }
          : effective === 'customer'
            ? { status: 'customer' }
            : {}

  const count = await db.contact.count({ where })
  return NextResponse.json({ audience: effective, count })
}

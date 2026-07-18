// ============================================================
// Broadcast audience-preview API
//
// GET /api/broadcast/audience-preview?audience=<audience>
//   → { audience, contact: { name, phone, leadScore, detectedService,
//                            language, status, firstSeen, lastSeen,
//                            notes } | null }
//
// Returns the *first* contact that would receive a broadcast for
// the given audience filter, so the New Broadcast form can render
// a live "Preview as {first contact}" panel. We return null (with
// 200 OK) when the audience is empty so the client can show a
// friendly empty state without an error toast.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { ContactVariableData } from '@/lib/template-variables'

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

  // 'custom' is not supported yet — mirror the broadcast route and
  // treat it as 'all' so the preview stays truthful.
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

  const c = await db.contact.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      name: true,
      phone: true,
      leadScore: true,
      detectedService: true,
      language: true,
      status: true,
      firstSeen: true,
      lastSeen: true,
      notes: true,
    },
  })

  if (!c) {
    return NextResponse.json({ audience: effective, contact: null })
  }

  // Build the public ContactVariableData shape so the client can
  // feed it straight into <VariableHelper /> / substituteVariables().
  // without any adapter.
  const contact: ContactVariableData = {
    name: c.name,
    phone: c.phone,
    leadScore: c.leadScore,
    detectedService: c.detectedService,
    language: c.language,
    status: c.status,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
    notes: c.notes,
  }

  return NextResponse.json({ audience: effective, contact })
}


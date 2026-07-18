// ============================================================
// Contacts API — manual lead-score adjustment
//
// POST /api/contacts/[id]/lead-score   body: { score, category, reason }
//   → creates a new LeadScore record AND updates the contact's
//     leadScore + detectedService (when category is a known service).
//   → { ok: true, leadScore: number }
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { LeadCategory } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES: readonly LeadCategory[] = [
  'website',
  'app',
  'crm',
  'software',
  'ai_automation',
  'maintenance',
  'general',
  'support',
  'high_priority',
] as const

function isLeadCategory(v: string): v is LeadCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(v)
}

interface PostBody {
  score?: unknown
  category?: unknown
  reason?: unknown
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate score (0–100 integer)
  const rawScore = typeof body.score === 'string' ? Number(body.score) : body.score
  if (typeof rawScore !== 'number' || !Number.isFinite(rawScore)) {
    return NextResponse.json({ error: 'score (number 0–100) is required' }, { status: 400 })
  }
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  // Validate category
  if (typeof body.category !== 'string' || !isLeadCategory(body.category)) {
    return NextResponse.json(
      { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
      { status: 400 },
    )
  }

  // Reason is optional but should be a string
  const reason =
    typeof body.reason === 'string'
      ? body.reason.slice(0, 500)
      : 'Manual adjustment by operator'

  // Verify the contact exists.
  const exists = await db.contact.findUnique({ where: { id }, select: { id: true } })
  if (!exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  try {
    // Create the history record + update the contact in a single transaction.
    // `detectedService` is only updated when the chosen category actually
    // represents a service (not "general"/"support").
    const SERVICE_CATEGORIES: LeadCategory[] = [
      'website',
      'app',
      'crm',
      'software',
      'ai_automation',
      'maintenance',
      'high_priority',
    ]
    const updateService = SERVICE_CATEGORIES.includes(body.category)

    await db.$transaction([
      db.leadScore.create({
        data: {
          contactId: id,
          score,
          category: body.category,
          reason,
          notified: false,
        },
      }),
      db.contact.update({
        where: { id },
        data: {
          leadScore: score,
          ...(updateService ? { detectedService: body.category } : {}),
        },
      }),
    ])

    return NextResponse.json({ ok: true, leadScore: score })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

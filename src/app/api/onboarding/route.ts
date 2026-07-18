// ============================================================
// Onboarding state API
// Tracks whether the first-time product tour has been completed
// or skipped, persisted in the Setting table (single row per key).
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const KEY_COMPLETED = 'onboarding_completed'
const KEY_SKIPPED = 'onboarding_skipped'

// Canonical tour step ids — surfaced to the client so the tour
// component and any future dashboarding tooling agree on the order.
export const ONBOARDING_STEPS = [
  'welcome',
  'dashboard',
  'whatsapp',
  'chats',
  'simulator',
  'quick-search',
  'ai-settings',
  'complete',
] as const

interface OnboardingState {
  completed: boolean
  skipped: boolean
  steps: readonly string[]
}

async function readState(): Promise<OnboardingState> {
  const rows = await db.setting.findMany({
    where: { key: { in: [KEY_COMPLETED, KEY_SKIPPED] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    completed: map.get(KEY_COMPLETED) === 'true',
    skipped: map.get(KEY_SKIPPED) === 'true',
    steps: ONBOARDING_STEPS,
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = await readState()
  return NextResponse.json(state)
}

type OnboardingAction = 'complete' | 'skip' | 'reset'

interface OnboardingPostBody {
  action?: OnboardingAction
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: OnboardingPostBody
  try {
    body = (await req.json()) as OnboardingPostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action
  if (action !== 'complete' && action !== 'skip' && 'reset' !== action) {
    return NextResponse.json(
      { error: 'Invalid action. Expected complete | skip | reset.' },
      { status: 400 },
    )
  }

  if (action === 'complete') {
    await db.setting.upsert({
      where: { key: KEY_COMPLETED },
      update: { value: 'true' },
      create: { key: KEY_COMPLETED, value: 'true' },
    })
    // Completing also clears any prior "skipped" flag so the next
    // manual re-trigger doesn't immediately bail.
    await db.setting.deleteMany({ where: { key: KEY_SKIPPED } }).catch(() => undefined)
  } else if (action === 'skip') {
    await db.setting.upsert({
      where: { key: KEY_SKIPPED },
      update: { value: 'true' },
      create: { key: KEY_SKIPPED, value: 'true' },
    })
  } else {
    // reset — delete both keys so the tour re-enables.
    await db.setting
      .deleteMany({ where: { key: { in: [KEY_COMPLETED, KEY_SKIPPED] } } })
      .catch(() => undefined)
  }

  await db.log.create({
    data: {
      category: 'frontend',
      level: 'info',
      message: `Onboarding tour ${action}`,
      meta: JSON.stringify({ action, userId: user.id, username: user.username }),
    },
  })

  const state = await readState()
  return NextResponse.json({ ok: true, ...state })
}

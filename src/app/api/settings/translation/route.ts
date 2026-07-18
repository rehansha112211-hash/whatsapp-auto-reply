// ============================================================
// Translation settings API
//
// GET  /api/settings/translation
//   → { enabled: boolean, targetLanguage: string }
//
// PUT  /api/settings/translation   body: { enabled?, targetLanguage? }
//   → { ok: true, enabled, targetLanguage }
//
// Admin-only. Settings live in the Setting table under the
// keys `translation_enabled` and `translation_target_lang`.
// Defaults: enabled=true, targetLanguage="en".
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const KEY_ENABLED = 'translation_enabled'
const KEY_TARGET = 'translation_target_lang'

const SUPPORTED_TARGETS = new Set([
  'en', 'hi', 'es', 'fr', 'de', 'ar', 'zh', 'pt', 'ru', 'ja',
  'ko', 'it', 'tr', 'id', 'vi', 'th', 'bn', 'pa', 'gu', 'ta',
  'te', 'kn', 'ml', 'nl', 'sv', 'pl', 'uk', 'he',
])

interface TranslationSettings {
  enabled: boolean
  targetLanguage: string
}

async function readSettings(): Promise<TranslationSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: [KEY_ENABLED, KEY_TARGET] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const enabledRaw = map.get(KEY_ENABLED)
  const enabled =
    enabledRaw === undefined ? true : enabledRaw === 'true' || enabledRaw === '1'
  const targetRaw = map.get(KEY_TARGET)
  const targetLanguage =
    targetRaw && SUPPORTED_TARGETS.has(targetRaw) ? targetRaw : 'en'
  return { enabled, targetLanguage }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const settings = await readSettings()
  return NextResponse.json(settings)
}

interface PutBody {
  enabled?: unknown
  targetLanguage?: unknown
}

export async function PUT(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canManageSettings')) {
    return NextResponse.json(
      { error: 'You need admin role to manage translation settings' },
      { status: 403 },
    )
  }

  let body: PutBody
  try {
    body = (await req.json()) as PutBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const current = await readSettings()

  const enabled =
    typeof body.enabled === 'boolean' ? body.enabled : current.enabled

  let targetLanguage = current.targetLanguage
  if (typeof body.targetLanguage === 'string') {
    const normalized = body.targetLanguage.trim().toLowerCase()
    if (normalized && SUPPORTED_TARGETS.has(normalized)) {
      targetLanguage = normalized
    }
  }

  // Upsert both settings rows.
  await db.setting.upsert({
    where: { key: KEY_ENABLED },
    update: { value: enabled ? 'true' : 'false' },
    create: { key: KEY_ENABLED, value: enabled ? 'true' : 'false' },
  })
  await db.setting.upsert({
    where: { key: KEY_TARGET },
    update: { value: targetLanguage },
    create: { key: KEY_TARGET, value: targetLanguage },
  })

  await db.log.create({
    data: {
      category: 'frontend',
      level: 'info',
      message: 'Translation settings updated',
      meta: JSON.stringify({ enabled, targetLanguage }),
    },
  })

  return NextResponse.json({ ok: true, enabled, targetLanguage })
}

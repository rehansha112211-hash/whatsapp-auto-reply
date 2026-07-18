import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'

const MASK_PREFIX = '••••••••'

function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 4) return MASK_PREFIX
  return MASK_PREFIX + key.slice(-4)
}

function isMaskedPlaceholder(value: string): boolean {
  return value.startsWith('•')
}

interface AiSettingsPayload {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  systemPrompt?: string
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await db.apiSetting.findUnique({ where: { id: 'api' } })
  if (!row) {
    return NextResponse.json({
      id: 'api',
      provider: 'zai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKey: '',
      apiKeyMasked: '',
      model: 'glm-4.5',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 512,
      systemPrompt: '',
      status: 'untested',
      lastTestedAt: null,
      updatedAt: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    id: row.id,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: maskApiKey(row.apiKey),
    apiKeyMasked: maskApiKey(row.apiKey),
    model: row.model,
    temperature: row.temperature,
    topP: row.topP,
    maxTokens: row.maxTokens,
    systemPrompt: row.systemPrompt,
    status: row.status,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
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

  let body: AiSettingsPayload
  try {
    body = (await req.json()) as AiSettingsPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.apiSetting.findUnique({ where: { id: 'api' } })

  let apiKey = ''
  if (body.apiKey !== undefined) {
    if (isMaskedPlaceholder(body.apiKey)) {
      apiKey = existing?.apiKey ?? ''
    } else {
      apiKey = body.apiKey
    }
  } else {
    apiKey = existing?.apiKey ?? ''
  }

  const temperature = clampNumber(body.temperature, existing?.temperature ?? 0.7, 0, 2)
  const topP = clampNumber(body.topP, existing?.topP ?? 0.9, 0, 1)
  const maxTokens = clampInt(body.maxTokens, existing?.maxTokens ?? 512, 64, 4096)

  const data = {
    id: 'api',
    provider: body.provider ?? existing?.provider ?? 'zai',
    baseUrl: body.baseUrl ?? existing?.baseUrl ?? '',
    apiKey,
    model: body.model ?? existing?.model ?? 'glm-4.5',
    temperature,
    topP,
    maxTokens,
    systemPrompt: body.systemPrompt ?? existing?.systemPrompt ?? '',
    status: 'untested' as const,
    lastTestedAt: existing?.lastTestedAt ?? null,
  }

  const upserted = await db.apiSetting.upsert({
    where: { id: 'api' },
    update: {
      provider: data.provider,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      model: data.model,
      temperature: data.temperature,
      topP: data.topP,
      maxTokens: data.maxTokens,
      systemPrompt: data.systemPrompt,
      status: data.status,
    },
    create: data,
  })

  await db.log.create({
    data: {
      category: 'security',
      level: 'info',
      message: 'AI/API settings updated',
      meta: JSON.stringify({ provider: upserted.provider, model: upserted.model }),
    },
  })

  return NextResponse.json({
    ok: true,
    apiKey: maskApiKey(upserted.apiKey),
    apiKeyMasked: maskApiKey(upserted.apiKey),
    status: upserted.status,
    updatedAt: upserted.updatedAt.toISOString(),
  })
}

function clampNumber(
  incoming: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (incoming === undefined || Number.isNaN(incoming)) return fallback
  return Math.min(max, Math.max(min, Number(incoming)))
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

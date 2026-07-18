// ============================================================
// Translate API — manual translation endpoint.
//
// POST /api/translate   body: { text, from, to }
//   → { translated: string, from: string, to: string }
//
// Used by the chat UI when the owner clicks the Globe icon on
// a message that wasn't auto-translated (e.g. translation was
// disabled when it arrived, or the source language matched the
// target so no translation was stored). The endpoint is also
// useful for ad-hoc translations of outgoing AI replies.
// ============================================================
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { translateText, detectLanguage } from '@/lib/translate'

export const dynamic = 'force-dynamic'

interface TranslateBody {
  text?: unknown
  from?: unknown
  to?: unknown
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: TranslateBody
  try {
    body = (await req.json()) as TranslateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const toRaw = typeof body.to === 'string' ? body.to.trim().toLowerCase() : ''
  const fromRaw = typeof body.from === 'string' ? body.from.trim().toLowerCase() : ''

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  if (text.length > 4000) {
    return NextResponse.json(
      { error: 'Text too long (max 4000 chars)' },
      { status: 400 },
    )
  }

  const to = toRaw || 'en'
  // If the caller doesn't know the source language, detect it on the fly.
  let from = fromRaw
  if (!from) {
    try {
      from = await detectLanguage(text)
    } catch {
      from = 'auto'
    }
  }

  const translated = await translateText(text, from, to)

  return NextResponse.json({
    translated,
    from,
    to,
  })
}

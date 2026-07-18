// ============================================================
// Sentiment Analysis Library
//
// Lightweight sentiment + intent detection for incoming WhatsApp
// customer messages. Uses z-ai-web-dev-sdk LLM (glm-4.5) with a
// focused system prompt that returns strict JSON. Falls back to a
// heuristic keyword scan if the LLM is slow (>5s) or fails.
//
// This runs on EVERY incoming message, so it must stay fast and
// never throw — the message pipeline should not break if sentiment
// detection fails.
// ============================================================
import { callOpenRouter } from '@/lib/ai-engine'

export type SentimentLabel = 'positive' | 'neutral' | 'negative' | 'urgent'

export interface SentimentResult {
  sentiment: SentimentLabel
  score: number // -1.0 (very negative) to 1.0 (very positive)
  intent: string // short label like "pricing_inquiry", "complaint", ...
  summary: string // 1-line description of emotional tone
}

// Reuse the same singleton as ai-engine.ts so we don't spin up a
// second SDK instance on every message.
let zaiPromise: Promise<unknown> | null = null
async function getZAI() {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return (await zaiPromise) as Awaited<ReturnType<typeof ZAI.create>>
}

const SENTIMENT_TIMEOUT_MS = 5_000

const SYSTEM_PROMPT = `Analyze this WhatsApp customer message. Return JSON with: sentiment (positive/neutral/negative/urgent), score (-1.0 to 1.0), intent (short label like 'pricing_inquiry', 'complaint', 'greeting', 'purchase_intent', 'support_request', 'objection', 'question'), summary (1-line description of emotional tone). Respond with valid JSON only.`

// ----------------------------------------------------------------
// Heuristic fallback — keyword scan
// ----------------------------------------------------------------
const NEGATIVE_WORDS = [
  'angry', 'frustrated', 'disappointed', 'cancel', 'refund', 'bad',
  'terrible', 'horrible', 'useless', 'broken', 'worst', 'hate',
  'annoyed', 'unhappy', 'not working', 'scam', 'fraud', 'cheat',
  'pathetic', 'rude', 'slow', 'delay', 'ignore', 'waste',
]

const URGENT_WORDS = [
  'urgent', 'asap', 'immediately', 'emergency', 'right now', 'now',
  'critical', 'quickly', 'fast', 'today', 'important', 'priority',
  'right away', 'soon', 'deadline',
]

const POSITIVE_WORDS = [
  'great', 'awesome', 'love', 'thanks', 'thank you', 'happy',
  'good', 'excellent', 'amazing', 'perfect', 'nice', 'cool',
  'appreciate', 'fantastic', 'satisfied', 'pleased', 'wonderful',
  'brilliant', 'super', 'best',
]

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

function heuristicSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase()
  let intent = 'question'
  let sentiment: SentimentLabel = 'neutral'
  let score = 0

  // Urgent wins over negative wins over positive.
  const urgentHit = URGENT_WORDS.some((w) => lower.includes(w))
  const negativeHit = NEGATIVE_WORDS.some((w) => lower.includes(w))
  const positiveHit = POSITIVE_WORDS.some((w) => lower.includes(w))

  if (urgentHit) {
    sentiment = 'urgent'
    score = -0.85
    intent = lower.includes('cancel') || lower.includes('refund')
      ? 'complaint'
      : 'support_request'
  } else if (negativeHit) {
    sentiment = 'negative'
    score = -0.6
    intent = lower.includes('cancel') || lower.includes('refund')
      ? 'complaint'
      : 'objection'
  } else if (positiveHit) {
    sentiment = 'positive'
    score = 0.7
    intent = lower.match(/price|cost|quote|budget/) ? 'pricing_inquiry' : 'greeting'
  } else {
    // Tone-neutral intent detection from keywords.
    if (/price|cost|quote|budget|pricing|rate|fees?/.test(lower)) intent = 'pricing_inquiry'
    else if (/buy|purchase|order|subscribe|sign up|get started/.test(lower)) intent = 'purchase_intent'
    else if (/hello|hi|hey|namaste|good (morning|evening|afternoon)/.test(lower)) intent = 'greeting'
    else if (/help|support|issue|problem|not working|stuck/.test(lower)) intent = 'support_request'
    else if (/when|how|what|why|where|can you|do you/.test(lower)) intent = 'question'
    else intent = 'general'
    score = 0
  }

  return {
    sentiment,
    score: clampScore(score),
    intent,
    summary: defaultSummary(sentiment),
  }
}

function defaultSummary(s: SentimentLabel): string {
  switch (s) {
    case 'positive':
      return 'Customer sounds positive and friendly.'
    case 'negative':
      return 'Customer sounds frustrated or unhappy.'
    case 'urgent':
      return 'Customer needs urgent attention.'
    case 'neutral':
    default:
      return 'Customer tone is neutral / informational.'
  }
}

// ----------------------------------------------------------------
// JSON extraction — the LLM occasionally wraps JSON in prose or
// code fences. We try a few strategies before giving up.
// ----------------------------------------------------------------
function extractJson(raw: string): unknown | null {
  if (!raw) return null
  const trimmed = raw.trim()

  // Fast path — pure JSON.
  try {
    return JSON.parse(trimmed)
  } catch {
    /* fall through */
  }

  // Strip markdown code fences ```json ... ``` or ``` ... ```.
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch {
      /* fall through */
    }
  }

  // Grab the first {...} block we can find.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      /* fall through */
    }
  }
  return null
}

interface LLMResultShape {
  sentiment?: unknown
  score?: unknown
  intent?: unknown
  summary?: unknown
}

function normalizeLLMResult(raw: unknown): SentimentResult | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as LLMResultShape

  const sentimentRaw = typeof obj.sentiment === 'string' ? obj.sentiment.toLowerCase().trim() : ''
  let sentiment: SentimentLabel
  if (sentimentRaw === 'positive' || sentimentRaw === 'neutral' || sentimentRaw === 'negative' || sentimentRaw === 'urgent') {
    sentiment = sentimentRaw
  } else {
    return null // unknown label — caller falls back to heuristic
  }

  const scoreNum = typeof obj.score === 'number'
    ? obj.score
    : typeof obj.score === 'string'
      ? Number.parseFloat(obj.score)
      : NaN

  const intent = typeof obj.intent === 'string' && obj.intent.trim()
    ? obj.intent.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)
    : 'general'

  const summary = typeof obj.summary === 'string' && obj.summary.trim()
    ? obj.summary.trim().slice(0, 200)
    : defaultSummary(sentiment)

  return {
    sentiment,
    score: clampScore(Number.isFinite(scoreNum) ? scoreNum : 0),
    intent,
    summary,
  }
}

// ----------------------------------------------------------------
// Race the LLM call against a timeout. If it wins, parse + validate.
// Otherwise (or on error), fall back to the heuristic.
// ----------------------------------------------------------------
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Sentiment analysis timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { sentiment: 'neutral', score: 0, intent: 'empty', summary: 'Empty message.' }
  }

  try {
    const zai = await getZAI()
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          { role: 'user', content: trimmed.slice(0, 1200) },
        ],
        thinking: { type: 'disabled' },
      } as Record<string, unknown>),
      SENTIMENT_TIMEOUT_MS,
    )

    const raw = result.content.trim()
    const parsed = extractJson(raw)
    const normalized = normalizeLLMResult(parsed)
    if (normalized) return normalized

    // LLM returned something unparseable — fall back gracefully.
    return heuristicSentiment(trimmed)
  } catch {
    // LLM slow / error / unavailable — fall back gracefully.
    return heuristicSentiment(trimmed)
  }
}

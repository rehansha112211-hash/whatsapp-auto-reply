// ============================================================
// AI Engine - WhatsApp auto-reply generation using z-ai-web-dev-sdk
// Pipeline: build context -> LLM completion -> score lead -> persist memory
// ============================================================
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import type { LeadCategory } from '@/lib/types'
import { QORVIX_COMPANY } from '@/lib/types'

let zaiPromise: Promise<unknown> | null = null
async function getZAI() {
  if (!zaiPromise) zaiPromise = ZAI.create()
  return (await zaiPromise) as Awaited<ReturnType<typeof ZAI.create>>
}

export interface AIContext {
  contactId: string
  isFirstMessage: boolean
  customerLanguage: string
}

export interface AIReplyResult {
  reply: string
  leadScore: number
  category: LeadCategory
  ownerRequested: boolean
  memoryUpdates: { key: string; value: string }[]
  responseMs: number
  model: string
}

// Heuristic keyword detection -> lead category & owner-request intent
const CATEGORY_KEYWORDS: Record<LeadCategory, string[]> = {
  website: ['website', 'site', 'web page', 'landing page', 'portfolio', 'web development', 'wordpress', 'ecommerce', 'e-commerce', 'online store'],
  app: ['android app', 'mobile app', 'application', 'apk', 'play store', 'ios app', 'flutter', 'react native'],
  crm: ['crm', 'customer management', 'lead management', 'sales pipeline'],
  software: ['software', 'erp', 'pos', 'billing', 'inventory', 'management system', 'dashboard system'],
  ai_automation: ['ai', 'automation', 'chatbot', 'auto reply', 'whatsapp bot', 'bot', 'machine learning', 'automate'],
  maintenance: ['maintenance', 'bug fix', 'update', 'fix', 'support', 'not working', 'broken', 'error'],
  general: ['hello', 'hi', 'hey', 'namaste', 'information', 'details', 'question', 'query'],
  support: ['help', 'support', 'issue', 'problem', 'urgent', 'assistance'],
  high_priority: ['budget', 'ready to pay', 'urgent project', 'asap', 'immediately', 'contract', 'quote', 'pricing'],
}

const OWNER_REQUEST_KEYWORDS = [
  'talk to owner', 'speak to owner', 'owner', 'manager', 'human', 'connect me',
  'call me', 'real person', 'i need a human', 'human agent', 'talk to someone',
  'talk to human', 'manager please', 'owner se baat', 'owner se', 'insaan',
]

function detectCategory(text: string): LeadCategory {
  const lower = text.toLowerCase()
  let best: LeadCategory = 'general'
  let bestScore = 0
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS) as [LeadCategory, string[]][]) {
    let s = 0
    for (const kw of kws) if (lower.includes(kw)) s += kw.length
    if (s > bestScore) {
      bestScore = s
      best = cat
    }
  }
  return best
}

function detectOwnerRequest(text: string): boolean {
  const lower = text.toLowerCase()
  return OWNER_REQUEST_KEYWORDS.some((k) => lower.includes(k))
}

function detectLanguage(text: string): string {
  // Latin script with no devanagari and common Hindi-English mix words -> hinglish
  const hasDevanagari = /[\u0900-\u097F]/.test(text)
  if (hasDevanagari) return 'hi'
  const hinglishMarkers = ['hai', 'kya', 'kaise', 'bhai', 'yaar', 'kar', 'chahiye', 'chahta', 'madad', 'bat']
  const lower = text.toLowerCase()
  const hits = hinglishMarkers.filter((w) => new RegExp(`\\b${w}\\b`).test(lower)).length
  if (hits >= 1) return 'hinglish'
  return 'en'
}

// Keyword-based lead scoring (used to seed the LLM context and as a fallback)
function scoreLeadFromText(text: string, category: LeadCategory): number {
  const lower = text.toLowerCase()
  let score = 10
  const positives: [RegExp, number][] = [
    [/budget/gi, 12], [/quote|pricing|cost|price/gi, 10], [/urgent|asap|immediately/gi, 10],
    [/ready|want to|need|looking for/gi, 8], [/project/gi, 8], [/when|timeline|deadline/gi, 6],
    [/month|week|days/gi, 4], [/my business|our company/gi, 6],
  ]
  for (const [re, pts] of positives) if (re.test(text)) score += pts
  const catBonus: Record<LeadCategory, number> = {
    website: 18, app: 18, crm: 16, software: 16, ai_automation: 18,
    maintenance: 8, general: 2, support: 10, high_priority: 30,
  }
  score += catBonus[category] ?? 0
  // length signals detail
  if (text.length > 80) score += 4
  if (text.length > 200) score += 4
  // negativity / curiosity-only
  if (/just asking|curious|wondering/.test(lower)) score -= 8
  return Math.max(0, Math.min(100, score))
}

function buildSystemPrompt(opts: {
  company: { name: string; website: string; description: string; services: string[] }
  owner: { name: string; availability: string }
  greeting: string
  closing: string
  support: string
  businessHours: string
  isFirstMessage: boolean
  customerLanguage: string
  languagePref: string
  contactName: string
  memories: { key: string; value: string }[]
  ownerRequested: boolean
  detectedCategory: LeadCategory
  leadScore: number
  maxReplyLength: number
  currentTime: string
}): string {
  const lang =
    opts.languagePref === 'auto' ? opts.customerLanguage : opts.languagePref
  const memLines = opts.memories.length
    ? opts.memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')
    : '- (no memory yet)'
  const services = opts.company.services.join(', ')
  return `You are the official WhatsApp AI assistant for ${opts.company.name}.
Company website: ${opts.company.website}
About: ${opts.company.description}
Services we offer: ${services}
Business hours: ${opts.businessHours}
Owner name: ${opts.owner.name} (availability: ${opts.owner.availability}). NEVER share the owner's phone number with the customer automatically.

Conversation context:
- Customer name: ${opts.contactName || 'Unknown'}
- Current time: ${opts.currentTime}
- Detected interest category: ${opts.detectedCategory}
- Current lead score (0-100): ${opts.leadScore}
- This is the customer's first message: ${opts.isFirstMessage ? 'YES' : 'NO'}
- Customer requested to speak to the owner/human: ${opts.ownerRequested ? 'YES' : 'NO'}
- Reply language: ${lang === 'hi' ? 'Hindi (Devanagari)' : lang === 'hinglish' ? 'Hinglish (Romanized Hindi+English mix, natural)' : 'English'}

Customer memory (what we already know about them):
${memLines}

Greeting template (use only for first message): ${opts.greeting}
Closing template: ${opts.closing}
Support template: ${opts.support}

RULES (STRICT):
1. Keep replies SHORT and natural (max ~${opts.maxReplyLength} characters). Sound human, friendly, professional. Never robotic or repetitive.
2. ${opts.isFirstMessage ? 'This is the FIRST message: introduce the company briefly (who we are, what we do, how we can help), then invite the customer to share their requirement. Do NOT ask random questions first.' : 'Do NOT reintroduce the company. Continue the conversation naturally using the memory above.'}
3. If the customer asks for our website, portfolio, official site or company details, ALWAYS include the link: ${opts.company.website}
4. If the customer wants pricing, share that pricing depends on requirements and gently ask for project details so we can quote accurately.
5. ${opts.ownerRequested ? 'The customer asked to talk to the owner/human. Politely confirm the request has been forwarded to the team and they will be in touch soon. Do NOT invent a phone number.' : 'Do NOT mention the owner unless the customer asks.'}
6. Never reveal the owner's phone number.
7. Reply in the detected language. If the customer writes Hinglish, reply in Hinglish. If Hindi (Devanagari), reply in Hindi. If English, reply in English.
8. Ask at most ONE clarifying question per reply.
9. Never send the exact same reply twice.
10. Do not use markdown formatting, emojis are OK sparingly. Plain WhatsApp text only.

Return ONLY the reply text. No JSON, no quotes, no preamble.`
}

export async function generateReply(
  contactId: string,
  incomingText: string,
): Promise<AIReplyResult> {
  const started = Date.now()
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: { memories: true },
  })
  if (!contact) throw new Error('Contact not found for AI reply')

  const [company, owner, autoReply, apiSetting] = await Promise.all([
    db.company.findUnique({ where: { id: 'company' } }),
    db.owner.findUnique({ where: { id: 'owner' } }),
    db.autoReplySetting.findUnique({ where: { id: 'autoreply' } }),
    db.apiSetting.findUnique({ where: { id: 'api' } }),
  ])

  const services = company?.services
    ? safeJsonParse<string[]>(company.services, [])
    : []
  const companyCtx = {
    name: company?.name ?? QORVIX_COMPANY.name,
    website: company?.website ?? QORVIX_COMPANY.website,
    description: company?.description ?? QORVIX_COMPANY.description,
    services,
  }
  const ownerCtx = {
    name: owner?.name ?? 'Owner',
    availability: owner?.availability ?? 'available',
  }
  const customerLanguage = contact.language || detectLanguage(incomingText)
  const detectedCategory = detectCategory(incomingText)
  const ownerRequested = detectOwnerRequest(incomingText)
  const heuristicScore = scoreLeadFromText(incomingText, detectedCategory)

  const previousIncoming = await db.message.count({
    where: { contactId, direction: 'incoming' },
  })
  const isFirstMessage = previousIncoming <= 1

  const systemPrompt = buildSystemPrompt({
    company: companyCtx,
    owner: ownerCtx,
    greeting: autoReply?.greeting ?? '',
    closing: company?.closingMsg ?? '',
    support: company?.supportMsg ?? '',
    businessHours: company?.businessHours ?? 'Mon-Sat 9:00-19:00 IST',
    isFirstMessage,
    customerLanguage,
    languagePref: autoReply?.languagePref ?? 'auto',
    contactName: contact.name,
    memories: contact.memories.map((m) => ({ key: m.key, value: m.value })),
    ownerRequested,
    detectedCategory,
    leadScore: Math.max(contact.leadScore, heuristicScore),
    maxReplyLength: autoReply?.maxReplyLength ?? 600,
    currentTime: new Date().toISOString(),
  })

  // Load recent history for context (last 12 messages)
  const history = await db.message.findMany({
    where: { contactId },
    orderBy: { timestamp: 'desc' },
    take: 12,
  })
  const historyAsc = history.reverse().map((m) => ({
    role: (m.direction === 'incoming' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.text,
  }))

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'assistant', content: systemPrompt },
    ...historyAsc,
    { role: 'user', content: incomingText },
  ]

  let reply = ''
  let model = apiSetting?.model ?? 'glm-4.5'
  try {
    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      // @ts-expect-error SDK accepts messages with role assistant as system-like
      messages,
      thinking: { type: 'disabled' },
    } as Record<string, unknown>)
    reply = (completion?.choices?.[0]?.message?.content ?? '').trim()
    if (!reply) {
      reply = ownerRequested
        ? 'Sure, I have forwarded your request to our team. They will reach out to you shortly. Thank you for your patience!'
        : isFirstMessage
          ? `Hi! 👋 This is ${companyCtx.name}. We build websites, Android apps, AI automation, CRMs and business software. Tell us a bit about what you're looking for and we'll guide you from there.`
          : 'Thanks for your message! Could you share a little more detail so I can help you better?'
    }
    // Truncate to max reply length
    const maxLen = autoReply?.maxReplyLength ?? 600
    if (reply.length > maxLen) reply = reply.slice(0, maxLen - 1) + '…'
  } catch (err) {
    await db.log.create({
      data: {
        category: 'ai',
        level: 'error',
        message: `AI reply generation failed: ${(err as Error).message}`,
        meta: JSON.stringify({ contactId }),
      },
    })
    reply = ownerRequested
      ? 'I have forwarded your request to our team — they will contact you soon. Thank you!'
      : isFirstMessage
        ? `Hi! 👋 Welcome to ${companyCtx.name}. We offer ${services.slice(0, 4).join(', ')} and more. How can we help you today?`
        : 'Thanks for reaching out! Could you share more details so we can assist you better?'
  }

  // Update memory heuristically
  const memoryUpdates: { key: string; value: string }[] = []
  if (isFirstMessage) memoryUpdates.push({ key: 'first_message', value: incomingText.slice(0, 200) })
  memoryUpdates.push({ key: 'last_intent', value: detectedCategory })
  memoryUpdates.push({ key: 'language', value: customerLanguage })
  if (ownerRequested) memoryUpdates.push({ key: 'owner_requested', value: 'true' })
  if (/budget is\s+([0-9k,]+)/i.test(incomingText)) {
    const m = incomingText.match(/budget is\s+([0-9k,]+)/i)
    if (m) memoryUpdates.push({ key: 'budget', value: m[1] })
  }

  const finalScore = Math.max(contact.leadScore, heuristicScore)

  return {
    reply,
    leadScore: finalScore,
    category: detectedCategory,
    ownerRequested,
    memoryUpdates,
    responseMs: Date.now() - started,
    model,
  }
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

// Test AI connection
export async function testAIConnection(): Promise<{
  ok: boolean
  latencyMs: number
  model: string
  sample: string
  error?: string
}> {
  const started = Date.now()
  try {
    const apiSetting = await db.apiSetting.findUnique({ where: { id: 'api' } })
    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'Reply with exactly: PONG' },
        { role: 'user', content: 'ping' },
      ],
      thinking: { type: 'disabled' },
    } as Record<string, unknown>)
    const sample = (completion?.choices?.[0]?.message?.content ?? '').trim()
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: apiSetting?.model ?? 'glm-4.5',
      sample,
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      model: 'unknown',
      sample: '',
      error: (err as Error).message,
    }
  }
}

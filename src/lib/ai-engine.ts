// ============================================================
// AI Engine - WhatsApp auto-reply generation using OpenRouter API
// OpenRouter is an OpenAI-compatible API gateway that supports
// many models (GPT, Claude, Llama, Mistral, etc.)
// Pipeline: build context -> LLM completion -> score lead -> persist memory
// ============================================================
import { db } from '@/lib/db'
import type { LeadCategory } from '@/lib/types'
import { QORVIX_COMPANY } from '@/lib/types'

// ============================================================
// OpenRouter API client — uses the stored API key + base URL + model
// from the ApiSetting table. Falls back to environment defaults.
// ============================================================

const DEFAULT_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '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'
const DEFAULT_OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callOpenRouter(
  messages: ChatMessage[],
  opts: { temperature?: number; topP?: number; maxTokens?: number } = {},
): Promise<{ content: string; model: string }> {
  // Fetch the API settings from DB (or use defaults)
  let apiKey = DEFAULT_OPENROUTER_KEY
  let baseUrl = DEFAULT_OPENROUTER_BASE
  let model = DEFAULT_MODEL
  let temperature = opts.temperature ?? 0.7
  let topP = opts.topP ?? 0.9
  let maxTokens = opts.maxTokens ?? 512

  try {
    const settings = await db.apiSetting.findUnique({ where: { id: 'api' } })
    if (settings) {
      if (settings.apiKey && settings.apiKey.length > 10 && !settings.apiKey.startsWith('•')) {
        apiKey = settings.apiKey
      }
      if (settings.baseUrl) baseUrl = settings.baseUrl
      if (settings.model) model = settings.model
      temperature = settings.temperature
      topP = settings.topP
      maxTokens = settings.maxTokens
    }
  } catch {
    // DB not available — use defaults
  }

  const res = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://qorvixnodetechnologies.indevs.in',
      'X-Title': 'QorvixNode WhatsApp Auto Reply',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return { content: content.trim(), model: data?.model || model }
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

// ------------------------------------------------------------
// Knowledge Base — find active articles relevant to the incoming
// customer message. Returns the top N matches as {title, content}
// pairs, with each content truncated to keep the prompt concise.
// Never throws — KB enrichment is best-effort.
// ------------------------------------------------------------
const KB_MAX_ARTICLES = 5
const KB_MAX_CONTENT_CHARS = 500

const KB_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at',
  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
  'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she',
  'her', 'it', 'its', 'they', 'them', 'their', 'this', 'that', 'these',
  'those', 'of', 'as', 'want', 'need', 'like', 'get', 'got', 'hi', 'hello',
  'hey', 'please', 'help', 'just', 'how', 'what', 'why', 'who', 'when',
  'where', 'which', 'whom', 'whose', 'sir', 'madam', 'bhai', 'yaar',
])

function kbTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !KB_STOPWORDS.has(t))
}

function kbParseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

async function searchKnowledgeBase(
  query: string,
): Promise<{ title: string; content: string }[]> {
  try {
    const tokens = kbTokenize(query)
    if (tokens.length === 0) return []
    const rows = await db.knowledgeArticle.findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    })
    const scored: { title: string; content: string; score: number }[] = []
    for (const r of rows) {
      const titleLower = r.title.toLowerCase()
      const contentLower = r.content.toLowerCase()
      const tagsLower = kbParseTags(r.tags).map((t) => t.toLowerCase())
      let score = 0
      for (const tok of tokens) {
        if (titleLower.includes(tok)) score += 3
        if (contentLower.includes(tok)) score += 1
        if (tagsLower.some((t) => t.includes(tok))) score += 2
      }
      if (score <= 0) continue
      score += Math.max(0, r.priority) / 100
      scored.push({ title: r.title, content: r.content, score })
    }
    if (scored.length === 0) return []
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, KB_MAX_ARTICLES).map((s) => ({
      title: s.title,
      content:
        s.content.length > KB_MAX_CONTENT_CHARS
          ? s.content.slice(0, KB_MAX_CONTENT_CHARS).trimEnd() + '…'
          : s.content,
    }))
  } catch {
    return []
  }
}

function knowledgeBlock(articles: { title: string; content: string }[]): string {
  if (articles.length === 0) return ''
  const body = articles
    .map((a) => `### ${a.title}\n${a.content}`)
    .join('\n\n')
  return `KNOWLEDGE BASE CONTEXT (use this information to answer the customer's question accurately — never contradict these facts):
${body}

`
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
  knowledgeArticles: { title: string; content: string }[]
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

${knowledgeBlock(opts.knowledgeArticles)}
RULES (STRICT):
1. Keep replies SHORT and natural (max ~${opts.maxReplyLength} characters). Sound human, friendly, professional. Never robotic or repetitive.
2. ${opts.isFirstMessage ? 'This is the FIRST message: introduce the company briefly (who we are, what we do, how we can help), then invite the customer to share their requirement. Do NOT ask random questions first.' : 'Do NOT reintroduce the company. Continue the conversation naturally using the memory above.'}
3. If the customer asks for our website, portfolio, official site or company details, ALWAYS include the link: ${opts.company.website}
4. If the customer wants pricing, services, timelines, refund or policy info, USE THE KNOWLEDGE BASE CONTEXT BELOW to give an accurate, company-specific answer. Always frame pricing as "depends on requirements" and ask for project details so we can quote accurately. Never invent numbers outside the ranges listed in the knowledge base.
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

  // Find knowledge base articles relevant to this customer's message.
  // Best-effort — KB enrichment never blocks the reply pipeline.
  const knowledgeArticles = await searchKnowledgeBase(incomingText)

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
    knowledgeArticles,
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

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyAsc,
    { role: 'user', content: incomingText },
  ]

  let reply = ''
  let model = DEFAULT_MODEL
  try {
    const result = await callOpenRouter(messages as ChatMessage[])
    reply = result.content
    model = result.model
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
    const result = await callOpenRouter([
      { role: 'system', content: 'Reply with exactly: PONG' },
      { role: 'user', content: 'ping' },
    ], { maxTokens: 10 })
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: result.model,
      sample: result.content,
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

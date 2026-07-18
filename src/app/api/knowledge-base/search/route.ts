// ============================================================
// Knowledge Base Search API
//
// GET /api/knowledge-base/search?q=<query>
//
// Lightweight token-based relevance search used by the AI engine
// to fetch the most relevant active articles for an incoming
// customer message. Returns the top 5 matches with a relevance
// score (0..1). Scoring:
//   · token match in title  → weight 3
//   · token match in tags   → weight 2
//   · token match in content→ weight 1
//   · priority bonus        → +priority/100 (max +1)
// Final score normalised against the highest-scoring hit.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { KnowledgeSearchHit } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MAX_RESULTS = 5
const MIN_QUERY_LEN = 2

// Common words that don't carry intent — filtered out before search.
const STOPWORDS = new Set([
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_QUERY_LEN && !STOPWORDS.has(t))
}

function parseTags(raw: string): string[] {
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

interface ScoredRow {
  id: string
  title: string
  content: string
  category: string
  rawScore: number
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  if (!q) {
    return NextResponse.json({ items: [] })
  }

  const tokens = tokenize(q)
  if (tokens.length === 0) {
    return NextResponse.json({ items: [] })
  }

  // Fetch all active articles. The KB is expected to stay small
  // (tens to low hundreds), so loading everything into memory is
  // cheaper than building a SQLite FTS5 index.
  const rows = await db.knowledgeArticle.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  const scored: ScoredRow[] = []
  for (const r of rows) {
    const titleLower = r.title.toLowerCase()
    const contentLower = r.content.toLowerCase()
    const tagsLower = parseTags(r.tags).map((t) => t.toLowerCase())
    let score = 0
    for (const tok of tokens) {
      if (titleLower.includes(tok)) score += 3
      if (contentLower.includes(tok)) score += 1
      if (tagsLower.some((t) => t.includes(tok))) score += 2
    }
    if (score <= 0) continue
    // Priority bonus (max +1): higher-priority articles edge out
    // equally-matching lower-priority ones.
    score += Math.max(0, r.priority) / 100
    scored.push({
      id: r.id,
      title: r.title,
      content: r.content,
      category: r.category,
      rawScore: score,
    })
  }

  if (scored.length === 0) {
    return NextResponse.json({ items: [] })
  }

  scored.sort((a, b) => b.rawScore - a.rawScore)
  const top = scored.slice(0, MAX_RESULTS)
  const maxScore = top[0].rawScore || 1

  const items: KnowledgeSearchHit[] = top.map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    category: s.category,
    relevance: Math.max(0.05, Math.round((s.rawScore / maxScore) * 100) / 100),
  }))

  return NextResponse.json({ items })
}

// ============================================================
// Global Message Search API
//
// GET /api/search?q=<query>&limit=<n>&direction=<in|out>&contactId=<id>
//
// Searches the Message table (text column, case-insensitive LIKE)
// across ALL conversations and returns matched messages with their
// contact info, a snippet window around the first match, and a
// contactsFacet for faceted filtering.
//
// Returns:
//   {
//     items: SearchMessageItem[],   // sorted by timestamp DESC
//     total: number,                // total matches (before limit)
//     limit: number,
//     q: string,
//     contactsFacet: ContactFacetItem[]
//   }
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type {
  SearchMessageItem,
  SearchResponse,
  ContactFacetItem,
  MessageDirection,
  MessageSource,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

const SNIPPET_WINDOW = 120 // characters around the first match
const MIN_QUERY_LEN = 2
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function isValidDirection(v: string | null): v is 'incoming' | 'outgoing' {
  return v === 'incoming' || v === 'outgoing'
}

// Build a ~`SNIPPET_WINDOW` char window around the first match of `needle`
// in `text` (case-insensitive). Returns the snippet text, the start index of
// the match within the snippet, and the length of the match within the
// snippet (equal to needle.length because we slice original text).
function buildSnippet(
  text: string,
  needleLower: string,
): { snippet: string; matchStart: number; matchLength: number } {
  const idx = text.toLowerCase().indexOf(needleLower)
  if (idx === -1) {
    // No match in this row (shouldn't happen because we filtered, but guard).
    return {
      snippet: text.slice(0, SNIPPET_WINDOW),
      matchStart: -1,
      matchLength: 0,
    }
  }
  const matchLength = needleLower.length
  const half = Math.floor((SNIPPET_WINDOW - matchLength) / 2)
  let start = idx - half
  if (start < 0) start = 0
  let end = start + SNIPPET_WINDOW
  if (end > text.length) end = text.length
  // Re-adjust start if we shortened end so we still try to fill the window.
  if (end - start < SNIPPET_WINDOW && start > 0) {
    start = Math.max(0, end - SNIPPET_WINDOW)
  }
  const snippet = text.slice(start, end)
  const matchStartInSnippet = idx - start
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return {
    snippet: prefix + snippet + suffix,
    // Offset the match start by 1 if we added the leading ellipsis.
    matchStart: prefix.length + matchStartInSnippet,
    matchLength,
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json(
      { error: `Query must be at least ${MIN_QUERY_LEN} characters` },
      { status: 400 },
    )
  }

  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(MAX_LIMIT, Math.floor(limitRaw))
      : DEFAULT_LIMIT

  const direction = isValidDirection(searchParams.get('direction'))
    ? (searchParams.get('direction') as 'incoming' | 'outgoing')
    : null
  const source = (searchParams.get('source') ?? '').trim() || null
  const contactId = (searchParams.get('contactId') ?? '').trim() || null

  // --- Build the Prisma where clause ---
  // SQLite's LIKE is case-insensitive for ASCII by default. We use
  // contains with insensitive mode (Prisma maps to LIKE on SQLite).
  const where: {
    text: { contains: string }
    direction?: string
    source?: string
    contactId?: string
  } = {
    text: { contains: q },
  }
  if (direction) where.direction = direction
  if (source) where.source = source
  if (contactId) where.contactId = contactId

  // --- Run two queries in parallel: the paged matches and the total count ---
  const [rows, total] = await Promise.all([
    db.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: {
        id: true,
        contactId: true,
        direction: true,
        source: true,
        text: true,
        timestamp: true,
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            leadScore: true,
          },
        },
      },
    }),
    db.message.count({ where }),
  ])

  // --- Build a facet over contacts: match counts per contactId ---
  // groupBy gives us counts without re-fetching rows.
  const facetRows = await db.message.groupBy({
    by: ['contactId'],
    where,
    _count: { _all: true },
    orderBy: { _count: { contactId: 'desc' } },
  })

  // Resolve contact names for the facet (facetRows only has contactId + count).
  const facetContactIds = facetRows.map((r) => r.contactId)
  const facetContacts = facetContactIds.length
    ? await db.contact.findMany({
        where: { id: { in: facetContactIds } },
        select: { id: true, name: true },
      })
    : []
  const facetNameMap = new Map<string, string>()
  for (const c of facetContacts) facetNameMap.set(c.id, c.name)

  const contactsFacet: ContactFacetItem[] = facetRows.map((r) => ({
    contactId: r.contactId,
    contactName: facetNameMap.get(r.contactId) ?? 'Unknown',
    count: r._count._all,
  }))

  // --- Map rows to SearchMessageItem (with snippet) ---
  const needleLower = q.toLowerCase()
  const items: SearchMessageItem[] = rows.map((m) => {
    const snip = buildSnippet(m.text, needleLower)
    return {
      messageId: m.id,
      contactId: m.contactId,
      contactName: m.contact.name,
      contactPhone: m.contact.phone,
      text: m.text,
      direction: m.direction as MessageDirection,
      source: m.source as MessageSource,
      timestamp: m.timestamp.toISOString(),
      leadScore: m.contact.leadScore,
      matchedSnippet: snip.snippet,
      matchStart: snip.matchStart,
      matchLength: snip.matchLength,
    }
  })

  const body: SearchResponse = {
    items,
    total,
    limit,
    q,
    contactsFacet,
  }
  return NextResponse.json(body)
}

// ============================================================
// Chats API
// GET /api/chats → { items: ChatListItem[] }
//
// Builds a WhatsApp-style conversation list. Each row combines a
// contact with its most-recent message and unread incoming count.
// Pinned conversations always float to the top regardless of sort.
//
// Query params:
//   search  — substring on name / phone / lastMessage
//   filter  — all | unread | lead | hot | ai | human | pinned
//   tag     — tag name; restricts the list to contacts carrying that tag
//   sort    — recent | oldest | score_desc | score_asc
//   limit   — cap on number of rows (default 100, max 500)
//   phone   — filter to a specific phone (used by the simulator)
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { ChatListItem, TagItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

type FilterKey = 'all' | 'unread' | 'lead' | 'hot' | 'ai' | 'human' | 'pinned'
type SortKey = 'recent' | 'oldest' | 'score_desc' | 'score_asc'

const VALID_FILTERS: readonly FilterKey[] = [
  'all',
  'unread',
  'lead',
  'hot',
  'ai',
  'human',
  'pinned',
] as const

const VALID_SORTS: readonly SortKey[] = [
  'recent',
  'oldest',
  'score_desc',
  'score_asc',
] as const

function isFilterKey(v: string | null): v is FilterKey {
  return v !== null && (VALID_FILTERS as readonly string[]).includes(v)
}

function isSortKey(v: string | null): v is SortKey {
  return v !== null && (VALID_SORTS as readonly string[]).includes(v)
}

function mapTag(t: { id: string; name: string; color: string }): TagItem {
  return { id: t.id, name: t.name, color: t.color }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const filter: FilterKey = isFilterKey(searchParams.get('filter'))
    ? (searchParams.get('filter') as FilterKey)
    : 'all'
  const sort: SortKey = isSortKey(searchParams.get('sort'))
    ? (searchParams.get('sort') as SortKey)
    : 'recent'
  const phone = (searchParams.get('phone') ?? '').trim()
  const tag = (searchParams.get('tag') ?? '').trim()

  const limitRaw = Number(searchParams.get('limit') ?? 100)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(500, Math.floor(limitRaw))
      : 100

  // --- Build Prisma where clause ---
  const where: {
    phone?: string
    pinned?: boolean
    humanMode?: boolean
    leadScore?: { gte: number }
    status?: string
    tags?: { some: { tag: { name: string } } }
  } = {}
  if (phone) where.phone = phone
  if (filter === 'pinned') where.pinned = true
  if (filter === 'human') where.humanMode = true
  if (filter === 'lead') where.status = 'lead'
  if (filter === 'hot') where.leadScore = { gte: 70 }
  if (tag) where.tags = { some: { tag: { name: tag } } }

  // --- Fetch contacts with their latest message + tags in one shot ---
  // SQLite doesn't have great native support for "unread count" via
  // relation aggregation, so we fetch contacts + last message via
  // include, and compute unread counts in a single groupBy pass.
  const contacts = await db.contact.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    include: {
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: { text: true, timestamp: true, direction: true, source: true },
      },
      tags: {
        orderBy: [{ tag: { name: 'asc' } }],
        select: { tag: { select: { id: true, name: true, color: true } } },
      },
    },
    take: limit * 2, // over-fetch so post-filters don't starve the limit
  })

  const contactIds = contacts.map((c) => c.id)

  // --- Unread counts: one groupBy query ---
  const unreadGroups = contactIds.length
    ? await db.message.groupBy({
        by: ['contactId'],
        where: {
          contactId: { in: contactIds },
          direction: 'incoming',
          read: false,
        },
        _count: { _all: true },
      })
    : []

  const unreadMap = new Map<string, number>()
  for (const g of unreadGroups) {
    unreadMap.set(g.contactId, g._count._all)
  }

  // --- Map to ChatListItem ---
  let items: ChatListItem[] = contacts.map((c) => {
    const last = c.messages[0]
    return {
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      lastMessage: last?.text ?? '',
      lastMessageAt: last?.timestamp.toISOString() ?? c.lastMessageAt?.toISOString() ?? null,
      lastDirection: last?.direction ?? 'incoming',
      unread: unreadMap.get(c.id) ?? 0,
      leadScore: c.leadScore,
      detectedService: c.detectedService ?? '',
      pinned: c.pinned,
      humanMode: c.humanMode,
      status: c.status,
      tags: c.tags.map((ct) => mapTag(ct.tag)),
    }
  })

  // --- Post-fetch filters that need the joined fields ---
  if (filter === 'unread') {
    items = items.filter((i) => i.unread > 0)
  } else if (filter === 'ai') {
    // AI active = NOT in human mode (AI is handling the conversation)
    items = items.filter((i) => !i.humanMode)
  }

  // --- Search (name / phone / lastMessage) ---
  if (search) {
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(search) ||
        i.phone.toLowerCase().includes(search) ||
        i.lastMessage.toLowerCase().includes(search),
    )
  }

  // --- Sort (pinned always float to the top regardless of sort key) ---
  const sortFn: Record<SortKey, (a: ChatListItem, b: ChatListItem) => number> = {
    recent: (a, b) => ts(b.lastMessageAt) - ts(a.lastMessageAt),
    oldest: (a, b) => ts(a.lastMessageAt) - ts(b.lastMessageAt),
    score_desc: (a, b) => b.leadScore - a.leadScore,
    score_asc: (a, b) => a.leadScore - b.leadScore,
  }
  items.sort((a, b) => {
    // Pinned always first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return sortFn[sort](a, b)
  })

  // --- Apply limit last ---
  if (items.length > limit) items = items.slice(0, limit)

  return NextResponse.json({ items })
}

function ts(iso: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

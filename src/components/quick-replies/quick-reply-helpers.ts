// ============================================================
// Quick Reply helpers — shared constants, types, and pure
// functions used by the picker popover, slash-command dropdown,
// and the manager dialog.
// ============================================================
import type { QuickReplyRow } from '@/lib/types'

export type QuickReplyCategoryKey =
  | 'greeting'
  | 'pricing'
  | 'hours'
  | 'support'
  | 'general'

export interface CategoryMeta {
  label: string
  badge: string // tailwind classes for the badge
  dot: string // tailwind class for the dot swatch
}

export const CATEGORY_META: Record<QuickReplyCategoryKey, CategoryMeta> = {
  greeting: {
    label: 'Greeting',
    badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    dot: 'bg-emerald-500',
  },
  pricing: {
    label: 'Pricing',
    badge: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    dot: 'bg-amber-500',
  },
  hours: {
    label: 'Hours',
    badge: 'border-sky-500/30 bg-sky-500/15 text-sky-300',
    dot: 'bg-sky-500',
  },
  support: {
    label: 'Support',
    badge: 'border-violet-500/30 bg-violet-500/15 text-violet-300',
    dot: 'bg-violet-500',
  },
  general: {
    label: 'General',
    badge: 'border-zinc-500/30 bg-zinc-500/15 text-zinc-300',
    dot: 'bg-zinc-500',
  },
}

export const CATEGORY_ORDER: QuickReplyCategoryKey[] = [
  'greeting',
  'pricing',
  'support',
  'hours',
  'general',
]

export function categoryMeta(cat: string): CategoryMeta {
  return (
    CATEGORY_META[cat as QuickReplyCategoryKey] ?? {
      label: cat || 'General',
      badge: CATEGORY_META.general.badge,
      dot: CATEGORY_META.general.dot,
    }
  )
}

// Group + sort quick replies by category (CATEGORY_ORDER) then shortcut.
export interface QuickReplyGroup {
  key: QuickReplyCategoryKey
  label: string
  items: QuickReplyRow[]
}

export function groupByCategory(items: QuickReplyRow[]): QuickReplyGroup[] {
  const map = new Map<QuickReplyCategoryKey, QuickReplyRow[]>()
  for (const item of items) {
    const key = (item.category as QuickReplyCategoryKey) in CATEGORY_META
      ? (item.category as QuickReplyCategoryKey)
      : 'general'
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.shortcut.localeCompare(b.shortcut))
  }
  return CATEGORY_ORDER.filter((k) => map.has(k)).map((k) => ({
    key: k,
    label: CATEGORY_META[k].label,
    items: map.get(k)!,
  }))
}

// Filter quick replies by a free-text query (matches shortcut / title / body).
export function filterQuickReplies(
  items: QuickReplyRow[],
  query: string,
): QuickReplyRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((it) => {
    const hay = `${it.shortcut} ${it.title} ${it.body}`.toLowerCase()
    return hay.includes(q)
  })
}

// One-line preview of the body (first line, truncated).
export function bodyPreview(body: string, max = 80): string {
  const firstLine = body.split('\n')[0]?.trim() ?? ''
  if (firstLine.length <= max) return firstLine
  return firstLine.slice(0, max - 1).trimEnd() + '…'
}

// ------------------------------------------------------------
// Slash-command detection
// ------------------------------------------------------------
// Given the current textarea value and the cursor position, detect
// whether the user is mid-way through typing a `/shortcut` token.
// Returns the partial text (without the leading `/`) and the start
// index of the `/` character in the textarea value, or null when no
// slash command is active at the cursor.
export interface SlashDetection {
  partial: string
  start: number // index of the '/' character
  end: number // index of the cursor (exclusive)
}

export function detectSlashCommand(
  text: string,
  cursor: number,
): SlashDetection | null {
  if (cursor <= 0) return null
  // Walk backwards from the cursor until whitespace or start of string.
  let i = cursor - 1
  while (i >= 0 && !/\s/.test(text[i])) i--
  const start = i + 1
  const token = text.slice(start, cursor)
  if (!token.startsWith('/')) return null
  // The '/' must be at the very start of the text, OR immediately preceded
  // by whitespace (so "hello/world" does not trigger).
  if (start > 0 && !/\s/.test(text[start - 1])) return null
  const partial = token.slice(1)
  // Partial must be empty or alphanumeric/underscore.
  if (partial !== '' && !/^[a-zA-Z0-9_]+$/.test(partial)) return null
  return { partial, start, end: cursor }
}

// Match quick replies for a slash command: prefix match on shortcut,
// falling back to a body/title includes. Sorted by usageCount desc then
// shortcut asc so the most-used replies float to the top.
export function matchSlash(
  items: QuickReplyRow[],
  partial: string,
): QuickReplyRow[] {
  const p = partial.toLowerCase()
  const scored = items
    .map((it) => {
      const sc = it.shortcut.toLowerCase()
      let score = 0
      if (sc === p) score = 100
      else if (sc.startsWith(p)) score = 80
      else if (sc.includes(p)) score = 60
      else if (
        it.title.toLowerCase().includes(p) ||
        it.body.toLowerCase().includes(p)
      ) {
        score = 40
      }
      return { it, score }
    })
    .filter((x) => x.score > 0)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.it.usageCount !== a.it.usageCount) {
      return b.it.usageCount - a.it.usageCount
    }
    return a.it.shortcut.localeCompare(b.it.shortcut)
  })
  return scored.map((x) => x.it)
}

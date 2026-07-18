'use client'

// ============================================================
// SearchView — global message search across ALL conversations.
//
// Layout:
//   · Large search bar (auto-focus, 300ms debounce)
//   · Filter chips: All / Incoming / Outgoing / AI / Owner / Customer
//   · Left sidebar (lg+): contacts facet with match counts
//   · Main area: result cards with matched-term highlight + Load more
//
// Each result card shows contact avatar, name, phone (clickable → chats),
// direction/source badge, the message snippet with the query highlighted
// in a <mark>, timestamp, and lead badge.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  MessageSquare,
  ArrowRight,
  Filter,
  Inbox,
  Sparkles,
  Loader2,
  ArrowDownUp,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'
import {
  formatDateTime,
  colorFromString,
  initials,
  findMatchSegments,
  type MatchSegment,
} from '@/lib/format'
import type {
  ViewKey,
  SearchResponse,
  SearchMessageItem,
  ContactFacetItem,
  MessageDirection,
  MessageSource,
} from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LeadBadge } from '@/components/status'

const DEBOUNCE_MS = 300
const PAGE_SIZE = 50
const MAX_QUERY_LEN = 200

// Filter chips: each maps to a (direction?, source?) pair sent to the API.
interface FilterChip {
  key: string
  label: string
  direction?: MessageDirection
  source?: MessageSource
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'all', label: 'All' },
  { key: 'incoming', label: 'Incoming', direction: 'incoming' },
  { key: 'outgoing', label: 'Outgoing', direction: 'outgoing' },
  { key: 'ai', label: 'AI', source: 'ai' },
  { key: 'owner', label: 'Owner', source: 'owner' },
  { key: 'customer', label: 'Customer', source: 'customer' },
]

const SUGGESTIONS = ['website', 'budget', 'owner', 'price', 'project', 'demo', 'meeting']

// ------------------------------------------------------------
// Direction / source badge styling (WhatsApp-green palette)
// ------------------------------------------------------------
function directionBadge(d: MessageDirection, s: MessageSource): { label: string; cls: string } {
  const dirLabel = d === 'incoming' ? 'Incoming' : 'Outgoing'
  // Source-aware colors: incoming=emerald, outgoing=teal, AI=emerald, owner=sky
  let cls = ''
  if (s === 'ai') cls = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  else if (s === 'owner') cls = 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  else if (s === 'customer') cls = 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  else if (d === 'incoming') cls = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  else cls = 'bg-teal-500/15 text-teal-300 border-teal-500/30'

  const srcLabel =
    s === 'ai' ? 'AI' : s === 'owner' ? 'Owner' : s === 'customer' ? 'Customer' : 'System'
  return { label: `${dirLabel} · ${srcLabel}`, cls }
}

// ------------------------------------------------------------
// Snippet renderer — highlights the matched portion of the snippet
// using the matchStart/matchLength returned by the API, plus any
// additional occurrences (via findMatchSegments for safety).
// ------------------------------------------------------------
function HighlightedSnippet({
  snippet,
  query,
}: {
  snippet: string
  query: string
}) {
  // The API already truncated the snippet to a window, but we still
  // re-run findMatchSegments on the snippet text so ALL occurrences of
  // the query inside the snippet are highlighted (not just the first).
  const segments: MatchSegment[] = findMatchSegments(snippet, query)
  return (
    <p className="text-sm leading-relaxed text-foreground/90">
      {segments.map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="rounded bg-emerald-500/30 px-0.5 text-emerald-200"
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </p>
  )
}

// ------------------------------------------------------------
// Avatar (small, self-contained — same colour system as chats-view)
// ------------------------------------------------------------
function Avatar({ name, phone }: { name: string; phone: string }) {
  const cls = colorFromString(name || phone)
  return (
    <div
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold',
        cls,
      )}
      aria-hidden
    >
      {initials(name || phone)}
    </div>
  )
}

// ------------------------------------------------------------
// Result card
// ------------------------------------------------------------
interface ResultCardProps {
  item: SearchMessageItem
  query: string
  index: number
  onNavigate?: (v: ViewKey) => void
}

function ResultCard({ item, query, index, onNavigate }: ResultCardProps) {
  const dir = directionBadge(item.direction, item.source)
  const handleOpen = () => onNavigate?.('chats')
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.3) }}
    >
      <Card
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpen()
          }
        }}
        className="group cursor-pointer rounded-lg border bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex items-start gap-3">
          <Avatar name={item.contactName} phone={item.contactPhone} />

          <div className="min-w-0 flex-1">
            {/* Top row: contact name + phone + badges */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onNavigate?.('chats')
                }}
                className="truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
              >
                {item.contactName}
              </button>
              <span className="font-mono text-[11px] text-muted-foreground">
                {item.contactPhone}
              </span>
              <Badge
                variant="outline"
                className={cn('px-1.5 py-0 text-[10px] font-medium', dir.cls)}
              >
                {dir.label}
              </Badge>
              <LeadBadge score={item.leadScore} />
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {formatDateTime(item.timestamp)}
              </span>
            </div>

            {/* Snippet with highlight */}
            <div className="mt-2">
              <HighlightedSnippet snippet={item.matchedSnippet} query={query} />
            </div>

            {/* Footer hint */}
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/80 opacity-0 transition-opacity group-hover:opacity-100">
              <ArrowRight className="h-3 w-3 text-emerald-400" />
              <span>Open conversation</span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// ------------------------------------------------------------
// Empty state (no query yet)
// ------------------------------------------------------------
function EmptyState({
  onPick,
}: {
  onPick: (q: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-card/30 px-6 py-16 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
        <Inbox className="h-7 w-7" />
      </div>
      <div>
        <h3 className="text-base font-semibold">Search every message</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Type a keyword above to search across every conversation — incoming,
          outgoing, AI replies, and owner messages.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Try:
        </span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Sparkles className="h-3 w-3 text-emerald-400" />
            {s}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ------------------------------------------------------------
// No results state
// ------------------------------------------------------------
function NoResults({ query }: { query: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-card/30 px-6 py-16 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-full bg-zinc-500/10 text-zinc-400">
        <Search className="h-7 w-7" />
      </div>
      <div>
        <h3 className="text-base font-semibold">
          No messages found for &ldquo;{query}&rdquo;
        </h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Try different keywords, check your spelling, or remove filters to
          widen the search.
        </p>
      </div>
    </motion.div>
  )
}

// ------------------------------------------------------------
// Contacts facet sidebar
// ------------------------------------------------------------
interface FacetSidebarProps {
  facets: ContactFacetItem[]
  activeContactId: string | null
  onSelect: (contactId: string | null) => void
  total: number
}

function FacetSidebar({
  facets,
  activeContactId,
  onSelect,
  total,
}: FacetSidebarProps) {
  return (
    <div className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Contacts
        </div>
        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              'flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors',
              activeContactId === null
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-2">
              <ArrowDownUp className="h-3.5 w-3.5" />
              All contacts
            </span>
            <Badge
              variant="secondary"
              className="bg-muted/60 text-muted-foreground px-1.5 py-0 text-[10px] tabular-nums"
            >
              {total}
            </Badge>
          </button>
          {facets.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-muted-foreground">
              No contact matches yet.
            </p>
          ) : (
            facets.map((f) => {
              const active = activeContactId === f.contactId
              return (
                <button
                  key={f.contactId}
                  type="button"
                  onClick={() => onSelect(active ? null : f.contactId)}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold',
                        colorFromString(f.contactName),
                      )}
                    >
                      {initials(f.contactName)}
                    </span>
                    <span className="truncate">{f.contactName}</span>
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'px-1.5 py-0 text-[10px] tabular-nums',
                      active
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    {f.count}
                  </Badge>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Mobile facet chips (horizontal scroll, shown below lg)
// ------------------------------------------------------------
function FacetChipsMobile({
  facets,
  activeContactId,
  onSelect,
}: {
  facets: ContactFacetItem[]
  activeContactId: string | null
  onSelect: (contactId: string | null) => void
}) {
  if (facets.length === 0) return null
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden [scrollbar-width:thin]">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
          activeContactId === null
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-border/70 bg-background text-muted-foreground hover:text-foreground',
        )}
      >
        All
      </button>
      {facets.map((f) => {
        const active = activeContactId === f.contactId
        return (
          <button
            key={f.contactId}
            type="button"
            onClick={() => onSelect(active ? null : f.contactId)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
              active
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/70 bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="max-w-[120px] truncate">{f.contactName}</span>
            <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] tabular-nums text-emerald-300">
              {f.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------
// Main view
// ------------------------------------------------------------
export function SearchView({ onNavigate }: { onNavigate?: (v: ViewKey) => void }) {
  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [activeFilter, setActiveFilter] = React.useState<string>('all')
  const [activeContactId, setActiveContactId] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<SearchMessageItem[]>([])
  const [facets, setFacets] = React.useState<ContactFacetItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)

  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // Auto-focus on mount
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  // Debounce the query (300ms). Only search for queries of length >= 2.
  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setDebounced('')
      setItems([])
      setFacets([])
      setTotal(0)
      setHasSearched(false)
      setError(null)
      return
    }
    const t = setTimeout(() => setDebounced(q), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // Build the API URL with the active filter + contact facet.
  const buildUrl = React.useCallback(
    (q: string, lim: number) => {
      const chip = FILTER_CHIPS.find((c) => c.key === activeFilter) ?? FILTER_CHIPS[0]
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('limit', String(lim))
      if (chip.direction) params.set('direction', chip.direction)
      if (chip.source) params.set('source', chip.source)
      if (activeContactId) params.set('contactId', activeContactId)
      return `/api/search?${params.toString()}`
    },
    [activeFilter, activeContactId],
  )

  // Run the search whenever debounced query, filter, or contact facet changes.
  React.useEffect(() => {
    if (!debounced) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setLimit(PAGE_SIZE) // reset paging on new query/filter
    apiGet<SearchResponse>(buildUrl(debounced, PAGE_SIZE))
      .then((d) => {
        if (cancelled) return
        setItems(d.items ?? [])
        setFacets(d.contactsFacet ?? [])
        setTotal(d.total ?? 0)
        setHasSearched(true)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Search failed')
        setItems([])
        setFacets([])
        setTotal(0)
        setHasSearched(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, buildUrl])

  // When the contact facet changes, we want a fresh search but keep the
  // current limit (so "Load more" persists across facet switches).
  // buildUrl already depends on activeContactId, so this is handled by
  // the effect above.

  const handleLoadMore = async () => {
    if (!debounced) return
    const nextLimit = Math.min(limit + PAGE_SIZE, 200)
    setLoading(true)
    try {
      const d = await apiGet<SearchResponse>(buildUrl(debounced, nextLimit))
      setItems(d.items ?? [])
      setTotal(d.total ?? 0)
      setLimit(nextLimit)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load more failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    setDebounced('')
    setItems([])
    setFacets([])
    setTotal(0)
    setHasSearched(false)
    setActiveContactId(null)
    setActiveFilter('all')
    inputRef.current?.focus()
  }

  const handlePickSuggestion = (s: string) => {
    setQuery(s)
    inputRef.current?.focus()
  }

  const activeChip = FILTER_CHIPS.find((c) => c.key === activeFilter) ?? FILTER_CHIPS[0]
  const showingCount = items.length
  const canLoadMore = showingCount < total

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <Search className="h-5 w-5 text-emerald-400" />
          Global Search
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search across every message — incoming, outgoing, AI replies, and
          owner messages.
        </p>
      </motion.div>

      {/* Big search bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          maxLength={MAX_QUERY_LEN}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all messages…"
          aria-label="Search messages"
          className="h-12 rounded-xl border-border/70 bg-card pl-12 pr-12 text-base shadow-sm transition-colors focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </motion.div>

      {/* Filter chips */}
      <div className="-mx-1 flex flex-wrap items-center gap-2 px-1">
        <span className="mr-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3 w-3" />
          Filter:
        </span>
        {FILTER_CHIPS.map((c) => {
          const active = c.key === activeFilter
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveFilter(c.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/70 bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Mobile facet chips */}
      {hasSearched && facets.length > 0 && (
        <FacetChipsMobile
          facets={facets}
          activeContactId={activeContactId}
          onSelect={setActiveContactId}
        />
      )}

      {/* Body: sidebar + main */}
      <div className="flex gap-6">
        {/* Sidebar (desktop only) */}
        <FacetSidebar
          facets={facets}
          activeContactId={activeContactId}
          onSelect={setActiveContactId}
          total={total}
        />

        {/* Main results area */}
        <div className="min-w-0 flex-1">
          {/* Results count + loading indicator */}
          {debounced && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  Searching…
                </span>
              ) : error ? (
                <span className="text-rose-400">{error}</span>
              ) : (
                <span>
                  Showing <span className="font-semibold text-foreground">{showingCount}</span>
                  {canLoadMore ? (
                    <> of <span className="font-semibold text-foreground">{total}</span></>
                  ) : null}{' '}
                  result{total === 1 ? '' : 's'} for{' '}
                  <span className="font-semibold text-foreground">&ldquo;{debounced}&rdquo;</span>
                  {activeChip.key !== 'all' && (
                    <>
                      {' '}· filtered: <span className="text-foreground">{activeChip.label}</span>
                    </>
                  )}
                  {activeContactId && (
                    <>
                      {' '}· contact: <span className="text-foreground">
                        {facets.find((f) => f.contactId === activeContactId)?.contactName ?? '—'}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Loading skeleton (initial load) */}
          {loading && items.length === 0 && debounced && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state (no query) */}
          {!debounced && <EmptyState onPick={handlePickSuggestion} />}

          {/* No results */}
          {!loading && debounced && !error && items.length === 0 && (
            <NoResults query={debounced} />
          )}

          {/* Results list */}
          {items.length > 0 && (
            <ScrollArea className="max-h-[calc(100vh-22rem)]">
              <div className="flex flex-col gap-3 pr-3">
                  {items.map((item, i) => (
                    <ResultCard
                      key={item.messageId}
                      item={item}
                      query={debounced}
                      index={i}
                      onNavigate={onNavigate}
                    />
                  ))}
              </div>
            </ScrollArea>
          )}

          {/* Load more */}
          {canLoadMore && !loading && items.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleLoadMore()}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                Load more
                <span className="text-muted-foreground">
                  ({total - showingCount} remaining)
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

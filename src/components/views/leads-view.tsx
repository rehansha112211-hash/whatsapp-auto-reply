'use client'

// ============================================================
// LeadsView — Lead pipeline page
// Summary cards · filter toolbar · sortable table · CSV/JSON export
// ============================================================
import * as React from 'react'
import {
  Flame,
  Search,
  Filter,
  Download,
  ArrowUpDown,
  Users,
  TrendingUp,
  MessageCircle,
  ChevronRight,
  RefreshCw,
  X,
  Loader2,
  FileJson,
  FileSpreadsheet,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'
import {
  LEAD_CATEGORIES,
  type LeadCategory,
  type LeadRow,
  type ViewKey,
} from '@/lib/types'
import {
  colorFromString,
  downloadFile,
  initials,
  timeAgo,
} from '@/lib/format'
import { LeadBadge } from '@/components/status'
import { AnimatedCounter } from '@/components/ui/animated-counter'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface LeadsViewProps {
  onNavigate?: (v: ViewKey) => void
}

type SortKey = 'score_desc' | 'score_asc' | 'recent' | 'oldest' | 'name_asc'
type StatusKey = 'all' | 'lead' | 'active' | 'customer' | 'new'
type CategoryKey = 'all' | LeadCategory

interface LeadSummary {
  total: number
  hot: number
  warm: number
  cold: number
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'score_desc', label: 'Score (high → low)' },
  { value: 'score_asc', label: 'Score (low → high)' },
  { value: 'recent', label: 'Most recent first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name (A → Z)' },
]

const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'lead', label: 'Lead' },
  { value: 'active', label: 'Active' },
  { value: 'customer', label: 'Customer' },
  { value: 'new', label: 'New' },
]

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  lead: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  customer: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  blocked: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

function buildParams(opts: {
  search: string
  category: CategoryKey
  status: StatusKey
  minScore: number
  sort: SortKey
}): string {
  const p = new URLSearchParams()
  if (opts.search.trim()) p.set('search', opts.search.trim())
  if (opts.category !== 'all') p.set('category', opts.category)
  if (opts.minScore > 0) p.set('minScore', String(opts.minScore))
  if (opts.status !== 'all') p.set('status', opts.status)
  p.set('sort', opts.sort)
  return p.toString()
}

function categoryLabel(value: string): string {
  return LEAD_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

function LeadScoreCell({ score }: { score: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <LeadBadge score={score} />
        {score >= 90 && (
          <span
            className="relative inline-flex h-2 w-2"
            aria-label="Hot lead"
            title="Hot lead"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        )}
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            score >= 70
              ? 'bg-emerald-500'
              : score >= 50
                ? 'bg-amber-500'
                : score >= 25
                  ? 'bg-orange-500'
                  : 'bg-muted-foreground/40',
          )}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string
  value: number
  icon: React.ElementType
  accent: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border bg-card/60 p-4 backdrop-blur card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            <AnimatedCounter value={value} />
          </div>
          {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        <div
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
            accent,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export function LeadsView({ onNavigate }: LeadsViewProps) {
  // --- Filter state ---
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [category, setCategory] = React.useState<CategoryKey>('all')
  const [status, setStatus] = React.useState<StatusKey>('all')
  const [minScore, setMinScore] = React.useState(0)
  const [sort, setSort] = React.useState<SortKey>('score_desc')

  // --- Data state ---
  const [items, setItems] = React.useState<LeadRow[]>([])
  const [summary, setSummary] = React.useState<LeadSummary>({ total: 0, hot: 0, warm: 0, cold: 0 })
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState(false)

  // --- Debounce search input (300ms) ---
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // --- Build query params from current filters ---
  const params = React.useMemo(
    () =>
      buildParams({
        search: debouncedSearch,
        category,
        status,
        minScore,
        sort,
      }),
    [debouncedSearch, category, status, minScore, sort],
  )

  // --- Fetch leads items ---
  const fetchItems = React.useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true)
      else setRefreshing(true)
      setError(null)
      try {
        const data = await apiGet<{ items: LeadRow[] }>(`/api/leads?${params}`)
        setItems(data.items ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leads')
        if (!opts.silent) setItems([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [params],
  )

  // --- Fetch summary (independent of filters) ---
  const fetchSummary = React.useCallback(async () => {
    try {
      const data = await apiGet<LeadSummary>('/api/leads?summary=1')
      setSummary(data)
    } catch {
      /* summary is best-effort */
    }
  }, [])

  // --- Initial fetch + refetch on filter change ---
  React.useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // --- Initial summary fetch ---
  React.useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // --- Polling: refetch every 15s without resetting filters ---
  React.useEffect(() => {
    const t = setInterval(() => {
      fetchItems({ silent: true })
      fetchSummary()
    }, 15000)
    return () => clearInterval(t)
  }, [fetchItems, fetchSummary])

  // --- Handlers ---
  const handleRefresh = () => {
    fetchItems({ silent: true })
    fetchSummary()
  }

  const handleClearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setCategory('all')
    setStatus('all')
    setMinScore(0)
    setSort('score_desc')
  }

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    category !== 'all' ||
    status !== 'all' ||
    minScore > 0 ||
    sort !== 'score_desc'

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/leads/export?${params}`, { method: 'GET' })
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`)
      }
      const text = await res.text()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadFile(`leads-${stamp}.csv`, text, 'text/csv;charset=utf-8')
      toast.success('CSV exported', { description: `${items.length} leads downloaded` })
    } catch (err) {
      toast.error('CSV export failed', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setExporting(false)
    }
  }

  const handleExportJson = async () => {
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const json = JSON.stringify(items, null, 2)
      downloadFile(`leads-${stamp}.json`, json, 'application/json')
      toast.success('JSON exported', { description: `${items.length} leads downloaded` })
    } catch (err) {
      toast.error('JSON export failed', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Leads Pipeline</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Track and qualify inbound leads detected from WhatsApp conversations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
                disabled={exporting || items.length === 0}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExportCsv} disabled={items.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJson} disabled={items.length === 0}>
                <FileJson className="mr-2 h-4 w-4" />
                Export JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Total Leads"
          value={summary.total}
          icon={Users}
          accent="bg-emerald-500/15 text-emerald-300"
          hint="Score ≥ 25"
        />
        <SummaryCard
          label="Hot Leads"
          value={summary.hot}
          icon={Flame}
          accent="bg-rose-500/15 text-rose-300"
          hint="Score ≥ 70"
        />
        <SummaryCard
          label="Warm Leads"
          value={summary.warm}
          icon={TrendingUp}
          accent="bg-amber-500/15 text-amber-300"
          hint="50 – 69"
        />
        <SummaryCard
          label="Cold Leads"
          value={summary.cold}
          icon={Inbox}
          accent="bg-zinc-500/15 text-zinc-300"
          hint="Score < 50"
        />
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border bg-card/60 p-4 backdrop-blur">
        <div className="flex flex-col gap-3">
          {/* Search row */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone or last message…"
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
            </div>
            <Separator orientation="vertical" className="hidden h-6 sm:block" />

            <Select value={category} onValueChange={(v) => setCategory(v as CategoryKey)}>
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {LEAD_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => setStatus(v as StatusKey)}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger size="sm" className="w-[190px]">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex min-w-[180px] flex-1 items-center gap-3 rounded-md border bg-background/40 px-3 py-1.5">
              <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                Min score
              </span>
              <Slider
                value={[minScore]}
                min={0}
                max={100}
                step={5}
                onValueChange={(v) => setMinScore(v[0] ?? 0)}
                className="flex-1"
                aria-label="Minimum lead score"
              />
              <span className="w-7 text-right text-xs font-semibold tabular-nums text-emerald-300">
                {minScore}
              </span>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1.5">
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card/60 backdrop-blur">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading leads…</span>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
              <Inbox className="h-7 w-7" />
            </div>
            <div>
              <div className="text-sm font-semibold">No leads match your filters</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Try adjusting your search or clearing the filters to see all leads.
              </div>
            </div>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[220px] pl-4">Customer</TableHead>
                  <TableHead className="min-w-[160px]">Service</TableHead>
                  <TableHead className="min-w-[150px]">Lead Score</TableHead>
                  <TableHead className="min-w-[110px]">Status</TableHead>
                  <TableHead className="min-w-[260px]">Last Message</TableHead>
                  <TableHead className="w-[110px] text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row, idx) => {
                  const isHot = row.leadScore >= 90
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        'group animate-slide-in transition-colors',
                        isHot && 'bg-rose-500/[0.04] hover:bg-rose-500/[0.08]',
                      )}
                      style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
                    >
                      {/* Customer */}
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div
                              className={cn(
                                'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                                colorFromString(row.name || row.phone),
                              )}
                            >
                              {initials(row.name || row.phone)}
                            </div>
                            {row.notified && (
                              <span
                                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500"
                                title="Owner notified"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{row.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {row.phone}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Service */}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="truncate text-xs text-foreground/90">
                            {row.detectedService}
                          </span>
                          <Badge
                            variant="outline"
                            className="w-fit border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-300"
                          >
                            {categoryLabel(row.category)}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* Lead Score */}
                      <TableCell>
                        <LeadScoreCell score={row.leadScore} />
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'px-2 py-0.5 text-[10px] font-medium capitalize',
                            STATUS_BADGE[row.status] ??
                              'border-border bg-muted text-muted-foreground',
                          )}
                        >
                          {row.status}
                        </Badge>
                      </TableCell>

                      {/* Last Message */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="line-clamp-1 max-w-[260px] text-xs text-foreground/80">
                            {row.lastMessage || (
                              <span className="text-muted-foreground italic">No messages yet</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />
                            <span>{timeAgo(row.lastMessageAt)}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="pr-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 opacity-70 transition-opacity group-hover:opacity-100"
                          onClick={() => onNavigate?.('chats')}
                        >
                          View chat
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer with count */}
        {!loading && items.length > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-2.5 text-[11px] text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground">{items.length}</span>{' '}
              {items.length === 1 ? 'lead' : 'leads'}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-ring" />
              Live · auto-refresh every 15s
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

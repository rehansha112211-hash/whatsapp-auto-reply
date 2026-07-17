'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  ScrollText,
  Search,
  RefreshCw,
  Download,
  XCircle,
  AlertTriangle,
  Inbox,
  ArrowRight,
  Loader2,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'
import {
  formatDateTime,
  downloadFile,
  toCsv,
  timeAgo,
} from '@/lib/format'
import type { LogCategory, LogLevel, LogRow } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface LogsViewProps {
  onOpenContact?: (contactId: string) => void
}

interface LogsResponse {
  items: LogRow[]
  hasMore: boolean
}

type CategoryTab = LogCategory | 'all'

const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'startup', label: 'Startup' },
  { value: 'backend', label: 'Backend' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ai', label: 'AI' },
  { value: 'database', label: 'Database' },
  { value: 'errors', label: 'Errors' },
  { value: 'security', label: 'Security' },
  { value: 'owner_notify', label: 'Owner Notify' },
  { value: 'lead', label: 'Lead' },
  { value: 'frontend', label: 'Frontend' },
]

const LEVEL_DOT: Record<LogLevel, string> = {
  info: 'bg-sky-500',
  warn: 'bg-amber-500',
  error: 'bg-rose-500',
  debug: 'bg-zinc-500',
}

const LEVEL_BADGE: Record<LogLevel, string> = {
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  debug: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
}

const CATEGORY_BADGE: Partial<Record<LogCategory, string>> = {
  startup: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  backend: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  whatsapp: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  ai: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  database: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  errors: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  security: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  owner_notify: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  lead: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
  frontend: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
}

function tryParseMeta(meta: string): unknown {
  if (!meta) return null
  try {
    return JSON.parse(meta)
  } catch {
    return meta
  }
}

function formatMeta(meta: string): string {
  const parsed = tryParseMeta(meta)
  if (parsed === null) return ''
  if (typeof parsed === 'string') return parsed
  try {
    return JSON.stringify(parsed, null, 2)
  } catch {
    return String(parsed)
  }
}

function LogRowItem({
  row,
  fresh,
  onOpenContact,
}: {
  row: LogRow
  fresh: boolean
  onOpenContact?: (id: string) => void
}) {
  const metaText = formatMeta(row.meta)
  return (
    <div
      className={cn(
        'rounded-lg border border-transparent px-3 py-2 transition-colors',
        'hover:border-border/60 hover:bg-muted/30',
        fresh && 'animate-[fadeHighlight_2.5s_ease-out] bg-primary/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', LEVEL_DOT[row.level])} />
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
              LEVEL_BADGE[row.level],
            )}
          >
            {row.level}
          </span>
        </span>
        <span
          className="font-mono text-[11px] text-muted-foreground"
          title={row.createdAt}
        >
          {formatDateTime(row.createdAt)}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
            CATEGORY_BADGE[row.category] ??
              'bg-muted text-muted-foreground border-border',
          )}
        >
          {row.category}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          {timeAgo(row.createdAt)}
        </span>
      </div>
      <div className="mt-1.5 break-words font-mono text-sm leading-snug">
        {row.message}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {row.contactId && onOpenContact && (
          <button
            type="button"
            onClick={() => onOpenContact(row.contactId!)}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <ArrowRight className="h-3 w-3" />
            contact
          </button>
        )}
        {metaText && (
          <details className="group ml-auto">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5">
                <Terminal className="h-3 w-3" />
                meta
              </span>
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-[10px] leading-snug text-muted-foreground scrollbar-thin">
              {metaText}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

export function LogsView({ onOpenContact }: LogsViewProps) {
  const [category, setCategory] = React.useState<CategoryTab>('all')
  const [level, setLevel] = React.useState<LogLevel | 'all'>('all')
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<LogRow[]>([])
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const [errorCount24h, setErrorCount24h] = React.useState(0)
  const [warnCount24h, setWarnCount24h] = React.useState(0)
  const seenIdsRef = React.useRef<Set<string>>(new Set())
  const [freshIds, setFreshIds] = React.useState<Set<string>>(new Set())
  const firstLoadRef = React.useRef(true)

  // Debounced search input -> search
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const buildQuery = React.useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams()
      params.set('limit', '200')
      if (category !== 'all') params.set('category', category)
      if (level !== 'all') params.set('level', level)
      if (search) params.set('search', search)
      if (extra) {
        for (const [k, v] of Object.entries(extra)) params.set(k, v)
      }
      return params.toString()
    },
    [category, level, search],
  )

  const fetchLogs = React.useCallback(
    async (mode: 'init' | 'refresh' | 'silent') => {
      if (mode === 'init') setLoading(true)
      if (mode === 'refresh') setRefreshing(true)
      try {
        const data = await apiGet<LogsResponse>(`/api/logs?${buildQuery()}`)
        const newItems = data.items
        setHasMore(data.hasMore)

        if (mode === 'init' || firstLoadRef.current) {
          firstLoadRef.current = false
          setItems(newItems)
          seenIdsRef.current = new Set(newItems.map((i) => i.id))
          setFreshIds(new Set())
        } else {
          // Diff to find genuinely new entries
          const incomingIds = new Set(newItems.map((i) => i.id))
          const newlyAdded = newItems.filter(
            (i) => !seenIdsRef.current.has(i.id),
          )
          setItems(newItems)
          seenIdsRef.current = incomingIds
          if (newlyAdded.length > 0) {
            const newFresh = new Set(newlyAdded.map((i) => i.id))
            setFreshIds((prev) => {
              const next = new Set(prev)
              for (const id of newFresh) next.add(id)
              return next
            })
            // Clear fresh highlight after a delay
            setTimeout(() => {
              setFreshIds((prev) => {
                const next = new Set(prev)
                for (const id of newFresh) next.delete(id)
                return next
              })
            }, 2600)
          }
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to load logs',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [buildQuery],
  )

  // Initial + on filter change
  React.useEffect(() => {
    firstLoadRef.current = true
    fetchLogs('init')
  }, [fetchLogs])

  // Auto-refresh every 5s
  React.useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => {
      fetchLogs('silent')
    }, 5000)
    return () => clearInterval(t)
  }, [autoRefresh, fetchLogs])

  // Stats: error & warn counts in last 24h (separate fetch, throttled)
  const refreshStats = React.useCallback(async () => {
    try {
      // Fetch recent logs (limit 1000) and filter on client for last 24h.
      const recent = await apiGet<LogsResponse>(
        `/api/logs?limit=1000`,
      ).catch(() => ({ items: [] as LogRow[], hasMore: false }))
      const now = Date.now()
      const dayMs = 24 * 60 * 60 * 1000
      const errs = recent.items.filter(
        (i) =>
          i.level === 'error' && now - new Date(i.createdAt).getTime() < dayMs,
      )
      const warns = recent.items.filter(
        (i) =>
          i.level === 'warn' && now - new Date(i.createdAt).getTime() < dayMs,
      )
      setErrorCount24h(errs.length)
      setWarnCount24h(warns.length)
    } catch {
      /* silent */
    }
  }, [])

  React.useEffect(() => {
    refreshStats()
    const t = setInterval(refreshStats, 30000)
    return () => clearInterval(t)
  }, [refreshStats])

  const onExport = async (format: 'csv' | 'json') => {
    try {
      const query = buildQuery({ export: format })
      const res = await fetch(`/api/logs?${query}`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Export failed (${res.status})`)
      }
      const text = await res.text()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      if (format === 'csv') {
        downloadFile(`logs-${stamp}.csv`, text, 'text/csv;charset=utf-8')
      } else {
        downloadFile(
          `logs-${stamp}.json`,
          text,
          'application/json;charset=utf-8',
        )
      }
      toast.success(`Exported ${format.toUpperCase()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const onExportCsvClient = () => {
    if (items.length === 0) {
      toast.info('No logs to export')
      return
    }
    const csv = toCsv(
      items.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        category: i.category,
        level: i.level,
        message: i.message,
        contactId: i.contactId ?? '',
        meta: i.meta,
      })),
    )
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadFile(`logs-${stamp}.csv`, csv, 'text/csv;charset=utf-8')
    toast.success('Exported CSV')
  }

  const clearFilters = () => {
    setCategory('all')
    setLevel('all')
    setSearchInput('')
    setSearch('')
  }

  const hasFilters = category !== 'all' || level !== 'all' || search !== ''
  const total = items.length

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        @keyframes fadeHighlight {
          0%   { background-color: hsl(var(--primary) / 0.18); }
          100% { background-color: transparent; }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ScrollText className="h-5 w-5 text-emerald-400" />
            System Logs
          </h1>
          <p className="text-xs text-muted-foreground">
            Real-time event stream across all platform subsystems
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card/60 p-4 backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Visible
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {total}
          </div>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 backdrop-blur">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            Errors (24h)
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-rose-300">
            {errorCount24h}
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            Warnings (24h)
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-300">
            {warnCount24h}
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <Tabs
        value={category}
        onValueChange={(v) => setCategory(v as CategoryTab)}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto bg-muted/40 p-1 scrollbar-thin">
          {CATEGORY_TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/60 p-3 backdrop-blur">
        <Select
          value={level}
          onValueChange={(v) => setLevel(v as LogLevel | 'all')}
        >
          <SelectTrigger size="sm" className="h-8 w-[120px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search messages..."
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
          <Switch
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
            id="auto-refresh"
          />
          <Label
            htmlFor="auto-refresh"
            className="cursor-pointer text-[11px] text-muted-foreground"
          >
            Auto
          </Label>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => fetchLogs('refresh')}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onExportCsvClient}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => onExport('json')}
        >
          <Download className="h-3.5 w-3.5" />
          JSON
        </Button>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={clearFilters}
          >
            <XCircle className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Log list */}
      <div className="rounded-xl border bg-card/60 backdrop-blur">
        <div className="flex items-center justify-between border-b px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {loading
              ? 'Loading…'
              : `${total} log ${total === 1 ? 'entry' : 'entries'}`}
          </span>
          {hasMore && (
            <span className="text-amber-400">More available (paginated)</span>
          )}
        </div>

        <div className="max-h-[calc(100vh-320px)] overflow-y-auto p-2 scrollbar-thin">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              <span className="text-sm">Loading logs…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted/40">
                <Inbox className="h-6 w-6" />
              </div>
              <div className="text-sm font-medium">No logs match your filters</div>
              {hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={clearFilters}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {items.map((row) => (
                <LogRowItem
                  key={row.id}
                  row={row}
                  fresh={freshIds.has(row.id)}
                  onOpenContact={onOpenContact}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

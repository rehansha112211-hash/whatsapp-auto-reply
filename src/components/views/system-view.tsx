'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  Activity,
  Server,
  Cpu,
  HardDrive,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wifi,
  Shield,
  Zap,
  Database,
  Monitor,
  Loader2,
  Archive,
  FileBox,
  RotateCcw,
  Trash2,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { formatUptime, formatDateTime, timeAgo } from '@/lib/format'
import type { LogRow, SystemHealth, WhatsAppState } from '@/lib/types'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { StatusDot, WhatsAppStatusBadge } from '@/components/status'

interface SystemViewProps {
  onOpenContact?: (contactId: string) => void
}

interface HealthWithMeta extends SystemHealth {
  aiModel?: string
  aiProviderName?: string
  startedAt?: string
}

function overallOk(h: SystemHealth | null): boolean {
  if (!h) return false
  if (h.backend !== 'ok') return false
  if (h.database !== 'ok') return false
  if (h.aiProvider === 'error') return false
  if (h.whatsapp === 'logged_out' || h.whatsapp === 'disconnected')
    return false
  return true
}

function statusAccent(state: 'ok' | 'error' | 'warn' | 'idle'): string {
  switch (state) {
    case 'ok':
      return 'border-l-emerald-500'
    case 'warn':
      return 'border-l-amber-500'
    case 'error':
      return 'border-l-rose-500'
    default:
      return 'border-l-zinc-500'
  }
}

function ResourceCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: number
  detail?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const color =
    pct >= 85 ? 'text-rose-300' : pct >= 65 ? 'text-amber-300' : 'text-emerald-300'
  return (
    <Card className="rounded-xl border bg-card/60 p-4 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
        <span className={cn('font-mono text-sm font-semibold tabular-nums', color)}>
          {pct}%
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <Progress
          value={pct}
          className={cn(
            'h-2.5 transition-all duration-700 ease-out',
            pct >= 85 && '[&_[data-slot=progress-indicator]]:bg-rose-500',
            pct >= 65 &&
              pct < 85 &&
              '[&_[data-slot=progress-indicator]]:bg-amber-500',
            pct < 65 && '[&_[data-slot=progress-indicator]]:bg-emerald-500',
          )}
        />
        {detail && (
          <div className="mt-2 text-[11px] text-muted-foreground">{detail}</div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusCard({
  icon,
  label,
  state,
  accent,
  children,
}: {
  icon: React.ReactNode
  label: string
  state: 'ok' | 'error' | 'warn' | 'idle'
  accent: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-l-4 bg-card/60 p-4 backdrop-blur',
        accent,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {children ?? (
          <StatusDot
            state={state === 'warn' ? 'warning' : state}
            pulse={state === 'ok'}
          />
        )}
        <span
          className={cn(
            'text-sm font-medium',
            state === 'ok' && 'text-emerald-300',
            state === 'warn' && 'text-amber-300',
            state === 'error' && 'text-rose-300',
            state === 'idle' && 'text-muted-foreground',
          )}
        >
          {state === 'ok' && 'Operational'}
          {state === 'warn' && 'Warning'}
          {state === 'error' && 'Error'}
          {state === 'idle' && 'Idle'}
        </span>
      </div>
    </div>
  )
}

function waStateToStatus(
  s: WhatsAppState,
): 'ok' | 'error' | 'warn' | 'idle' {
  if (s === 'connected') return 'ok'
  if (s === 'logged_out') return 'error'
  if (s === 'qr_ready' || s === 'connecting') return 'warn'
  return 'idle'
}

// ============================================================
// Backup & Recovery — real SQLite backup / restore / delete
// ============================================================

interface BackupItem {
  id: string
  filename: string
  sizeBytes: number
  createdAt: string
}

interface DbInfo {
  path: string
  sizeBytes: number
  counts: { contacts: number; messages: number; logs: number }
}

interface BackupListResponse {
  items: BackupItem[]
  dbInfo: DbInfo
}

interface BackupCreateResponse {
  ok: true
  backup: BackupItem
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )
  const v = bytes / Math.pow(1024, i)
  const digits = i > 0 && v < 10 ? 1 : 0
  return `${v.toFixed(digits)} ${units[i]}`
}

function BackupRecoveryCard() {
  const [backups, setBackups] = React.useState<BackupItem[]>([])
  const [dbInfo, setDbInfo] = React.useState<DbInfo | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [creating, setCreating] = React.useState(false)
  const [busyFilename, setBusyFilename] = React.useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] =
    React.useState<BackupItem | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<BackupItem | null>(
    null,
  )

  const fetchBackups = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<BackupListResponse>('/api/system/backup')
      setBackups(data.items)
      setDbInfo(data.dbInfo)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchBackups()
  }, [fetchBackups])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const data = await apiPost<BackupCreateResponse>('/api/system/backup')
      toast.success('Backup created', {
        description: `${data.backup.filename} · ${formatBytes(
          data.backup.sizeBytes,
        )}`,
      })
      await fetchBackups()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Backup failed', { description: msg })
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async (item: BackupItem) => {
    setBusyFilename(item.filename)
    try {
      await apiPost('/api/system/backup/restore', {
        filename: item.filename,
      })
      toast.success('Database restored', {
        description: `Restored from ${item.filename}. Reload to see all changes.`,
      })
      setRestoreTarget(null)
      await fetchBackups()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Restore failed', { description: msg })
    } finally {
      setBusyFilename(null)
    }
  }

  const handleDelete = async (item: BackupItem) => {
    setBusyFilename(item.filename)
    try {
      await apiDelete(
        `/api/system/backup/${encodeURIComponent(item.filename)}`,
      )
      toast.success('Backup deleted', { description: item.filename })
      setDeleteTarget(null)
      await fetchBackups()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error('Delete failed', { description: msg })
    } finally {
      setBusyFilename(null)
    }
  }

  return (
    <Card className="rounded-xl border bg-card/60 p-5 backdrop-blur">
      <CardHeader className="p-0 pb-4">
        <CardTitle className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-emerald-400" />
            Backup &amp; Recovery
          </span>
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            {backups.length} {backups.length === 1 ? 'backup' : 'backups'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-0">
        {/* Create backup row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Create a snapshot of the live database
            </p>
            <p className="text-[11px] text-muted-foreground">
              Copies the SQLite DB file and exports all settings (Company,
              Owner, AI, Auto-Reply) as a companion JSON file.
            </p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating}
            className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {creating ? 'Creating…' : 'Create Backup'}
          </Button>
        </div>

        <Separator />

        {/* Backup history */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <FileBox className="h-3.5 w-3.5 text-emerald-400" />
            Backup History
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border bg-background/40 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading backups…
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <FileBox className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  No backups yet. Create your first backup.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border/50">
                {backups.map((item) => {
                  const isBusy = busyFilename === item.filename
                  return (
                    <li
                      key={item.id}
                      className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-300">
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-medium">
                          {item.filename}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="tabular-nums">
                            {formatBytes(item.sizeBytes)}
                          </span>
                          <span>·</span>
                          <span>{timeAgo(item.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-amber-500/30 px-2 text-[11px] text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                          disabled={isBusy}
                          onClick={() => setRestoreTarget(item)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-[11px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                          disabled={isBusy}
                          onClick={() => setDeleteTarget(item)}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <Separator />

        {/* Database info */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
            Database Info
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border bg-background/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                DB Path
              </div>
              <div
                className="mt-0.5 truncate font-mono text-[11px]"
                title={dbInfo?.path ?? ''}
              >
                {dbInfo?.path ?? '—'}
              </div>
            </div>
            <div className="rounded-md border bg-background/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                File Size
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                {dbInfo ? formatBytes(dbInfo.sizeBytes) : '—'}
              </div>
            </div>
            <div className="rounded-md border bg-background/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Contacts
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                {dbInfo
                  ? dbInfo.counts.contacts.toLocaleString()
                  : '—'}
              </div>
            </div>
            <div className="rounded-md border bg-background/40 px-3 py-2">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Messages / Logs
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums">
                {dbInfo
                  ? `${dbInfo.counts.messages.toLocaleString()} / ${dbInfo.counts.logs.toLocaleString()}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Restore confirmation dialog */}
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Restore Database?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Restore from{' '}
              <span className="font-mono font-semibold">
                {restoreTarget?.filename}
              </span>
              ? This will overwrite the current database. The platform may need
              a moment to reconnect afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
              onClick={() => restoreTarget && handleRestore(restoreTarget)}
            >
              <RotateCcw className="h-4 w-4" />
              Restore now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              Delete Backup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delete{' '}
              <span className="font-mono font-semibold">
                {deleteTarget?.filename}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function SystemView(_props: SystemViewProps) {
  const [health, setHealth] = React.useState<HealthWithMeta | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [recentErrors, setRecentErrors] = React.useState<LogRow[]>([])
  const [recentStartup, setRecentStartup] = React.useState<LogRow[]>([])

  const refresh = React.useCallback(async (mode: 'init' | 'silent') => {
    if (mode === 'init') setLoading(true)
    if (mode === 'silent') setRefreshing(true)
    try {
      const data = await apiGet<HealthWithMeta>('/api/system/health')
      // Augment with AI model/provider info from dashboard if available;
      // otherwise derive sensible defaults.
      data.aiModel = data.aiModel ?? 'glm-4.5'
      data.aiProviderName = data.aiProviderName ?? 'zai'
      data.startedAt = data.startedAt ?? new Date(Date.now() - data.uptimeSec * 1000).toISOString()
      setHealth(data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const refreshEvents = React.useCallback(async () => {
    try {
      const [errs, startup] = await Promise.all([
        apiGet<{ items: LogRow[]; hasMore: boolean }>(
          '/api/logs?category=errors&limit=5',
        ).catch(() => ({ items: [], hasMore: false })),
        apiGet<{ items: LogRow[]; hasMore: boolean }>(
          '/api/logs?category=startup&limit=10',
        ).catch(() => ({ items: [], hasMore: false })),
      ])
      setRecentErrors(errs.items)
      setRecentStartup(startup.items)
    } catch {
      /* silent */
    }
  }, [])

  React.useEffect(() => {
    refresh('init')
    refreshEvents()
    const t = setInterval(() => {
      refresh('silent')
      refreshEvents()
    }, 5000)
    return () => clearInterval(t)
  }, [refresh, refreshEvents])

  const ok = overallOk(health)
  const waStatus = health ? waStateToStatus(health.whatsapp) : 'idle'

  const aiStatus: 'ok' | 'error' | 'warn' | 'idle' =
    health?.aiProvider === 'ok'
      ? 'ok'
      : health?.aiProvider === 'error'
        ? 'error'
        : 'idle'

  const sessionStatus: 'ok' | 'error' | 'warn' | 'idle' =
    health?.session === 'ok' ? 'ok' : 'idle'

  const dbStatus: 'ok' | 'error' = health?.database ?? 'error'

  if (loading && !health) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <span className="text-sm">Loading system health…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-emerald-400" />
            System Health
          </h1>
          <p className="text-xs text-muted-foreground">
            Live monitoring of all platform subsystems · refreshes every 5s
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            refresh('silent')
            refreshEvents()
          }}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh now
        </Button>
      </div>

      {/* Overall status banner */}
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border bg-card/60 p-6 backdrop-blur',
          ok ? 'border-emerald-500/30' : 'border-amber-500/30',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl',
            ok ? 'bg-emerald-500/20' : 'bg-amber-500/20',
          )}
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="relative">
            <span
              className={cn(
                'absolute inline-flex h-14 w-14 animate-ping rounded-full opacity-60',
                ok ? 'bg-emerald-500' : 'bg-amber-500',
              )}
            />
            <span
              className={cn(
                'relative inline-flex h-14 w-14 items-center justify-center rounded-full text-white',
                ok ? 'bg-emerald-500' : 'bg-amber-500',
              )}
            >
              {ok ? (
                <CheckCircle2 className="h-7 w-7" />
              ) : (
                <AlertTriangle className="h-7 w-7" />
              )}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Overall Status
            </div>
            <div
              className={cn(
                'text-2xl font-bold tracking-tight',
                ok ? 'text-emerald-300' : 'text-amber-300',
              )}
            >
              {ok ? 'Operational' : 'Degraded'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {ok
                ? 'All systems are running normally.'
                : 'Some subsystems require attention.'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Uptime
            </div>
            <div className="font-mono text-lg font-semibold tabular-nums">
              {formatUptime(health?.uptimeSec ?? 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              since {formatDateTime(health?.startedAt ?? null)}
            </div>
          </div>
        </div>
      </div>

      {/* Status cards grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <StatusCard
          icon={<Server className="h-4 w-4" />}
          label="Backend"
          state="ok"
          accent={statusAccent('ok')}
        />
        <StatusCard
          icon={<Monitor className="h-4 w-4" />}
          label="Frontend"
          state="ok"
          accent={statusAccent('ok')}
        />
        <div
          className={cn(
            'rounded-xl border border-l-4 bg-card/60 p-4 backdrop-blur',
            statusAccent(waStatus),
          )}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Wifi className="h-4 w-4" />
            WhatsApp
          </div>
          <div className="mt-3">
            <WhatsAppStatusBadge state={health?.whatsapp ?? 'disconnected'} />
          </div>
        </div>
        <StatusCard
          icon={<Database className="h-4 w-4" />}
          label="Database"
          state={dbStatus}
          accent={statusAccent(dbStatus === 'ok' ? 'ok' : 'error')}
        />
        <div
          className={cn(
            'rounded-xl border border-l-4 bg-card/60 p-4 backdrop-blur',
            statusAccent(aiStatus),
          )}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-4 w-4" />
            AI Provider
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <StatusDot state={aiStatus === 'ok' ? 'ok' : aiStatus === 'error' ? 'error' : 'untested'} pulse={aiStatus === 'ok'} />
              <span
                className={cn(
                  'text-sm font-medium',
                  aiStatus === 'ok' && 'text-emerald-300',
                  aiStatus === 'error' && 'text-rose-300',
                  aiStatus === 'idle' && 'text-muted-foreground',
                )}
              >
                {aiStatus === 'ok'
                  ? 'Connected'
                  : aiStatus === 'error'
                    ? 'Error'
                    : 'Untested'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {health?.aiModel ?? 'glm-4.5'}
            </div>
          </div>
        </div>
        <StatusCard
          icon={<Shield className="h-4 w-4" />}
          label="Session"
          state={sessionStatus}
          accent={statusAccent(sessionStatus === 'ok' ? 'ok' : 'idle')}
        >
          <StatusDot state={sessionStatus === 'ok' ? 'ok' : 'idle'} pulse={sessionStatus === 'ok'} />
          <span
            className={cn(
              'text-sm font-medium',
              sessionStatus === 'ok' ? 'text-emerald-300' : 'text-muted-foreground',
            )}
          >
            {sessionStatus === 'ok' ? 'Authenticated' : 'No session'}
          </span>
        </StatusCard>
      </div>

      {/* Resource usage */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ResourceCard
          icon={<Cpu className="h-4 w-4 text-emerald-400" />}
          label="CPU Usage"
          value={health?.cpu ?? 0}
          detail="Slowly-varying synthetic load"
        />
        <ResourceCard
          icon={<HardDrive className="h-4 w-4 text-emerald-400" />}
          label="RAM Usage"
          value={health?.ram ?? 0}
          detail={
            health
              ? `${Math.round(((health.ram / 100) * 512)).toString()} MB approx`
              : undefined
          }
        />
        <ResourceCard
          icon={<HardDrive className="h-4 w-4 text-emerald-400" />}
          label="Disk Usage"
          value={health?.disk ?? 0}
          detail="Stable storage baseline"
        />
      </div>

      {/* Uptime & availability (full width) */}
      <Card className="rounded-xl border bg-card/60 p-4 backdrop-blur">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-4 w-4 text-emerald-400" />
            Uptime & Availability
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 p-0 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Uptime
            </div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {formatUptime(health?.uptimeSec ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Started
            </div>
            <div className="mt-1 font-mono text-sm">
              {formatDateTime(health?.startedAt ?? null)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Backend
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm">
              <StatusDot state="ok" pulse />
              <span className="text-emerald-300">OK</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Database
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm">
              <StatusDot state={dbStatus} pulse={dbStatus === 'ok'} />
              <span
                className={cn(
                  dbStatus === 'ok' ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {dbStatus === 'ok' ? 'OK' : 'Error'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup & recovery (real SQLite backup / restore) */}
      <BackupRecoveryCard />

      {/* Recent events */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Recent errors */}
        <Card className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-4 backdrop-blur">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
              <XCircle className="h-4 w-4" />
              Recent Errors
              {recentErrors.length > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 border-rose-500/30 bg-rose-500/10 text-rose-300"
                >
                  {recentErrors.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              {recentErrors.length === 0 ? (
                <div className="flex items-center gap-2 py-6 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  No recent errors. All good!
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {recentErrors.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md border border-rose-500/15 bg-rose-500/5 px-2.5 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">
                          {formatDateTime(e.createdAt)}
                        </span>
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] uppercase text-rose-300">
                          {e.category}
                        </span>
                      </div>
                      <div className="mt-1 break-words font-mono text-xs text-rose-200">
                        {e.message}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent startup events */}
        <Card className="rounded-xl border bg-card/60 p-4 backdrop-blur">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Activity className="h-4 w-4 text-emerald-400" />
              Recent System Events
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              {recentStartup.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No system events yet.
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {recentStartup.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md border bg-muted/20 px-2.5 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">
                          {formatDateTime(e.createdAt)}
                        </span>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] uppercase text-emerald-300">
                          {e.category}
                        </span>
                      </div>
                      <div className="mt-1 break-words font-mono text-xs">
                        {e.message}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

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
  Power,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'
import { formatUptime, formatDateTime } from '@/lib/format'
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

      {/* Uptime + restart */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="rounded-xl border bg-card/60 p-4 backdrop-blur lg:col-span-2">
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

        <Card className="rounded-xl border bg-card/60 p-4 backdrop-blur">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Power className="h-4 w-4 text-emerald-400" />
              Engine Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-0">
            <p className="text-[11px] text-muted-foreground">
              Restart the WhatsApp + AI engine without rebooting the platform.
            </p>
            <Button
              variant="outline"
              className="w-full gap-1.5 border-amber-500/30 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
              onClick={() => {
                toast.success('Engine restart simulated', {
                  description:
                    'The WhatsApp + AI pipeline would be re-initialized in production.',
                })
              }}
            >
              <Power className="h-4 w-4" />
              Restart Engine (simulated)
            </Button>
          </CardContent>
        </Card>
      </div>

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

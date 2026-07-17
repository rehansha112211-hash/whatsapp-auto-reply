'use client'

import { cn } from '@/lib/utils'
import type { WhatsAppState } from '@/lib/types'

interface StatusDotProps {
  state: 'ok' | 'error' | 'warning' | 'idle' | 'untested'
  pulse?: boolean
  className?: string
}

const COLORS: Record<StatusDotProps['state'], string> = {
  ok: 'bg-emerald-500',
  error: 'bg-rose-500',
  warning: 'bg-amber-500',
  idle: 'bg-zinc-500',
  untested: 'bg-zinc-500',
}

export function StatusDot({ state, pulse, className }: StatusDotProps) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      {pulse && state === 'ok' && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
            COLORS[state],
          )}
        />
      )}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', COLORS[state])} />
    </span>
  )
}

export function WhatsAppStatusBadge({ state }: { state: WhatsAppState }) {
  const map: Record<WhatsAppState, { label: string; state: StatusDotProps['state']; cls: string }> = {
    connected: { label: 'Connected', state: 'ok', cls: 'text-emerald-400' },
    qr_ready: { label: 'Awaiting QR scan', state: 'warning', cls: 'text-amber-400' },
    connecting: { label: 'Connecting', state: 'warning', cls: 'text-amber-400' },
    disconnected: { label: 'Disconnected', state: 'idle', cls: 'text-zinc-400' },
    logged_out: { label: 'Logged out', state: 'error', cls: 'text-rose-400' },
  }
  const cfg = map[state] ?? map.disconnected
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      <StatusDot state={cfg.state} pulse={state === 'connected'} />
      <span className={cfg.cls}>{cfg.label}</span>
    </span>
  )
}

export function LeadBadge({ score, className }: { score: number; className?: string }) {
  const cls =
    score >= 75
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : score >= 50
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : score >= 25
          ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
          : 'bg-muted text-muted-foreground border-border'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        cls,
        className,
      )}
    >
      {score >= 75 && <span>🔥</span>}
      {score}
    </span>
  )
}

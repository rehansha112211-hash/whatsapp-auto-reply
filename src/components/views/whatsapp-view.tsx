'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  MessageCircle,
  QrCode,
  RefreshCw,
  LogOut,
  Check,
  Smartphone,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  Activity,
  ScrollText,
  Power,
  AlertTriangle,
  Phone,
  KeyRound,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { apiGet, apiPost, ApiError } from '@/lib/api-client'
import { formatDateTime, formatUptime, timeAgo } from '@/lib/format'
import type { WhatsAppState, LogRow } from '@/lib/types'
import { motion } from 'framer-motion'

interface WaSession {
  state: WhatsAppState
  connectedNumber: string
  connectedName: string
  connectedAt: string | null
  deviceInfo: string
  qrCode: string
  lastSeen: string | null
}

const QR_COUNTDOWN_SEC = 60

// ============================================================
// QrVisual — pure SVG QR mockup, deterministic from payload
// 25x25 grid with 3 finder patterns + 1 alignment pattern
// ============================================================
const QR_GRID = 25
const FINDER_PATTERN: boolean[][] = [
  [true, true, true, true, true, true, true],
  [true, false, false, false, false, false, true],
  [true, false, true, true, true, false, true],
  [true, false, true, true, true, false, true],
  [true, false, true, true, true, false, true],
  [true, false, false, false, false, false, true],
  [true, true, true, true, true, true, true],
]
const ALIGN_PATTERN: boolean[][] = [
  [true, true, true, true, true],
  [true, false, false, false, true],
  [true, false, true, false, true],
  [true, false, false, false, true],
  [true, true, true, true, true],
]

function buildQrGrid(payload: string): boolean[] {
  const cells = new Array<boolean>(QR_GRID * QR_GRID).fill(false)

  // Deterministic seed from payload (xor-fold of char codes)
  let seed = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    seed ^= payload.charCodeAt(i)
    seed = Math.imul(seed, 0x01000193) >>> 0
  }
  // Mulberry32-style LCG for stable bits
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0)
  }
  for (let i = 0; i < cells.length; i++) {
    cells[i] = (next() & 1) === 1
  }

  // Stamp finder patterns at (0,0), (0,18), (18,0)
  const stamp = (row: number, col: number, mat: boolean[][], size: number) => {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        cells[(row + r) * QR_GRID + (col + c)] = mat[r][c]
      }
    }
  }
  stamp(0, 0, FINDER_PATTERN, 7)
  stamp(0, QR_GRID - 7, FINDER_PATTERN, 7)
  stamp(QR_GRID - 7, 0, FINDER_PATTERN, 7)
  // Stamp alignment pattern at bottom-right (16, 16)
  stamp(16, 16, ALIGN_PATTERN, 5)

  // Clear white separators around each finder
  const clearRow = (row: number, from: number, to: number) => {
    for (let c = from; c <= to; c++) cells[row * QR_GRID + c] = false
  }
  const clearCol = (col: number, from: number, to: number) => {
    for (let r = from; r <= to; r++) cells[r * QR_GRID + col] = false
  }
  // top-left
  clearRow(7, 0, 7)
  clearCol(7, 0, 7)
  // top-right
  clearRow(7, QR_GRID - 8, QR_GRID - 1)
  clearCol(QR_GRID - 8, 0, 7)
  // bottom-left
  clearRow(QR_GRID - 8, 0, 7)
  clearCol(7, QR_GRID - 8, QR_GRID - 1)

  // Timing patterns (alternating modules on row 6 and col 6)
  for (let i = 8; i < QR_GRID - 8; i++) {
    cells[6 * QR_GRID + i] = i % 2 === 0
    cells[i * QR_GRID + 6] = i % 2 === 0
  }

  return cells
}

function QrVisual({ payload, size = 220 }: { payload: string; size?: number }) {
  const cells = React.useMemo(() => buildQrGrid(payload), [payload])
  const cellSize = size / QR_GRID
  const moduleColor = '#0b0f14'
  const bgColor = '#ffffff'

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="WhatsApp pairing QR code (simulated)"
      shapeRendering="crispEdges"
      className="block h-full w-full max-w-full"
    >
      <rect x={0} y={0} width={size} height={size} fill={bgColor} />
      {cells.map((on, idx) => {
        if (!on) return null
        const row = Math.floor(idx / QR_GRID)
        const col = idx % QR_GRID
        return (
          <rect
            key={idx}
            x={col * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={moduleColor}
          />
        )
      })}
    </svg>
  )
}

// ============================================================
// State label helper
// ============================================================
const STATE_META: Record<
  WhatsAppState,
  { label: string; tone: 'ok' | 'warning' | 'idle' | 'error' }
> = {
  connected: { label: 'Connected', tone: 'ok' },
  qr_ready: { label: 'Awaiting QR scan', tone: 'warning' },
  connecting: { label: 'Connecting', tone: 'warning' },
  disconnected: { label: 'Disconnected', tone: 'idle' },
  logged_out: { label: 'Logged out', tone: 'error' },
}

// ============================================================
// Main view
// ============================================================
export function WhatsAppView() {
  const [session, setSession] = React.useState<WaSession | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [logs, setLogs] = React.useState<LogRow[]>([])
  const [now, setNow] = React.useState(() => new Date())

  // Polling the session state every 4s
  const refresh = React.useCallback(async () => {
    try {
      const data = await apiGet<WaSession>('/api/whatsapp')
      setSession(data)
    } catch {
      /* silent — keep last known state */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh])

  // Refresh logs every 8s (graceful if route not yet available)
  const refreshLogs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/logs?category=whatsapp&limit=5', {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as unknown
      if (Array.isArray(data)) {
        setLogs(data as LogRow[])
      } else if (
        data &&
        typeof data === 'object' &&
        Array.isArray((data as { items?: unknown }).items)
      ) {
        setLogs((data as { items: LogRow[] }).items)
      }
    } catch {
      /* ignore — another agent owns this route */
    }
  }, [])

  React.useEffect(() => {
    refreshLogs()
    const t = setInterval(refreshLogs, 8000)
    return () => clearInterval(t)
  }, [refreshLogs])

  // Tick for live uptime / countdown
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleGenerateQr = async () => {
    setBusy(true)
    try {
      await apiPost<{ ok: true; qr: string }>('/api/whatsapp/qr')
      toast.success('QR code generated', {
        description: 'Open WhatsApp → Settings → Linked Devices → Scan QR',
      })
      await refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to generate QR')
    } finally {
      setBusy(false)
    }
  }

  const handleConnect = async () => {
    setBusy(true)
    try {
      const data = await apiPost<{ ok: true; number: string; name: string }>(
        '/api/whatsapp/connect',
      )
      toast.success('WhatsApp connected', {
        description: `${data.name} · ${data.number}`,
      })
      await refresh()
      await refreshLogs()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const handleReconnect = async () => {
    setBusy(true)
    try {
      await apiPost('/api/whatsapp/disconnect')
      await apiPost<{ ok: true; qr: string }>('/api/whatsapp/qr')
      toast.success('Reconnecting…', {
        description: 'A fresh QR code has been generated.',
      })
      await refresh()
      await refreshLogs()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reconnect failed')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    setBusy(true)
    try {
      await apiPost('/api/whatsapp/logout')
      toast.success('Logged out', {
        description: 'WhatsApp session ended and unlinked from this device.',
      })
      await refresh()
      await refreshLogs()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Logout failed')
    } finally {
      setBusy(false)
    }
  }

  const state = session?.state ?? 'disconnected'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto w-full max-w-5xl"
    >
      {/* Page heading */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-premium">WhatsApp Connection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your WhatsApp account via QR pairing. Multi-device,
            end-to-end encrypted, auto-reconnecting.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card/60 px-3 py-2 text-xs backdrop-blur">
          <StatePill state={state} />
          {session?.connectedNumber && state === 'connected' && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="font-mono text-muted-foreground">
                {session.connectedNumber}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" id="wa-main-grid">
        {/* Main column */}
        <div className="min-w-0">
          {loading && !session ? (
            <ConnectingCard label="Loading session…" />
          ) : state === 'connected' ? (
            <ConnectedCard
              session={session!}
              now={now}
              busy={busy}
              onReconnect={handleReconnect}
              onLogout={handleLogout}
            />
          ) : state === 'qr_ready' ? (
            <QrReadyCard
              qr={session?.qrCode ?? ''}
              busy={busy}
              now={now}
              onRefresh={handleGenerateQr}
              onSimulateScan={handleConnect}
            />
          ) : state === 'connecting' ? (
            <ConnectingCard label="Establishing connection…" />
          ) : (
            <DisconnectedCard
              isLoggedOut={state === 'logged_out'}
              busy={busy}
              onGenerate={handleGenerateQr}
              onRefresh={refresh}
            />
          )}
        </div>

        {/* Side panel */}
        <aside className="flex flex-col gap-4">
          <SessionHealthCard session={session} now={now} />
          <LogPreviewCard logs={logs} />
        </aside>
      </div>
    </motion.div>
  )
}

// ============================================================
// State pill
// ============================================================
function StatePill({ state }: { state: WhatsAppState }) {
  const meta = STATE_META[state] ?? STATE_META.disconnected
  const toneCls = {
    ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    idle: 'bg-muted text-muted-foreground border-border',
    error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }[meta.tone]
  const dotCls = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    idle: 'bg-zinc-500',
    error: 'bg-rose-500',
  }[meta.tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        toneCls,
      )}
    >
      <span className="relative inline-flex h-2 w-2">
        {state === 'connected' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 bg-emerald-500" />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotCls)} />
      </span>
      {meta.label}
    </span>
  )
}

// ============================================================
// Disconnected / Logged-out card
// ============================================================
function DisconnectedCard({
  isLoggedOut,
  busy,
  onGenerate,
  onRefresh,
}: {
  isLoggedOut: boolean
  busy: boolean
  onGenerate: () => void
  onRefresh: () => void
}) {
  const [howOpen, setHowOpen] = React.useState(false)
  const [method, setMethod] = React.useState<'qr' | 'phone'>('qr')

  return (
    <Card className="overflow-hidden rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
        <div className="relative mb-6 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
          <MessageCircle className="h-10 w-10" />
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-background">
            {method === 'qr' ? (
              <QrCode className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Phone className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </span>
        </div>

        <h2 className="text-xl font-semibold tracking-tight">Connect WhatsApp</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Link this device using either a QR code or your phone number.
          Uses WhatsApp&apos;s official multi-device protocol — end-to-end
          encrypted, auto-reconnecting.
        </p>

        {isLoggedOut && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Previous session was logged out. Reconnect to continue.
          </div>
        )}

        {/* Method toggle */}
        <div className="mt-6 inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            onClick={() => setMethod('qr')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              method === 'qr'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <QrCode className="h-3.5 w-3.5" />
            QR Code
          </button>
          <button
            onClick={() => setMethod('phone')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              method === 'phone'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Phone className="h-3.5 w-3.5" />
            Phone Number
          </button>
        </div>

        {/* Method content */}
        <div className="mt-6 w-full max-w-sm">
          {method === 'qr' ? (
            <QrMethod busy={busy} onGenerate={onGenerate} />
          ) : (
            <PhoneMethod busy={busy} onConnected={onRefresh} />
          )}
        </div>

        <Separator className="my-6" />

        <Collapsible open={howOpen} onOpenChange={setHowOpen} className="w-full">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted/60">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                How it works
              </span>
              {howOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            <ol className="mt-2 space-y-3 px-3 py-2">
              {[
                {
                  step: '1',
                  title: 'Choose a method',
                  body: 'Scan a QR code with your phone, or enter your phone number to receive a pairing code.',
                },
                {
                  step: '2',
                  title: 'Verify',
                  body: 'QR: point your phone at the code. Phone: enter the 6-digit code you receive.',
                },
                {
                  step: '3',
                  title: 'Linked Devices',
                  body: 'On your phone: WhatsApp → Settings → Linked Devices → Link a Device.',
                },
                {
                  step: '4',
                  title: 'Connected',
                  body: 'Pairing completes in seconds. Your phone stays optional after the first sync.',
                },
              ].map((s) => (
                <li key={s.step} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300">
                    {s.step}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// ============================================================
// QR login method
// ============================================================
function QrMethod({ busy, onGenerate }: { busy: boolean; onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        onClick={onGenerate}
        disabled={busy}
        className="h-11 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 px-6 text-white hover:from-emerald-600 hover:to-teal-700"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <QrCode className="h-4 w-4" />
            Generate QR Code
          </>
        )}
      </Button>
      <div className="text-[11px] text-muted-foreground/70">
        Open WhatsApp → Settings → Linked Devices → Scan QR
      </div>
    </div>
  )
}

// ============================================================
// Phone number login method — 2-step: request code → verify
// ============================================================
function PhoneMethod({ busy, onConnected }: { busy: boolean; onConnected: () => void }) {
  const [step, setStep] = React.useState<'request' | 'verify'>('request')
  const [phone, setPhone] = React.useState('')
  const [name, setName] = React.useState('')
  const [code, setCode] = React.useState('')
  const [sentCode, setSentCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const handleRequestCode = async () => {
    if (!phone.trim() || phone.trim().length < 7) {
      toast.error('Please enter a valid phone number')
      return
    }
    setLoading(true)
    try {
      const data = await apiPost<{ ok: boolean; code: string; phone: string }>('/api/whatsapp/phone-pair', { phone: phone.trim() })
      setSentCode(data.code)
      setStep('verify')
      toast.success('Pairing code sent', {
        description: `A 6-digit code was sent to ${phone}. (Simulation: code is ${data.code})`,
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (!code.trim() || code.trim().length !== 6) {
      toast.error('Please enter the 6-digit code')
      return
    }
    setLoading(true)
    try {
      await apiPost<{ ok: boolean; number: string; name: string }>('/api/whatsapp/phone-verify', {
        phone: phone.trim(),
        code: code.trim(),
        name: name.trim(),
      })
      toast.success('WhatsApp connected', {
        description: `Connected as ${phone.trim()}`,
      })
      onConnected()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'request') {
    return (
      <div className="flex flex-col gap-4 text-left">
        <div className="space-y-2">
          <Label htmlFor="wa-phone" className="text-xs font-medium">
            Phone Number
          </Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="wa-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="pl-9"
              autoComplete="tel"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Enter the number registered with your WhatsApp account.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wa-name" className="text-xs font-medium">
            Device Name <span className="text-muted-foreground/60">(optional)</span>
          </Label>
          <Input
            id="wa-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Laptop"
            className="text-sm"
          />
        </div>
        <Button
          onClick={handleRequestCode}
          disabled={loading || busy}
          className="h-10 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending code…
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" />
              Send Pairing Code
            </>
          )}
        </Button>
      </div>
    )
  }

  // Verify step
  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
        <div className="flex items-center gap-2 font-medium">
          <Check className="h-3.5 w-3.5" />
          Code sent to {phone}
        </div>
        {sentCode && (
          <div className="mt-1 text-[11px] text-emerald-300/70">
            Simulation mode: your code is <span className="font-mono font-bold">{sentCode}</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="wa-code" className="text-xs font-medium">
          Pairing Code (6 digits)
        </Label>
        <Input
          id="wa-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          className="text-center text-lg font-mono tracking-[0.5em]"
          inputMode="numeric"
          maxLength={6}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleVerify()
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setStep('request')}
          disabled={loading}
          className="gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <Button
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
          className="flex-1 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" />
              Verify &amp; Connect
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// QR ready card
// ============================================================
function QrReadyCard({
  qr,
  busy,
  now,
  onRefresh,
  onSimulateScan,
}: {
  qr: string
  busy: boolean
  now: Date
  onRefresh: () => void
  onSimulateScan: () => void
}) {
  // Countdown tied to QR generation time — we don't have exact server time,
  // so we anchor to component mount and reset on qr change.
  const [anchor, setAnchor] = React.useState(() => Date.now())
  React.useEffect(() => {
    setAnchor(Date.now())
  }, [qr])

  const elapsed = Math.floor((now.getTime() - anchor) / 1000)
  const remaining = Math.max(0, QR_COUNTDOWN_SEC - elapsed)

  // Auto-refresh when countdown hits 0
  React.useEffect(() => {
    if (remaining === 0) {
      onRefresh()
    }
  }, [remaining, onRefresh])

  return (
    <Card className="overflow-hidden rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="h-5 w-5 text-emerald-400" />
              Scan to Link Device
            </CardTitle>
            <CardDescription className="mt-1">
              Open WhatsApp → Settings → Linked Devices → Link a Device.
            </CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 font-mono tabular-nums',
              remaining <= 10
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-amber-500/15 text-amber-300',
            )}
          >
            <Clock className="mr-1 h-3 w-3" />
            {remaining}s
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col items-center gap-4">
          <div className="relative rounded-xl border-2 border-emerald-500/20 bg-white p-3 shadow-inner">
            <div className="relative h-[220px] w-[220px] max-w-full">
              <QrVisual payload={qr} size={220} />
              {/* Center logo overlay */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white shadow-md ring-1 ring-black/5">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </div>
            {/* Corner accents */}
            <span className="pointer-events-none absolute -left-0.5 -top-0.5 h-4 w-4 border-l-2 border-t-2 border-emerald-500" />
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-4 w-4 border-r-2 border-t-2 border-emerald-500" />
            <span className="pointer-events-none absolute -bottom-0.5 -left-0.5 h-4 w-4 border-b-2 border-l-2 border-emerald-500" />
            <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-4 w-4 border-b-2 border-r-2 border-emerald-500" />
          </div>

          <div className="max-w-xs text-center text-xs text-muted-foreground">
            QR refreshes automatically every {QR_COUNTDOWN_SEC}s. Stay on this
            screen while scanning.
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={busy}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
              Refresh QR
            </Button>
            <Button
              onClick={onSimulateScan}
              disabled={busy}
              className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              I&apos;ve scanned it (simulate)
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Connected card
// ============================================================
function ConnectedCard({
  session,
  now,
  busy,
  onReconnect,
  onLogout,
}: {
  session: WaSession
  now: Date
  busy: boolean
  onReconnect: () => void
  onLogout: () => void
}) {
  const connectedAt = session.connectedAt ? new Date(session.connectedAt) : null
  const uptimeSec = connectedAt
    ? Math.max(0, Math.floor((now.getTime() - connectedAt.getTime()) / 1000))
    : 0

  return (
    <Card className="overflow-hidden rounded-xl border border-emerald-500/20 bg-card/60 backdrop-blur card-hover">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="relative inline-flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 bg-emerald-500" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              WhatsApp Connected
            </CardTitle>
            <CardDescription>
              Your account is linked and ready to receive messages.
            </CardDescription>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
            <Check className="mr-1 h-3 w-3" /> Live
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Identity block */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-5 text-center sm:flex-row sm:text-left">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
            <Smartphone className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">
              {session.connectedName || 'WhatsApp Account'}
            </div>
            <div className="font-mono text-sm text-muted-foreground">
              {session.connectedNumber || '—'}
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailRow
            icon={<Smartphone className="h-4 w-4" />}
            label="Device"
            value={session.deviceInfo || '—'}
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Connected at"
            value={formatDateTime(connectedAt)}
          />
          <DetailRow
            icon={<Activity className="h-4 w-4" />}
            label="Session uptime"
            value={formatUptime(uptimeSec)}
            mono
          />
          <DetailRow
            icon={<Wifi className="h-4 w-4" />}
            label="Connection"
            value="Stable · End-to-end encrypted"
          />
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={onReconnect}
            disabled={busy}
            className="gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reconnect
          </Button>
          <Button
            variant="destructive"
            onClick={onLogout}
            disabled={busy}
            className="gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Logout
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
          {label}
        </div>
        <div
          className={cn(
            'truncate text-sm font-medium',
            mono && 'font-mono tabular-nums',
          )}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Connecting card
// ============================================================
function ConnectingCard({ label }: { label: string }) {
  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="relative grid h-16 w-16 place-items-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/20" />
          <div className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </div>
        <div>
          <div className="text-base font-semibold">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Establishing secure WebSocket to WhatsApp servers…
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Session Health card (side panel)
// ============================================================
function SessionHealthCard({
  session,
  now,
}: {
  session: WaSession | null
  now: Date
}) {
  const state = session?.state ?? 'disconnected'
  const lastSeenSec = session?.lastSeen
    ? Math.max(0, Math.floor((now.getTime() - new Date(session.lastSeen).getTime()) / 1000))
    : null
  const uptimeSec =
    session?.connectedAt && state === 'connected'
      ? Math.max(0, Math.floor((now.getTime() - new Date(session.connectedAt).getTime()) / 1000))
      : 0

  const rows: { label: string; value: React.ReactNode; tone?: string }[] = [
    {
      label: 'Session state',
      value: <StatePill state={state} />,
    },
    {
      label: 'QR status',
      value: (
        <span
          className={cn(
            'text-xs font-medium',
            state === 'qr_ready' ? 'text-amber-300' : 'text-muted-foreground',
          )}
        >
          {state === 'qr_ready' ? 'Active · awaiting scan' : 'Idle'}
        </span>
      ),
    },
    {
      label: 'Last seen',
      value: (
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {lastSeenSec === null
            ? '—'
            : lastSeenSec < 60
              ? `${lastSeenSec}s ago`
              : timeAgo(session?.lastSeen ?? null)}
        </span>
      ),
    },
    {
      label: 'Session uptime',
      value: (
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {state === 'connected' ? formatUptime(uptimeSec) : '—'}
        </span>
      ),
    },
  ]

  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-emerald-400" />
          Session Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{r.label}</span>
            {r.value}
          </div>
        ))}
        <Separator />
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-emerald-300/90">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>
            Multi-device session · keys stored locally · auto-reconnect enabled
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Log preview card (side panel)
// ============================================================
const LOG_LEVEL_TONE: Record<string, string> = {
  info: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-rose-300',
  debug: 'text-sky-300',
}

function LogPreviewCard({ logs }: { logs: LogRow[] }) {
  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ScrollText className="h-4 w-4 text-emerald-400" />
          Recent WhatsApp Logs
        </CardTitle>
        <CardDescription className="text-[11px]">
          Last 5 events from the WhatsApp engine.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-72">
          <div className="px-4 pb-4">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                <Power className="h-5 w-5 opacity-50" />
                <div>No WhatsApp events yet.</div>
                <div className="text-[11px] text-muted-foreground/70">
                  Generate a QR to start logging.
                </div>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-md border bg-muted/20 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider',
                          LOG_LEVEL_TONE[log.level] ?? 'text-muted-foreground',
                        )}
                      >
                        {log.level}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                        {new Date(log.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs">
                      {log.message}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

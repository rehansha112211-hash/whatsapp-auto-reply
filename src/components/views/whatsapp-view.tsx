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

// ============================================================
// Types
// ============================================================
interface WaSession {
  state: WhatsAppState
  connectedNumber: string
  connectedName: string
  connectedAt: string | null
  deviceInfo: string
  qrCode: string
  lastSeen: string
  engineAvailable: boolean
  error: string
}

const STATE_META: Record<WhatsAppState, { label: string; tone: 'ok' | 'warning' | 'idle' | 'error' }> = {
  connected: { label: 'Connected', tone: 'ok' },
  qr_ready: { label: 'Scan QR', tone: 'warning' },
  connecting: { label: 'Connecting', tone: 'warning' },
  disconnected: { label: 'Disconnected', tone: 'idle' },
  logged_out: { label: 'Logged out', tone: 'error' },
}

// ============================================================
// Main view — REAL WhatsApp only (Baileys engine)
// ============================================================
export function WhatsAppView() {
  const [session, setSession] = React.useState<WaSession | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [logs, setLogs] = React.useState<LogRow[]>([])
  const [now, setNow] = React.useState(() => new Date())

  // Poll the real engine state every 3s
  const refresh = React.useCallback(async () => {
    try {
      const data = await apiGet<WaSession>('/api/whatsapp')
      setSession(data)
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])

  // Refresh logs every 8s
  const refreshLogs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/logs?category=whatsapp&limit=5', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as unknown
      if (Array.isArray(data)) {
        setLogs(data as LogRow[])
      } else if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
        setLogs((data as { items: LogRow[] }).items)
      }
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    refreshLogs()
    const t = setInterval(refreshLogs, 8000)
    return () => clearInterval(t)
  }, [refreshLogs])

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Generate REAL QR via Baileys engine
  const handleGenerateQr = async () => {
    setBusy(true)
    try {
      await apiPost('/api/whatsapp/qr')
      toast.success('Connecting to WhatsApp…', {
        description: 'Real QR code will appear shortly. Scan with your phone.',
      })
      await refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to connect')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    try {
      await apiPost('/api/whatsapp/disconnect')
      toast.success('Disconnected', { description: 'WhatsApp session disconnected.' })
      await refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    setBusy(true)
    try {
      await apiPost('/api/whatsapp/logout')
      toast.success('Logged out', { description: 'Session cleared. New QR scan required to reconnect.' })
      await refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Logout failed')
    } finally {
      setBusy(false)
    }
  }

  const state = session?.state ?? 'disconnected'
  const engineAvailable = session?.engineAvailable ?? false

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto w-full max-w-5xl"
    >
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gradient-premium">WhatsApp Connection</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real WhatsApp connection via Baileys multi-device protocol.
          End-to-end encrypted, auto-reconnecting.
        </p>
      </div>

      {/* Engine status banner */}
      {engineAvailable ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/20">
            <Check className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-emerald-300">
              Real WhatsApp Engine Active
            </div>
            <div className="text-xs text-emerald-300/70">
              Baileys multi-device protocol · Port 3004 ·{' '}
              {state === 'connected'
                ? `Connected as ${session?.connectedNumber}`
                : state === 'connecting'
                  ? 'Connecting to WhatsApp servers…'
                  : state === 'qr_ready'
                    ? 'QR code ready — scan with your phone'
                    : 'Disconnected'}
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/20">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-rose-300">
              WhatsApp Engine Not Running
            </div>
            <div className="text-xs text-rose-300/70">
              Start the real engine:{' '}
              <code className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[11px]">
                cd mini-services/whatsapp-engine && bun run dev
              </code>
            </div>
          </div>
        </div>
      )}

      {/* State pill */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
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
              onDisconnect={handleDisconnect}
              onLogout={handleLogout}
            />
          ) : session?.qrCode ? (
            <RealQrCard
              qrPayload={session.qrCode}
              busy={busy}
              onRefresh={handleGenerateQr}
              error={session?.error ?? ''}
            />
          ) : state === 'connecting' ? (
            <ConnectingCard label="Connecting to WhatsApp servers…" />
          ) : (
            <DisconnectedCard
              isLoggedOut={state === 'logged_out'}
              busy={busy}
              onGenerate={handleGenerateQr}
              engineAvailable={engineAvailable}
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
    idle: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', toneCls[meta.tone])}>
      {meta.tone === 'ok' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-ring" />}
      {meta.label}
    </span>
  )
}

// ============================================================
// Disconnected card — shows "Connect" button to start real QR
// ============================================================
function DisconnectedCard({
  isLoggedOut,
  busy,
  onGenerate,
  engineAvailable,
  onRefresh,
}: {
  isLoggedOut: boolean
  busy: boolean
  onGenerate: () => void
  engineAvailable: boolean
  onRefresh: () => void
}) {
  const [howOpen, setHowOpen] = React.useState(false)
  const [method, setMethod] = React.useState<'qr' | 'phone'>('phone')

  return (
    <Card className="overflow-hidden rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:py-14">
        <div className="relative mb-6 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
          <MessageCircle className="h-10 w-10" />
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-background">
            {method === 'qr' ? (
              <QrCode className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </span>
        </div>

        <h2 className="text-xl font-semibold tracking-tight">Connect WhatsApp</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {engineAvailable
            ? 'Choose a method below to connect your WhatsApp account via the Baileys multi-device protocol.'
            : 'The real WhatsApp engine is not running. Start it first.'}
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
            onClick={() => setMethod('phone')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              method === 'phone'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Phone Number
          </button>
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
        </div>

        {/* Method content */}
        <div className="mt-6 w-full max-w-sm">
          {method === 'phone' ? (
            <PhonePairMethod busy={busy} engineAvailable={engineAvailable} onConnected={onRefresh} />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Button
                onClick={onGenerate}
                disabled={busy || !engineAvailable}
                className="h-11 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 px-6 text-white hover:from-emerald-600 hover:to-teal-700"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
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
              {howOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            <ol className="mt-2 space-y-3 px-3 py-2">
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300">1</span>
                <div>
                  <div className="text-sm font-medium">Phone Number Method (Recommended)</div>
                  <div className="text-xs text-muted-foreground">Enter your WhatsApp number → get a pairing code → enter it in WhatsApp → Linked Devices → "Link with phone number". No camera needed!</div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300">2</span>
                <div>
                  <div className="text-sm font-medium">QR Code Method</div>
                  <div className="text-xs text-muted-foreground">Generate a QR → scan with your phone camera. Classic method.</div>
                </div>
              </li>
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Phone Number Pairing — official WhatsApp alternative to QR
// ============================================================
function PhonePairMethod({
  busy,
  engineAvailable,
  onConnected,
}: {
  busy: boolean
  engineAvailable: boolean
  onConnected: () => void
}) {
  const [phone, setPhone] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [pairCode, setPairCode] = React.useState('')

  const handlePair = async () => {
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 7) {
      toast.error('Please enter a valid phone number with country code')
      return
    }
    setLoading(true)
    setPairCode('')
    try {
      const data = await apiPost<{ ok: boolean; code: string; phone: string; error?: string }>(
        '/api/whatsapp/pair-phone',
        { phone: cleanPhone },
      )
      if (data.ok && data.code) {
        setPairCode(data.code)
        toast.success('Pairing code generated!', {
          description: 'Enter this code in WhatsApp → Linked Devices → Link with phone number',
        })
      } else {
        toast.error(data.error || 'Failed to get pairing code')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to get pairing code')
    } finally {
      setLoading(false)
    }
  }

  if (pairCode) {
    return (
      <div className="flex flex-col gap-4 text-left">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-300">
            Your WhatsApp Pairing Code
          </div>
          <div className="mt-3 text-4xl font-bold tracking-[0.3em] text-emerald-300 font-mono">
            {pairCode}
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="font-medium">Steps to connect:</div>
          <ol className="ml-4 list-decimal space-y-1.5 text-muted-foreground">
            <li>Open <strong className="text-foreground">WhatsApp</strong> on your phone</li>
            <li>Go to <strong className="text-foreground">Settings → Linked Devices</strong></li>
            <li>Tap <strong className="text-foreground">Link a Device</strong></li>
            <li>Choose <strong className="text-foreground">"Link with phone number instead"</strong></li>
            <li>Enter the code above: <strong className="text-emerald-300 font-mono">{pairCode}</strong></li>
          </ol>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          Code expires soon. Enter it quickly in your phone's WhatsApp.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setPairCode(''); onConnected() }}
          className="w-full"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Check Connection Status
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="space-y-2">
        <Label htmlFor="pair-phone" className="text-xs font-medium">
          WhatsApp Phone Number
        </Label>
        <div className="relative">
          <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="pair-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="919876543210"
            className="pl-9"
            inputMode="numeric"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Enter your number with country code (no +, no spaces).
          Example: 91 for India, 1 for USA.
        </p>
      </div>
      <Button
        onClick={handlePair}
        disabled={loading || busy || !engineAvailable}
        className="h-10 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Getting pairing code…
          </>
        ) : (
          <>
            <Smartphone className="h-4 w-4" />
            Get Pairing Code
          </>
        )}
      </Button>
    </div>
  )
}

// ============================================================
// Real QR card — shows the genuine Baileys QR for scanning
// ============================================================
function RealQrCard({
  qrPayload,
  busy,
  onRefresh,
  error,
}: {
  qrPayload: string
  busy: boolean
  onRefresh: () => void
  error: string
}) {
  const [countdown, setCountdown] = React.useState(60)
  React.useEffect(() => {
    if (countdown <= 0) {
      onRefresh()
      setCountdown(60)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, onRefresh])

  return (
    <Card className="overflow-hidden rounded-xl border border-emerald-500/30 bg-card/60 backdrop-blur card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15">
            <QrCode className="h-4 w-4 text-emerald-400" />
          </span>
          <div>
            <CardTitle className="text-base">Real WhatsApp QR Code</CardTitle>
            <CardDescription className="text-xs">
              Powered by Baileys · Scan with your phone to connect
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 pb-6">
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-white p-6 shadow-lg">
          <QrImage payload={qrPayload} size={320} />
        </div>

        <div className="text-center">
          <div className="text-sm font-medium text-emerald-300">
            ✓ Real QR active — scan to connect
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Open WhatsApp → Settings → Linked Devices → Link a Device → Scan QR
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs">
            <Clock className="h-3 w-3 text-amber-400" />
            <span>Expires in {countdown}s</span>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh QR
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300/80">
          <ShieldCheck className="h-3.5 w-3.5" />
          This is a genuine WhatsApp multi-device pairing QR. Your phone
          stays optional after the first sync.
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// QR Image — renders a REAL scannable QR code from the Baileys
// payload using the `qrcode` library (generates a data URL).
// ============================================================
import QRCode from 'qrcode'

function QrImage({ payload, size = 320 }: { payload: string; size?: number }) {
  const [dataUrl, setDataUrl] = React.useState<string>('')

  React.useEffect(() => {
    let cancelled = false
    if (!payload) {
      setDataUrl('')
      return
    }
    // Generate a REAL scannable QR code — no overlays, clean black/white
    QRCode.toDataURL(payload, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [payload, size])

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="grid place-items-center bg-white"
      >
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="WhatsApp QR Code"
      style={{ display: 'block' }}
    />
  )
}

// ============================================================
// Connected card
// ============================================================
function ConnectedCard({
  session,
  now,
  busy,
  onDisconnect,
  onLogout,
}: {
  session: WaSession
  now: Date
  busy: boolean
  onDisconnect: () => void
  onLogout: () => void
}) {
  const connectedAt = session.connectedAt ? new Date(session.connectedAt) : null
  const uptime = connectedAt ? Math.floor((now.getTime() - connectedAt.getTime()) / 1000) : 0

  return (
    <Card className="overflow-hidden rounded-xl border border-emerald-500/30 bg-card/60 backdrop-blur card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
            <MessageCircle className="h-6 w-6" />
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-emerald-500">
              <Check className="h-3 w-3 text-white" />
            </span>
          </div>
          <div>
            <CardTitle className="text-lg">WhatsApp Connected</CardTitle>
            <CardDescription className="text-xs">
              Real connection via Baileys · End-to-end encrypted
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoTile label="Phone Number" value={session.connectedNumber || '—'} mono />
          <InfoTile label="Account Name" value={session.connectedName || '—'} />
          <InfoTile label="Connected Since" value={connectedAt ? formatDateTime(connectedAt.toISOString()) : '—'} />
          <InfoTile label="Session Uptime" value={formatUptime(uptime)} mono />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Messages are flowing through the real WhatsApp protocol. AI auto-reply is active.
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" onClick={onDisconnect} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
          Disconnect
        </Button>
        <Button variant="outline" size="sm" onClick={onLogout} disabled={busy} className="gap-1.5 text-rose-400 hover:text-rose-300">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          Logout (clear session)
        </Button>
      </CardFooter>
    </Card>
  )
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-sm font-medium', mono && 'font-mono')}>{value}</div>
    </div>
  )
}

// ============================================================
// Connecting card
// ============================================================
function ConnectingCard({ label }: { label: string }) {
  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="relative grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
        <div>
          <div className="text-base font-semibold">{label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Establishing real WebSocket connection to WhatsApp servers…
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Session health card (side panel)
// ============================================================
function SessionHealthCard({ session, now }: { session: WaSession | null; now: Date }) {
  const uptime = session?.connectedAt
    ? Math.floor((now.getTime() - new Date(session.connectedAt).getTime()) / 1000)
    : 0
  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-emerald-400" />
          Session Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Row label="Engine" value={session?.engineAvailable ? '✓ Running' : '✗ Offline'} />
        <Row label="State" value={session?.state ?? 'disconnected'} />
        <Row label="QR status" value={session?.qrCode ? 'Active' : 'Idle'} />
        <Row label="Last seen" value={session ? timeAgo(session.lastSeen) : '—'} />
        <Row label="Uptime" value={session?.connectedAt ? formatUptime(uptime) : '—'} mono />
      </CardContent>
    </Card>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

// ============================================================
// Log preview card (side panel)
// ============================================================
function LogPreviewCard({ logs }: { logs: LogRow[] }) {
  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ScrollText className="h-4 w-4 text-emerald-400" />
          Recent WhatsApp Logs
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-72 scrollbar-thin">
          <div className="space-y-1.5">
            {logs.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No logs yet</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-[9px]',
                      log.level === 'error' && 'border-rose-500/30 text-rose-400',
                      log.level === 'warn' && 'border-amber-500/30 text-amber-400',
                      log.level === 'info' && 'border-emerald-500/30 text-emerald-400',
                    )}
                  >
                    {log.level}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{log.message}</div>
                    <div className="text-[10px] text-muted-foreground">{timeAgo(log.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

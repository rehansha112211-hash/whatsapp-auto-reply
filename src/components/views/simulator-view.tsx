'use client'

// ============================================================
// SimulatorView — end-to-end test harness for the AI auto-reply
// pipeline. Lets the operator simulate an incoming WhatsApp
// customer message (no real WhatsApp connection needed) and
// watch the real LLM produce a reply, score the lead, and
// (optionally) trigger owner-notification + human-takeover.
// ============================================================
import * as React from 'react'
import { toast } from 'sonner'
import {
  FlaskConical,
  Send,
  Sparkles,
  Dices,
  MessageCircle,
  Bot,
  User,
  AlertTriangle,
  Flame,
  ArrowRight,
  RotateCcw,
  Clock,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { apiPost, apiGet } from '@/lib/api-client'
import { leadBadge } from '@/lib/format'
import { useRealtime } from '@/hooks/use-realtime'
import type { ViewKey, ChatMessage } from '@/lib/types'

interface SimulatorResult {
  ok: boolean
  contactId: string
  replyText: string | null
  replyMessageId: string | null
  leadScore: number
  ownerRequested: boolean
  ownerNotified: boolean
  aiSkipped: boolean
  detectedService?: string
  responseMs?: number
  error?: string
}

interface SimulatorViewProps {
  onNavigate?: (v: ViewKey) => void
}

const QUICK_MESSAGES = [
  'Hi, I need a website',
  'Mujhe ek app chahiye budget 30k',
  'I want to talk to owner',
  'What services do you offer?',
  'Need a CRM urgently, ready to pay',
  'Namaste, AI automation chahiye',
]

function randomIndianPhone(): string {
  const prefix = '+91'
  // Indian mobile numbers start with 6/7/8/9
  const first = ['6', '7', '8', '9'][Math.floor(Math.random() * 4)]
  let rest = ''
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10).toString()
  return `${prefix} ${first}${rest.slice(0, 4)} ${rest.slice(4)}`
}

function categoryLabel(svc: string): string {
  if (!svc) return '—'
  return svc.replace(/_/g, ' ')
}

export function SimulatorView({ onNavigate }: SimulatorViewProps) {
  const [phone, setPhone] = React.useState<string>(() => randomIndianPhone())
  const [name, setName] = React.useState<string>('')
  const [text, setText] = React.useState<string>('')
  const [sending, setSending] = React.useState<boolean>(false)
  const [result, setResult] = React.useState<SimulatorResult | null>(null)
  const [lastSent, setLastSent] = React.useState<{ text: string; at: number } | null>(null)
  const [history, setHistory] = React.useState<ChatMessage[]>([])
  const [historyLoading, setHistoryLoading] = React.useState<boolean>(false)
  const [activeContactId, setActiveContactId] = React.useState<string | null>(null)
  const [tickCount, setTickCount] = React.useState<number>(0)

  // Live-mode: re-fetch conversation history whenever the realtime service
  // emits a dashboard:tick or a simulator:message broadcast. This keeps
  // multiple simulator tabs (and the dashboard) in sync.
  useRealtime([
    {
      event: 'dashboard:tick',
      handler: () => setTickCount((n) => n + 1),
    },
    {
      event: 'simulator:message',
      handler: (payload: unknown) => {
        const p = payload as { contactId?: string } | null
        if (p?.contactId && p.contactId === activeContactId) {
          setTickCount((n) => n + 1)
        }
      },
    },
  ])

  const refreshHistory = React.useCallback(async (contactId: string) => {
    setHistoryLoading(true)
    try {
      const data = await apiGet<ChatMessage[] | { items: ChatMessage[] }>(
        `/api/messages?contactId=${encodeURIComponent(contactId)}&limit=50`,
      )
      const list = Array.isArray(data) ? data : (data?.items ?? [])
      // API returns oldest-first (most common); ensure chronological order.
      setHistory(
        list.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        ),
      )
    } catch {
      // The messages endpoint may not be live yet (parallel agent). Stay
      // silent — the live chat preview above still shows the latest send.
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Re-fetch when contactId changes OR a realtime tick fires.
  React.useEffect(() => {
    if (activeContactId) void refreshHistory(activeContactId)
  }, [activeContactId, refreshHistory, tickCount])

  const handleSend = async () => {
    if (!phone.trim()) {
      toast.error('Phone number is required')
      return
    }
    if (!text.trim()) {
      toast.error('Message text is required')
      return
    }
    setSending(true)
    setResult(null)
    setLastSent({ text: text.trim(), at: Date.now() })
    try {
      const res = await apiPost<SimulatorResult>('/api/simulator/send', {
        phone: phone.trim(),
        name: name.trim() || undefined,
        text: text.trim(),
      })
      setResult(res)
      setActiveContactId(res.contactId)
      if (res.ok) {
        if (res.aiSkipped) {
          toast.info('AI skipped — human mode is active for this contact.')
        } else {
          toast.success('AI reply generated!')
        }
      } else {
        toast.error(res.error || 'AI reply failed')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      toast.error(msg)
      setResult({
        ok: false,
        contactId: '',
        replyText: null,
        replyMessageId: null,
        leadScore: 0,
        ownerRequested: false,
        ownerNotified: false,
        aiSkipped: false,
        error: msg,
      })
    } finally {
      setSending(false)
    }
  }

  const handleReset = () => {
    setPhone(randomIndianPhone())
    setName('')
    setText('')
    setResult(null)
    setLastSent(null)
    setHistory([])
    setActiveContactId(null)
    toast.message('New simulated phone generated')
  }

  const handleRandomizePhone = () => {
    setPhone(randomIndianPhone())
    setResult(null)
    setHistory([])
    setActiveContactId(null)
  }

  const handleQuickPick = (msg: string) => {
    setText(msg)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Message Simulator
            </h1>
            <p className="text-sm text-muted-foreground">
              Test the AI auto-reply engine end-to-end without a real WhatsApp
              connection. Simulated messages flow through the real LLM pipeline.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset conversation
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ============ LEFT: FORM ============ */}
        <Card className="rounded-xl border bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-emerald-400" />
              Simulate Incoming Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="sim-phone" className="text-xs font-medium">
                Customer phone number
              </Label>
              <div className="flex gap-2">
                <Input
                  id="sim-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRandomizePhone}
                  title="Randomize phone"
                  aria-label="Randomize phone"
                >
                  <Dices className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Prefilled with a random Indian number. Click 🎲 to roll a new one.
              </p>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="sim-name" className="text-xs font-medium">
                Customer name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="sim-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rahul Sharma"
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="sim-text" className="text-xs font-medium">
                Incoming message
              </Label>
              <Textarea
                id="sim-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type the customer's message here…"
                rows={4}
                className="resize-none"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{text.length} chars</span>
                <span>Enter to send · Shift+Enter for newline</span>
              </div>
            </div>

            {/* Quick-pick chips */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Quick-pick messages</Label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_MESSAGES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleQuickPick(m)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      text === m
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Send button */}
            <Button
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim() || !phone.trim()}
              className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                    <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                    <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  AI is thinking…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Send &amp; Generate AI Reply
                </>
              )}
            </Button>

            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              The simulated message runs through{' '}
              <code className="font-mono text-foreground">processIncomingMessage</code>{' '}
              → upsert contact → save incoming → AI reply (z-ai-web-dev-sdk) →
              save outgoing → memory update → lead score history → owner notify.
            </div>
          </CardContent>
        </Card>

        {/* ============ RIGHT: RESULT ============ */}
        <Card className="rounded-xl border bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-emerald-400" />
              AI Reply Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Chat preview */}
            <div className="min-h-[180px] space-y-3 rounded-xl border bg-background/40 p-4">
              {!lastSent && !sending && (
                <div className="flex h-[150px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Bot className="h-8 w-8 text-muted-foreground/50" />
                  <div>Send a simulated message to see the AI reply here.</div>
                </div>
              )}

              {/* Incoming bubble */}
              {lastSent && (
                <div className="flex items-end gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div className="chat-bubble-in max-w-[80%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm">
                    <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">
                      {name || 'Customer'}
                    </div>
                    <p className="whitespace-pre-wrap break-words">{lastSent.text}</p>
                    <div className="mt-1 text-right text-[9px] text-muted-foreground">
                      {new Date(lastSent.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Typing indicator while waiting */}
              {sending && (
                <div className="flex items-end justify-end gap-2">
                  <div className="chat-bubble-out flex items-center gap-1 rounded-2xl rounded-tr-sm px-3 py-2.5">
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/80" />
                  </div>
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}

              {/* AI reply bubble */}
              {result && result.replyText && !sending && (
                <div className="flex items-end justify-end gap-2">
                  <div className="chat-bubble-out max-w-[80%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-80">
                      <Bot className="h-3 w-3" />
                      AI
                    </div>
                    <p className="whitespace-pre-wrap break-words">{result.replyText}</p>
                    <div className="mt-1 text-right text-[9px] opacity-70">
                      {new Date().toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}

              {/* AI skipped */}
              {result && result.aiSkipped && !sending && (
                <div className="flex items-end justify-end gap-2">
                  <div className="rounded-2xl rounded-tr-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    AI reply skipped — human mode active for this contact.
                  </div>
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/30 text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}

              {/* Error */}
              {result && !result.ok && !sending && (
                <div className="flex items-end justify-end gap-2">
                  <div className="rounded-2xl rounded-tr-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    AI reply failed: {result.error}
                  </div>
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-500/30 text-rose-300">
                    <XCircle className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}
            </div>

            {/* Metadata */}
            {result && result.ok && (
              <>
                {result.ownerRequested && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Owner was notified and human mode auto-enabled.</div>
                      <div className="opacity-80">
                        Future messages from this number will not receive AI replies until human mode is turned off.
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <MetaItem
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Response time"
                    value={result.responseMs != null ? `${result.responseMs} ms` : '—'}
                  />
                  <MetaItem
                    icon={<Flame className="h-3.5 w-3.5" />}
                    label="Lead score"
                    value={
                      <Badge className={cn('border', leadBadge(result.leadScore))}>
                        {result.leadScore}
                      </Badge>
                    }
                  />
                  <MetaItem
                    icon={<Tag className="h-3.5 w-3.5" />}
                    label="Category"
                    value={categoryLabel(result.detectedService ?? '')}
                  />
                  <MetaItem
                    icon={result.ownerRequested ? <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    label="Owner requested"
                    value={result.ownerRequested ? 'Yes' : 'No'}
                  />
                  <MetaItem
                    icon={result.ownerNotified ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    label="Owner notified"
                    value={result.ownerNotified ? 'Yes' : 'No'}
                  />
                  <MetaItem
                    icon={result.aiSkipped ? <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                    label="AI skipped"
                    value={result.aiSkipped ? 'Yes (human mode)' : 'No'}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => onNavigate?.('chats')}
                  >
                    View in Chats
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  {result.contactId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => onNavigate?.('leads')}
                    >
                      View lead details
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </>
            )}

            {!result && !sending && (
              <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                Metadata (response time, lead score, category, owner flags) will
                appear here after the AI reply is generated.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ BOTTOM: CONVERSATION HISTORY ============ */}
      <Card className="rounded-xl border bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-400" />
              Conversation history
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {activeContactId ? (
                <span className="font-mono">{phone}</span>
              ) : (
                'No contact yet'
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!activeContactId ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <User className="h-8 w-8 text-muted-foreground/50" />
              <div>
                Send a simulated message to load the full conversation thread for
                this phone number.
              </div>
            </div>
          ) : historyLoading && history.length === 0 ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading conversation…
            </div>
          ) : history.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
              <div>
                No conversation history available yet. The chat preview above
                shows the latest simulated exchange.
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 gap-2 text-xs"
                onClick={() => activeContactId && void refreshHistory(activeContactId)}
              >
                <RotateCcw className="h-3 w-3" />
                Retry fetch
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-96 scrollbar-thin">
              <div className="space-y-3 p-1">
                {history.map((m) => {
                  const isIncoming = m.direction === 'incoming'
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex items-end gap-2',
                        isIncoming ? 'justify-start' : 'justify-end',
                      )}
                    >
                      {isIncoming && (
                        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                          <User className="h-3 w-3" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                          isIncoming
                            ? 'chat-bubble-in rounded-tl-sm'
                            : 'chat-bubble-out rounded-tr-sm',
                        )}
                      >
                        {!isIncoming && (
                          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold opacity-80">
                            {m.source === 'ai' ? (
                              <>
                                <Bot className="h-3 w-3" /> AI
                              </>
                            ) : m.source === 'owner' ? (
                              <>
                                <User className="h-3 w-3" /> Owner
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3 w-3" /> {m.source}
                              </>
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <div
                          className={cn(
                            'mt-1 text-right text-[9px]',
                            isIncoming ? 'text-muted-foreground' : 'opacity-70',
                          )}
                        >
                          {new Date(m.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      {!isIncoming && (
                        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                          <Bot className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------- Helper components ----------------

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  )
}

'use client'

// ============================================================
// ChatsView — WhatsApp-Web-style 3-pane chat interface
//
//  · Left   → conversation list (search + filter, pinned-first sort)
//  · Center → chat window (bubbles, date separators, composer)
//  · Right  → customer details panel (lead info, memory, actions)
//
// On mobile, the layout collapses to a single pane with a back
// button to swap between list and chat, and the details panel
// becomes a Sheet triggered from the chat header.
//
// Polling: chats list every 8s, messages every 4s. Realtime:
// listens for `dashboard:tick` and `simulator:message` events
// from the war-realtime websocket mini-service for instant refresh.
// ============================================================
import * as React from 'react'
import { toast } from 'sonner'
import {
  MessageCircle,
  Search,
  Filter,
  Pin,
  Send,
  ArrowLeft,
  Info,
  Bot,
  User,
  UserCog,
  Flame,
  Clock,
  Check,
  CheckCheck,
  AlertTriangle,
  MoreVertical,
  Shield,
  Bell,
  Loader2,
  Inbox,
  X,
  Sparkles,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch } from '@/lib/api-client'
import {
  colorFromString,
  initials,
  timeAgo,
  formatTime,
  formatDateTime,
} from '@/lib/format'
import { useRealtime } from '@/hooks/use-realtime'
import { LeadBadge } from '@/components/status'
import type {
  ChatListItem,
  ChatMessage,
  ContactDetail,
  ContactStatus,
  MessageStatus,
  WhatsAppState,
} from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
type FilterKey = 'all' | 'unread' | 'lead' | 'hot' | 'ai' | 'human' | 'pinned'

interface WaStateResponse {
  state: WhatsAppState
  connectedNumber: string
  connectedName: string
}

interface SendMessageResponse {
  ok: boolean
  message: ChatMessage
}

interface HumanModeResponse {
  ok: boolean
  humanMode: boolean
}

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: 'all', label: 'All conversations' },
  { value: 'unread', label: 'Unread only' },
  { value: 'lead', label: 'Leads' },
  { value: 'hot', label: 'Hot leads (≥70)' },
  { value: 'ai', label: 'AI active' },
  { value: 'human', label: 'Human mode' },
  { value: 'pinned', label: 'Pinned' },
]

const STATUS_BADGE: Record<ContactStatus, string> = {
  new: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  lead: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  customer: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  blocked: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const MEMORY_KEY_LABELS: Record<string, string> = {
  name: 'Name',
  business: 'Business',
  requirements: 'Requirements',
  budget: 'Budget',
  language: 'Language',
  last_intent: 'Last intent',
  intent: 'Intent',
  project_status: 'Project status',
  timeline: 'Timeline',
  location: 'Location',
  service: 'Service',
  contact_method: 'Contact method',
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Group messages into buckets keyed by YYYY-MM-DD so we can render date separators. */
function groupByDay(messages: ChatMessage[]): { day: string; items: ChatMessage[] }[] {
  const out: { day: string; items: ChatMessage[] }[] = []
  for (const m of messages) {
    const d = new Date(m.timestamp)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const last = out[out.length - 1]
    if (last && last.day === key) last.items.push(m)
    else out.push({ day: key, items: [m] })
  }
  return out
}

function formatDayHeader(day: string): string {
  const d = new Date(day + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function memoryLabel(key: string): string {
  return MEMORY_KEY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function categoryLabel(svc: string): string {
  const map: Record<string, string> = {
    website: 'Website Development',
    app: 'Android App Development',
    crm: 'CRM Development',
    software: 'Business Software',
    ai_automation: 'AI Automation',
    maintenance: 'Maintenance',
    general: 'General Inquiry',
    support: 'Support Request',
    high_priority: 'High Priority',
  }
  return map[svc] ?? (svc ? svc : '—')
}

// ------------------------------------------------------------
// Small presentational components
// ------------------------------------------------------------

function Avatar({ name, phone, size = 'md' }: { name: string; phone: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = colorFromString(name || phone)
  const dim =
    size === 'sm' ? 'h-8 w-8 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-xs'
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold',
        dim,
        cls,
      )}
      aria-hidden
    >
      {initials(name || phone)}
    </div>
  )
}

function DeliveryIcon({ status }: { status: MessageStatus }) {
  if (status === 'failed') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
        </TooltipTrigger>
        <TooltipContent side="top">Failed to send</TooltipContent>
      </Tooltip>
    )
  }
  if (status === 'pending') {
    return <Clock className="h-3.5 w-3.5 opacity-70" />
  }
  if (status === 'sent') {
    return <Check className="h-3.5 w-3.5 opacity-70" />
  }
  if (status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 opacity-70" />
  }
  // read
  return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />
}

function SourceBadge({ source }: { source: ChatMessage['source'] }) {
  if (source === 'customer') return null
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    ai: {
      label: 'AI',
      cls: 'bg-emerald-500/20 text-emerald-200',
      icon: <Bot className="h-3 w-3" />,
    },
    owner: {
      label: 'You',
      cls: 'bg-primary/30 text-primary-foreground',
      icon: <User className="h-3 w-3" />,
    },
    system: {
      label: 'System',
      cls: 'bg-zinc-500/20 text-zinc-300',
      icon: <Shield className="h-3 w-3" />,
    },
  }
  const cfg = map[source]
  if (!cfg) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
        cfg.cls,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing'
  return (
    <div className={cn('flex w-full', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'shadow-sm max-w-[78%] sm:max-w-[68%] rounded-2xl px-3 py-2 text-sm break-words',
          isOutgoing
            ? 'chat-bubble-out rounded-tr-sm'
            : 'chat-bubble-in rounded-tl-sm',
        )}
      >
        {/* Source badge row (for AI / Owner / System outgoing, none for customer) */}
        {isOutgoing && message.source !== 'owner' && (
          <div className="mb-1">
            <SourceBadge source={message.source} />
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums',
            isOutgoing ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          <span>{formatTime(message.timestamp)}</span>
          {isOutgoing && <DeliveryIcon status={message.status} />}
        </div>
      </div>
    </div>
  )
}

function DateSeparator({ day }: { day: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-muted/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
        {formatDayHeader(day)}
      </span>
    </div>
  )
}

// ------------------------------------------------------------
// ConversationList — left pane
// ------------------------------------------------------------
interface ConversationListProps {
  items: ChatListItem[]
  loading: boolean
  selectedId: string | null
  search: string
  filter: FilterKey
  onSelect: (id: string) => void
  onSearchChange: (v: string) => void
  onFilterChange: (v: FilterKey) => void
}

function ConversationList({
  items,
  loading,
  selectedId,
  search,
  filter,
  onSelect,
  onSearchChange,
  onFilterChange,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b p-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4 text-primary" />
            Chats
          </h2>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {items.length}
          </Badge>
        </div>
        {/* Search */}
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, phone or message…"
            className="h-9 pl-8 pr-7 text-sm"
            aria-label="Search conversations"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Filter */}
        <div className="mt-2 flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => onFilterChange(v as FilterKey)}>
            <SelectTrigger size="sm" className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading && items.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
              <Inbox className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium">No conversations yet</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Use the Simulator to test the AI.
              </div>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((c) => {
              const active = c.contactId === selectedId
              const previewPrefix =
                c.lastDirection === 'outgoing'
                  ? c.lastMessage.startsWith('AI:') || c.lastMessage.startsWith('You:')
                    ? ''
                    : 'You: '
                  : ''
              return (
                <li key={c.contactId}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.contactId)}
                    className={cn(
                      'group relative flex w-full items-start gap-3 px-3 py-3 text-left transition-colors',
                      active ? 'bg-primary/10' : 'hover:bg-muted/40',
                    )}
                  >
                    {/* active left accent */}
                    {active && (
                      <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <Avatar name={c.name} phone={c.phone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {timeAgo(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {previewPrefix}
                          {c.lastMessage || '—'}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {c.humanMode && (
                            <Badge className="border-amber-500/30 bg-amber-500/15 px-1 py-0 text-[9px] font-semibold text-amber-300">
                              Human
                            </Badge>
                          )}
                          {c.pinned && <Pin className="h-3 w-3 text-muted-foreground" />}
                          {c.unread > 0 && (
                            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                              {c.unread > 99 ? '99+' : c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{c.phone}</span>
                        {c.leadScore >= 25 && <LeadBadge score={c.leadScore} className="text-[9px]" />}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// ChatWindow — center pane
// ------------------------------------------------------------
interface ChatWindowProps {
  contact: ChatListItem | null
  messages: ChatMessage[]
  loadingMessages: boolean
  waState: WhatsAppState
  onBack: () => void
  onOpenDetails: () => void
  onSend: (text: string) => Promise<void>
  sending: boolean
}

function ChatWindow({
  contact,
  messages,
  loadingMessages,
  waState,
  onBack,
  onOpenDetails,
  onSend,
  sending,
}: ChatWindowProps) {
  const [text, setText] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, contact?.contactId])

  // Auto-grow the textarea up to ~4 lines
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  if (!contact) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-muted/60 text-muted-foreground">
          <MessageCircle className="h-8 w-8" />
        </div>
        <div>
          <div className="text-base font-semibold">Select a conversation</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Pick a chat from the list to view messages and details.
          </div>
        </div>
      </div>
    )
  }

  const grouped = groupByDay(messages)
  const aiActive = !contact.humanMode
  const waConnected = waState === 'connected'

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setText('')
    await onSend(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const statusLine = contact.humanMode
    ? 'Human mode active — AI paused'
    : waConnected
      ? 'AI auto-reply is handling this chat'
      : 'AI auto-reply is handling this chat (simulated)'

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 border-b p-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onBack}
          aria-label="Back to list"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar name={contact.name} phone={contact.phone} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{contact.name}</span>
            {contact.leadScore >= 25 && <LeadBadge score={contact.leadScore} />}
            {contact.humanMode && (
              <Badge className="border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-300">
                Human
              </Badge>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{statusLine}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenDetails}
          aria-label="View details"
        >
          <Info className="h-5 w-5" />
        </Button>
      </header>

      {/* Status banner */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium',
          contact.humanMode
            ? 'bg-amber-500/15 text-amber-300'
            : 'bg-emerald-500/10 text-emerald-300',
        )}
      >
        {contact.humanMode ? <UserCog className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        <span>
          {contact.humanMode
            ? 'Human mode — AI paused. You reply manually.'
            : 'AI auto-reply is ON. Take over to reply manually.'}
        </span>
      </div>
      {!waConnected && (
        <div className="flex items-center gap-2 bg-zinc-500/10 px-3 py-1.5 text-[11px] font-medium text-zinc-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>WhatsApp not connected — messages are simulated.</span>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin bg-background px-3 py-4"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="relative mx-auto flex max-w-3xl flex-col gap-2">
          {loadingMessages && messages.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageCircle className="h-6 w-6" />
              <span className="text-xs">No messages yet. Say hello!</span>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.day} className="flex flex-col gap-2">
                <DateSeparator day={group.day} />
                {group.items.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t bg-background/95 p-3 backdrop-blur">
        {aiActive && (
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>AI is handling this conversation. Take over to reply manually.</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiActive ? 'Type to take over & send…' : 'Type a message…'}
            className="min-h-10 max-h-30 resize-none text-sm"
            rows={1}
            aria-label="Message composer"
          />
          <Button
            onClick={handleSubmit}
            disabled={!text.trim() || sending}
            className={cn(
              'h-10 shrink-0 gap-1.5 px-3',
              aiActive
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700',
            )}
            aria-label={aiActive ? 'Take over and send' : 'Send message'}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="hidden text-xs font-semibold sm:inline">
              {aiActive ? 'Take over & send' : 'Send'}
            </span>
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Enter to send · Shift+Enter for newline</span>
          <span className="tabular-nums">{text.length}/4000</span>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// DetailsPanel — right pane (also rendered inside the mobile Sheet)
// ------------------------------------------------------------
interface DetailsPanelProps {
  detail: ContactDetail | null
  loading: boolean
  waConnected: boolean
  pinned: boolean
  onToggleHumanMode: (enabled: boolean) => Promise<void>
  onPin: (pinned: boolean) => Promise<void>
  onStatusChange: (status: ContactStatus) => Promise<void>
  onNotesSave: (notes: string) => Promise<void>
}

function DetailsPanel({
  detail,
  loading,
  pinned,
  onToggleHumanMode,
  onPin,
  onStatusChange,
  onNotesSave,
}: DetailsPanelProps) {
  const [notesDraft, setNotesDraft] = React.useState('')
  const [savingNotes, setSavingNotes] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)

  // Keep a local draft synced with server-loaded notes
  React.useEffect(() => {
    setNotesDraft(detail?.notes ?? '')
  }, [detail?.id, detail?.notes])

  if (loading && !detail) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <User className="h-8 w-8" />
        <span className="text-xs">Select a conversation to see customer details.</span>
      </div>
    )
  }

  const scoreColor =
    detail.leadScore >= 70
      ? 'bg-emerald-500'
      : detail.leadScore >= 50
        ? 'bg-amber-500'
        : detail.leadScore >= 25
          ? 'bg-orange-500'
          : 'bg-muted-foreground/40'

  const run = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key)
    try {
      await fn()
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center gap-3">
          <Avatar name={detail.name} phone={detail.phone} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{detail.name}</div>
            <div className="truncate text-xs text-muted-foreground">{detail.phone}</div>
            <Badge
              variant="outline"
              className={cn(
                'mt-1 px-1.5 py-0 text-[10px] font-medium capitalize',
                STATUS_BADGE[detail.status],
              )}
            >
              {detail.status}
            </Badge>
          </div>
        </div>
        {detail.summary && (
          <p className="mt-3 rounded-lg bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
            {detail.summary}
          </p>
        )}
      </div>

      {/* Status section */}
      <Section icon={<UserCog className="h-3.5 w-3.5" />} title="Status">
        <div className="flex items-center justify-between rounded-md border bg-background/40 px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {detail.humanMode ? 'Human mode' : 'AI auto-reply'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {detail.humanMode ? 'AI paused · you reply' : 'AI handling replies'}
            </span>
          </div>
          <Switch
            checked={detail.humanMode}
            onCheckedChange={(v) => void run('human', () => onToggleHumanMode(v))}
            disabled={actionLoading === 'human'}
            aria-label="Toggle human mode"
          />
        </div>
        <Button
          variant={detail.humanMode ? 'default' : 'outline'}
          size="sm"
          className="mt-2 w-full gap-1.5"
          disabled={actionLoading === 'human'}
          onClick={() =>
            void run('human', () => onToggleHumanMode(!detail.humanMode))
          }
        >
          {actionLoading === 'human' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : detail.humanMode ? (
            <Bot className="h-3.5 w-3.5" />
          ) : (
            <UserCog className="h-3.5 w-3.5" />
          )}
          {detail.humanMode ? 'Resume AI' : 'Take over chat'}
        </Button>
      </Section>

      {/* Lead info */}
      <Section icon={<Flame className="h-3.5 w-3.5" />} title="Lead info">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Lead score</span>
          <LeadBadge score={detail.leadScore} />
        </div>
        <Progress
          value={detail.leadScore}
          className={cn('mt-1 h-1.5', scoreColor)}
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Detected service</span>
          <span className="text-right font-medium">{categoryLabel(detail.detectedService)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Language</span>
          <span className="font-medium">{detail.language || '—'}</span>
        </div>
      </Section>

      {/* Customer info */}
      <Section icon={<User className="h-3.5 w-3.5" />} title="Customer info">
        <InfoRow label="First seen" value={formatDateTime(detail.firstSeen)} />
        <InfoRow label="Last active" value={timeAgo(detail.lastSeen)} />
        <InfoRow
          label="Last message"
          value={detail.lastMessageAt ? timeAgo(detail.lastMessageAt) : '—'}
        />
        <InfoRow label="Status" value={detail.status} />
        <InfoRow label="Country code" value={detail.countryCode || '—'} />
      </Section>

      {/* AI Memory */}
      <Section icon={<Bot className="h-3.5 w-3.5" />} title="AI memory">
        {detail.memories.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
            No memory extracted yet. Send a message via the simulator to populate.
          </div>
        ) : (
          <dl className="overflow-hidden rounded-md border">
            {detail.memories.map((m, idx) => (
              <div
                key={m.key}
                className={cn(
                  'flex items-start gap-2 px-2.5 py-1.5',
                  idx % 2 === 0 ? 'bg-background/40' : 'bg-transparent',
                )}
              >
                <dt className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {memoryLabel(m.key)}
                </dt>
                <dd className="flex-1 break-words text-xs">{m.value || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {/* Notes */}
      <Section icon={<MoreVertical className="h-3.5 w-3.5" />} title="Notes">
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Add private notes about this customer…"
          className="min-h-16 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full gap-1.5"
          disabled={savingNotes || notesDraft === (detail.notes ?? '')}
          onClick={async () => {
            setSavingNotes(true)
            try {
              await onNotesSave(notesDraft)
            } finally {
              setSavingNotes(false)
            }
          }}
        >
          {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save notes
        </Button>
      </Section>

      {/* Actions */}
      <Section icon={<Shield className="h-3.5 w-3.5" />} title="Actions">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          disabled={actionLoading === 'pin'}
          onClick={() => void run('pin', () => onPin(!pinned))}
        >
          {actionLoading === 'pin' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
          {pinned ? 'Unpin conversation' : 'Pin conversation'}
        </Button>
        {detail.status !== 'customer' && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full gap-1.5"
            disabled={actionLoading === 'customer'}
            onClick={() => void run('customer', () => onStatusChange('customer'))}
          >
            {actionLoading === 'customer' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Mark as customer
          </Button>
        )}
        {detail.status !== 'blocked' ? (
          <Button
            variant="destructive"
            size="sm"
            className="mt-2 w-full gap-1.5"
            disabled={actionLoading === 'block'}
            onClick={() => void run('block', () => onStatusChange('blocked'))}
          >
            {actionLoading === 'block' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            Block contact
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full gap-1.5"
            disabled={actionLoading === 'unblock'}
            onClick={() => void run('unblock', () => onStatusChange('active'))}
          >
            {actionLoading === 'unblock' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
            Unblock contact
          </Button>
        )}
      </Section>
      <div className="mt-auto p-3 text-center text-[10px] text-muted-foreground">
        Contact ID: <span className="font-mono">{detail.id.slice(-8)}</span>
      </div>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b p-4">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  )
}

// ------------------------------------------------------------
// Main ChatsView
// ------------------------------------------------------------
export function ChatsView() {
  // --- Data state ---
  const [items, setItems] = React.useState<ChatListItem[]>([])
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [detail, setDetail] = React.useState<ContactDetail | null>(null)
  const [waState, setWaState] = React.useState<WhatsAppState>('disconnected')

  // --- UI state ---
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [mobilePane, setMobilePane] = React.useState<'list' | 'chat'>('list')
  const [detailsSheetOpen, setDetailsSheetOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [loadingChats, setLoadingChats] = React.useState(true)
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  // --- Debounced search (300ms) ---
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // --- Build query params for chats list ---
  const chatsQuery = React.useMemo(() => {
    const p = new URLSearchParams()
    if (debouncedSearch.trim()) p.set('search', debouncedSearch.trim())
    if (filter !== 'all') p.set('filter', filter)
    p.set('sort', 'recent')
    p.set('limit', '100')
    return p.toString()
  }, [debouncedSearch, filter])

  // --- Fetch chats list ---
  const fetchChats = React.useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoadingChats(true)
      try {
        const data = await apiGet<{ items: ChatListItem[] }>(`/api/chats?${chatsQuery}`)
        setItems(data.items ?? [])
      } catch {
        /* silent — polls will retry */
      } finally {
        setLoadingChats(false)
      }
    },
    [chatsQuery],
  )

  // --- Fetch WA state (cheap, polled less frequently) ---
  const fetchWaState = React.useCallback(async () => {
    try {
      const data = await apiGet<WaStateResponse>('/api/whatsapp')
      setWaState(data.state)
    } catch {
      /* non-fatal */
    }
  }, [])

  // --- Fetch messages for the selected contact ---
  const fetchMessages = React.useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!selectedId) {
        setMessages([])
        return
      }
      if (!opts.silent) setLoadingMessages(true)
      try {
        const data = await apiGet<{ items: ChatMessage[] }>(
          `/api/messages?contactId=${encodeURIComponent(selectedId)}&limit=200`,
        )
        setMessages(data.items ?? [])
      } catch {
        /* silent */
      } finally {
        setLoadingMessages(false)
      }
    },
    [selectedId],
  )

  // --- Fetch detail for the selected contact ---
  const fetchDetail = React.useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!selectedId) {
        setDetail(null)
        return
      }
      if (!opts.silent) setLoadingDetail(true)
      try {
        const data = await apiGet<ContactDetail>(
          `/api/contacts/${encodeURIComponent(selectedId)}`,
        )
        setDetail(data)
      } catch {
        /* silent */
      } finally {
        setLoadingDetail(false)
      }
    },
    [selectedId],
  )

  // --- Initial load + refetch on filter/search change ---
  React.useEffect(() => {
    void fetchChats()
  }, [fetchChats])

  // --- Initial WA state fetch ---
  React.useEffect(() => {
    void fetchWaState()
  }, [fetchWaState])

  // --- Auto-select first conversation on first load ---
  const autoSelected = React.useRef(false)
  React.useEffect(() => {
    if (autoSelected.current) return
    if (items.length > 0 && !selectedId) {
      autoSelected.current = true
      setSelectedId(items[0].contactId)
    }
  }, [items, selectedId])

  // --- Fetch messages + detail when selection changes ---
  React.useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setDetail(null)
      return
    }
    void fetchMessages()
    void fetchDetail()
    setMobilePane('chat')
  }, [selectedId, fetchMessages, fetchDetail])

  // --- Polling: chats every 8s, messages every 4s ---
  React.useEffect(() => {
    const t = setInterval(() => {
      void fetchChats({ silent: true })
    }, 8000)
    return () => clearInterval(t)
  }, [fetchChats])

  React.useEffect(() => {
    if (!selectedId) return
    const t = setInterval(() => {
      void fetchMessages({ silent: true })
    }, 4000)
    return () => clearInterval(t)
  }, [selectedId, fetchMessages])

  // --- WA state poll every 30s (cheap, slow-changing) ---
  React.useEffect(() => {
    const t = setInterval(() => {
      void fetchWaState()
    }, 30000)
    return () => clearInterval(t)
  }, [fetchWaState])

  // --- Realtime: refresh on dashboard tick + simulator message ---
  const refreshOnTick = React.useCallback(() => {
    void fetchChats({ silent: true })
    if (selectedId) void fetchMessages({ silent: true })
  }, [fetchChats, fetchMessages, selectedId])

  const onSimulatorMessage = React.useCallback(
    (payload: unknown) => {
      const p = (payload ?? {}) as { contactId?: string }
      void fetchChats({ silent: true })
      if (p.contactId && p.contactId === selectedId) {
        void fetchMessages({ silent: true })
        void fetchDetail({ silent: true })
      }
    },
    [fetchChats, fetchMessages, fetchDetail, selectedId],
  )

  useRealtime([
    { event: 'dashboard:tick', handler: refreshOnTick },
    { event: 'simulator:message', handler: onSimulatorMessage },
  ])

  // --- Handlers ---
  const selectedContact = React.useMemo(
    () => items.find((c) => c.contactId === selectedId) ?? null,
    [items, selectedId],
  )

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setMobilePane('chat')
  }

  const handleBack = () => setMobilePane('list')

  const handleSend = async (text: string) => {
    if (!selectedId) return
    setSending(true)
    try {
      // If AI is still active, take over first so the manual send makes sense.
      const current = items.find((c) => c.contactId === selectedId)
      if (current && !current.humanMode) {
        try {
          await apiPost<HumanModeResponse>(
            `/api/contacts/${encodeURIComponent(selectedId)}/human-mode`,
            { enabled: true },
          )
          // Optimistically reflect the toggle
          setItems((prev) =>
            prev.map((c) => (c.contactId === selectedId ? { ...c, humanMode: true } : c)),
          )
          setDetail((d) => (d && d.id === selectedId ? { ...d, humanMode: true } : d))
          toast.success('Human mode enabled', {
            description: 'AI auto-reply is paused for this chat.',
          })
        } catch (err) {
          toast.error('Failed to take over chat', {
            description: err instanceof Error ? err.message : undefined,
          })
          setSending(false)
          return
        }
      }

      // Send the manual message
      const res = await apiPost<SendMessageResponse>('/api/messages', {
        contactId: selectedId,
        text,
      })
      setMessages((prev) => [...prev, res.message])
      // Refresh the chats list so the last-message preview updates
      void fetchChats({ silent: true })
      void fetchDetail({ silent: true })
      toast.success('Message sent')
    } catch (err) {
      toast.error('Failed to send message', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSending(false)
    }
  }

  const handleToggleHumanMode = async (enabled: boolean) => {
    if (!selectedId) return
    try {
      await apiPost<HumanModeResponse>(
        `/api/contacts/${encodeURIComponent(selectedId)}/human-mode`,
        { enabled },
      )
      setItems((prev) =>
        prev.map((c) => (c.contactId === selectedId ? { ...c, humanMode: enabled } : c)),
      )
      setDetail((d) => (d && d.id === selectedId ? { ...d, humanMode: enabled } : d))
      toast.success(enabled ? 'Human mode enabled' : 'AI auto-reply resumed')
    } catch (err) {
      toast.error('Failed to toggle human mode', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handlePin = async (pinned: boolean) => {
    if (!selectedId) return
    try {
      await apiPatch<ContactDetail>(
        `/api/contacts/${encodeURIComponent(selectedId)}`,
        { pinned },
      )
      // ContactDetail doesn't carry pinned, so update items list locally
      // and refetch the chats list to re-sort (pinned float to top).
      setItems((prev) =>
        prev.map((c) => (c.contactId === selectedId ? { ...c, pinned } : c)),
      )
      void fetchChats({ silent: true })
      toast.success(pinned ? 'Conversation pinned' : 'Conversation unpinned')
    } catch (err) {
      toast.error('Failed to update pin', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleStatusChange = async (status: ContactStatus) => {
    if (!selectedId) return
    try {
      const updated = await apiPatch<ContactDetail>(
        `/api/contacts/${encodeURIComponent(selectedId)}`,
        { status },
      )
      setDetail(updated)
      setItems((prev) =>
        prev.map((c) => (c.contactId === selectedId ? { ...c, status: updated.status } : c)),
      )
      if (status === 'blocked') {
        toast.warning('Contact blocked')
      } else if (status === 'customer') {
        toast.success('Marked as customer')
      } else {
        toast.success(`Status updated: ${status}`)
      }
    } catch (err) {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleNotesSave = async (notes: string) => {
    if (!selectedId) return
    try {
      const updated = await apiPatch<ContactDetail>(
        `/api/contacts/${encodeURIComponent(selectedId)}`,
        { notes },
      )
      setDetail(updated)
      toast.success('Notes saved')
    } catch (err) {
      toast.error('Failed to save notes', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  // --- Render ---
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border bg-card/30 backdrop-blur lg:grid lg:grid-cols-[320px_1fr_288px]">
        {/* LEFT — conversation list */}
        <aside
          className={cn(
            'min-h-0 flex flex-col border-r',
            mobilePane === 'chat' && 'hidden lg:flex',
          )}
        >
          <ConversationList
            items={items}
            loading={loadingChats}
            selectedId={selectedId}
            search={search}
            filter={filter}
            onSelect={handleSelect}
            onSearchChange={setSearch}
            onFilterChange={setFilter}
          />
        </aside>

        {/* CENTER — chat window */}
        <section
          className={cn(
            'min-h-0 flex flex-col',
            mobilePane === 'list' && 'hidden lg:flex',
          )}
        >
          <ChatWindow
            contact={selectedContact}
            messages={messages}
            loadingMessages={loadingMessages}
            waState={waState}
            onBack={handleBack}
            onOpenDetails={() => setDetailsSheetOpen(true)}
            onSend={handleSend}
            sending={sending}
          />
        </section>

        {/* RIGHT — details panel (desktop) */}
        <aside className="hidden min-h-0 flex-col border-l lg:flex">
          <DetailsPanel
            detail={detail}
            loading={loadingDetail}
            waConnected={waState === 'connected'}
            pinned={selectedContact?.pinned ?? false}
            onToggleHumanMode={handleToggleHumanMode}
            onPin={handlePin}
            onStatusChange={handleStatusChange}
            onNotesSave={handleNotesSave}
          />
        </aside>

        {/* MOBILE — details sheet */}
        <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
          <SheetContent side="right" className="w-full max-w-sm p-0 sm:max-w-md">
            <SheetHeader className="border-b">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-primary" />
                Customer details
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <DetailsPanel
                detail={detail}
                loading={loadingDetail}
                waConnected={waState === 'connected'}
                pinned={selectedContact?.pinned ?? false}
                onToggleHumanMode={async (v) => {
                  await handleToggleHumanMode(v)
                }}
                onPin={handlePin}
                onStatusChange={handleStatusChange}
                onNotesSave={handleNotesSave}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}

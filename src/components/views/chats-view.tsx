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
  Download,
  FileText,
  Braces,
  Copy,
  CornerUpLeft,
  ArrowDown,
  ExternalLink,
  Tag as TagIcon,
  Plus,
  Tags,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import {
  colorFromString,
  initials,
  timeAgo,
  formatTime,
  formatDateTime,
  downloadFile,
  tagColor,
} from '@/lib/format'
import { useRealtime } from '@/hooks/use-realtime'
import { LeadBadge } from '@/components/status'
import type {
  ChatListItem,
  ChatMessage,
  ContactDetail,
  ContactStatus,
  MessageStatus,
  TagItem,
  TagWithCount,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  QuickReplyPicker,
  QuickReplySlashDropdown,
  showQuickReplyToast,
} from '@/components/quick-replies/quick-reply-picker'
import { QuickReplyManagerDialog } from '@/components/quick-replies/quick-reply-manager-dialog'
import {
  useQuickReplies,
  useSlashCommand,
} from '@/components/quick-replies/quick-reply-hooks'
import type { QuickReplyRow } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

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

/** Compact "Ns ago" / "just now" label for the AI replied badge. */
function aiRepliedAgoLabel(timestamp: string): string {
  const d = new Date(timestamp)
  const diff = Date.now() - d.getTime()
  if (diff < 5000) return 'just now'
  return timeAgo(timestamp)
}

/** True when an AI message is recent enough to show a live pulse on the icon. */
function isAiMessageRecent(timestamp: string): boolean {
  return Date.now() - new Date(timestamp).getTime() < 8000
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

// ------------------------------------------------------------
// Tag badges & picker
// ------------------------------------------------------------
const MAX_TAG_BADGES = 2

/** A single small colored pill for a tag. */
function TagPill({
  tag,
  onRemove,
  size = 'sm',
}: {
  tag: TagItem
  onRemove?: () => void
  size?: 'sm' | 'md'
}) {
  const c = tagColor(tag.color)
  return (
    <span
      className={cn(
        'group/tag inline-flex items-center gap-1 rounded-md font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        c.bg,
        c.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden />
      <span className="truncate max-w-[120px]">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm opacity-0 transition-opacity hover:bg-foreground/15 group-hover/tag:opacity-100"
          aria-label={`Remove ${tag.name} tag`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}

/** Compact inline cluster: up to MAX_TAG_BADGES + "+N" overflow chip. */
function TagBadgeCluster({
  tags,
  onRemove,
  className,
}: {
  tags: TagItem[]
  onRemove?: (tagId: string) => void
  className?: string
}) {
  if (!tags || tags.length === 0) return null
  const visible = tags.slice(0, MAX_TAG_BADGES)
  const overflow = tags.length - visible.length
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map((t) => (
        <TagPill key={t.id} tag={t} onRemove={onRemove ? () => onRemove(t.id) : undefined} />
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{overflow}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {tags.slice(MAX_TAG_BADGES).map((t) => t.name).join(', ')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** Popover that lets the user search existing tags + create a new one. */
function TagPicker({
  open,
  onOpenChange,
  allTags,
  currentTagIds,
  onAddExisting,
  onCreate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  allTags: TagWithCount[]
  currentTagIds: Set<string>
  onAddExisting: (tagId: string) => Promise<void> | void
  onCreate: (name: string) => Promise<void> | void
}) {
  const [query, setQuery] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [addingId, setAddingId] = React.useState<string | null>(null)

  // Reset the search field each time the popover opens.
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setCreating(false)
      setAddingId(null)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = React.useMemo(
    () =>
      allTags.filter((t) => (q ? t.name.toLowerCase().includes(q) : true)),
    [allTags, q],
  )

  // Show a "create" option when the user typed something that doesn't match
  // an existing tag exactly (case-insensitive).
  const trimmedQuery = query.trim()
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === trimmedQuery.toLowerCase(),
  )
  const canCreate = trimmedQuery.length > 0 && !exactMatch

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    try {
      await onCreate(trimmedQuery)
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }

  const handlePick = async (tagId: string) => {
    setAddingId(tagId)
    try {
      await onAddExisting(tagId)
      onOpenChange(false)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          aria-label="Add tag"
        >
          <Plus className="h-3.5 w-3.5" />
          Add tag
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or create tag…"
              className="h-8 pl-7 pr-7 text-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
          {filtered.length === 0 && !canCreate ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No tags found.
            </div>
          ) : (
            filtered.map((t) => {
              const c = tagColor(t.color)
              const active = currentTagIds.has(t.id)
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => void handlePick(t.id)}
                  disabled={active || addingId === t.id}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'cursor-default opacity-50'
                      : 'hover:bg-muted',
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', c.dot)} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {active ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : addingId === t.id ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {t.contactCount}
                    </span>
                  )}
                </button>
              )
            })
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed bg-background/40 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
              ) : (
                <Plus className="h-3 w-3 text-emerald-400" />
              )}
              <span className="flex-1">
                Create tag <span className="font-semibold">“{trimmedQuery}”</span>
              </span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MessageBubble({
  message,
  onReply,
}: {
  message: ChatMessage
  onReply?: (text: string) => void
}) {
  const isOutgoing = message.direction === 'outgoing'
  const isAi = message.source === 'ai'
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be unavailable in insecure contexts — ignore */
    }
  }

  return (
    <div className={cn('group relative flex w-full', isOutgoing ? 'justify-end' : 'justify-start')}>
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
        {/* AI "replied Ns ago" subtle sublabel */}
        {isAi && (
          <div className="mt-0.5 flex items-center justify-end">
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/70">
              <Bot
                className={cn(
                  'h-2.5 w-2.5',
                  isAiMessageRecent(message.timestamp) && 'animate-pulse',
                )}
              />
              AI · {aiRepliedAgoLabel(message.timestamp)}
            </span>
          </div>
        )}
      </div>
      {/* Hover actions: copy + reply (incoming only) */}
      <div
        className={cn(
          'pointer-events-none absolute top-0 flex items-center gap-0.5 rounded-md border bg-card/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:pointer-events-auto group-hover:opacity-100',
          isOutgoing ? 'right-0' : 'left-0',
        )}
      >
        <button
          type="button"
          onClick={handleCopy}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Copy message text"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
        {!isOutgoing && (
          <button
            type="button"
            onClick={() => onReply?.(message.text)}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Quote message in reply"
          >
            <CornerUpLeft className="h-3 w-3" />
          </button>
        )}
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
  tagFilter: string
  allTags: TagWithCount[]
  totalUnread: number
  markingAllRead: boolean
  onSelect: (id: string) => void
  onSearchChange: (v: string) => void
  onFilterChange: (v: FilterKey) => void
  onTagFilterChange: (tag: string) => void
  onMarkAllRead: () => void
}

function ConversationList({
  items,
  loading,
  selectedId,
  search,
  filter,
  tagFilter,
  allTags,
  totalUnread,
  markingAllRead,
  onSelect,
  onSearchChange,
  onFilterChange,
  onTagFilterChange,
  onMarkAllRead,
}: ConversationListProps) {
  const [tagFilterOpen, setTagFilterOpen] = React.useState(false)
  const activeTag = React.useMemo(
    () => (tagFilter ? allTags.find((t) => t.name === tagFilter) ?? null : null),
    [tagFilter, allTags],
  )

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
        {/* Filter + Tag filter + Mark all read */}
        <div className="mt-2 flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => onFilterChange(v as FilterKey)}>
            <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
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
          {/* Tag filter popover */}
          <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant={tagFilter ? 'default' : 'outline'}
                    size="icon"
                    className={cn(
                      'h-8 w-8 shrink-0',
                      tagFilter &&
                        'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700',
                    )}
                    aria-label="Filter by tag"
                  >
                    <TagIcon className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Filter by tag</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 p-0">
              <div className="border-b px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Filter by tag
              </div>
              <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
                {allTags.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No tags yet.
                  </div>
                ) : (
                  allTags.map((t) => {
                    const c = tagColor(t.color)
                    const isActive = tagFilter === t.name
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => {
                          onTagFilterChange(isActive ? '' : t.name)
                          setTagFilterOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                          isActive && 'bg-muted',
                        )}
                      >
                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', c.dot)} />
                        <span className="flex-1 truncate">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {t.contactCount}
                        </span>
                        {isActive && <Check className="h-3 w-3 text-emerald-400" />}
                      </button>
                    )
                  })
                )}
                {tagFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      onTagFilterChange('')
                      setTagFilterOpen(false)
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed bg-background/40 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                    Clear tag filter
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {totalUnread > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={onMarkAllRead}
                  disabled={markingAllRead}
                  aria-label="Mark all conversations as read"
                >
                  {markingAllRead ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Mark all read</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Active tag filter banner */}
      {activeTag && (
        <div className="flex items-center justify-between gap-2 border-b bg-primary/5 px-3 py-1.5 text-[11px]">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
            <Tags className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">Tagged:</span>
            <TagPill tag={activeTag} />
          </span>
          <button
            type="button"
            onClick={() => onTagFilterChange('')}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear tag filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Unread banner */}
      {totalUnread > 0 && (
        <div className="flex items-center justify-between gap-2 border-b bg-emerald-500/5 px-3 py-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 font-medium text-emerald-300">
            <Bell className="h-3 w-3" />
            {totalUnread} unread conversation{totalUnread === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={markingAllRead}
            className="font-semibold text-emerald-300 transition-colors hover:text-emerald-200 disabled:opacity-50"
          >
            {markingAllRead ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
      )}

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
              <div className="text-sm font-medium">
                {tagFilter ? `No conversations tagged “${tagFilter}”` : 'No conversations yet'}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {tagFilter
                  ? 'Try a different tag or clear the filter.'
                  : 'Use the Simulator to test the AI.'}
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
                      {/* Tag badges (up to 2 + "+N") */}
                      {c.tags.length > 0 && (
                        <TagBadgeCluster tags={c.tags} className="mt-1.5" />
                      )}
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
  const [exporting, setExporting] = React.useState(false)
  const [showScrollButton, setShowScrollButton] = React.useState(false)
  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const [scheduleAt, setScheduleAt] = React.useState('')
  const [scheduling, setScheduling] = React.useState(false)
  const [qrManagerOpen, setQrManagerOpen] = React.useState(false)
  const [cursor, setCursor] = React.useState(0)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const pinnedToBottomRef = React.useRef(true)

  // Quick replies: shared between the Zap popover, the slash-command
  // dropdown, and the manager dialog.
  const qr = useQuickReplies()
  const slash = useSlashCommand({
    text,
    cursor,
    items: qr.items,
  })

  // Auto-scroll: always jump to bottom when switching contacts; only follow
  // new messages when the user hasn't scrolled up to read history.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    pinnedToBottomRef.current = true
    setShowScrollButton(false)
  }, [contact?.contactId])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Auto-grow the textarea up to ~4 lines
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 80
    pinnedToBottomRef.current = atBottom
    setShowScrollButton(!atBottom && messages.length > 0)
  }

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    pinnedToBottomRef.current = true
    setShowScrollButton(false)
  }

  const handleExport = async (format: 'csv' | 'json') => {
    if (!contact) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/messages/export?contactId=${encodeURIComponent(contact.contactId)}&format=${format}`,
        { credentials: 'same-origin' },
      )
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`)
      }
      const content = await res.text()
      const safeName =
        (contact.name || contact.phone)
          .trim()
          .replace(/[^a-zA-Z0-9-_]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'conversation'
      const ext = format === 'csv' ? 'csv' : 'json'
      const mime =
        format === 'csv'
          ? 'text/csv;charset=utf-8'
          : 'application/json;charset=utf-8'
      downloadFile(`chat-${safeName}.${ext}`, content, mime)
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (err) {
      toast.error('Failed to export conversation', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setExporting(false)
    }
  }

  // Quote-reply: insert `> {line}` for each line of the quoted message
  // so it reads as a markdown block-quote prefix in the composer.
  const handleReply = (quotedText: string) => {
    const prefix = quotedText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    setText((prev) => {
      const merged = prev && !prev.endsWith('\n') ? prev + '\n' : prev
      return `${merged}${prefix}\n`
    })
    textareaRef.current?.focus()
  }

  // --- Quick reply insertion ---
  // Insert a quick reply body into the composer. When the textarea is empty
  // the body replaces it; otherwise the body is appended after a separating
  // newline so multi-line snippets stay readable.
  const insertQuickReply = (reply: QuickReplyRow) => {
    setText((prev) => {
      const trimmed = prev.replace(/\s+$/, '')
      if (!trimmed) return reply.body
      return `${trimmed}\n${reply.body}`
    })
    // Place cursor at the end after insertion.
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      const end = ta.value.length
      ta.focus()
      ta.setSelectionRange(end, end)
      setCursor(end)
    })
    void qr.bumpUsage(reply.id)
    showQuickReplyToast(reply)
  }

  // Insert from slash-command dropdown: replaces the `/partial` token at the
  // cursor with the chosen reply's body.
  const insertSlashReply = (reply: QuickReplyRow) => {
    const det = slash.detection
    if (!det) return
    const before = text.slice(0, det.start)
    const after = text.slice(det.end)
    const next = `${before}${reply.body}${after}`
    setText(next)
    const newCursor = det.start + reply.body.length
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
      setCursor(newCursor)
    })
    slash.reset()
    void qr.bumpUsage(reply.id)
    showQuickReplyToast(reply)
  }

  // Composer change handler — keep cursor in sync so the slash dropdown
  // updates as the user types or moves the caret.
  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    setCursor(e.target.selectionStart)
  }
  const handleComposerSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    setCursor(ta.selectionStart)
  }

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
    // Slash-command dropdown navigation (only when matches are visible).
    if (slash.matches.length > 0 && slash.detection) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        slash.setActiveIndex(
          (slash.activeIndex + 1) % slash.matches.length,
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        slash.setActiveIndex(
          (slash.activeIndex - 1 + slash.matches.length) % slash.matches.length,
        )
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const picked = slash.matches[slash.activeIndex]
        if (picked) insertSlashReply(picked)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        slash.reset()
        // Collapse detection by moving the cursor out of the slash token.
        const ta = textareaRef.current
        if (ta) {
          const end = ta.value.length
          ta.setSelectionRange(end, end)
          setCursor(end)
        }
        return
      }
      if (e.key === 'Tab') {
        // Tab also selects the active match (handy on mobile keyboards
        // where Enter is reserved by the send shortcut).
        e.preventDefault()
        const picked = slash.matches[slash.activeIndex]
        if (picked) insertSlashReply(picked)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  // --- Schedule dialog helpers ---
  const openSchedule = () => {
    if (!text.trim() || !contact) return
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date(Date.now() + 60 * 60 * 1000)
    setScheduleAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    )
    setScheduleOpen(true)
  }

  const handleScheduleSubmit = async () => {
    if (!contact || !text.trim() || !scheduleAt) return
    setScheduling(true)
    try {
      await apiPost<{ item: { id: string } }>(
        '/api/scheduled',
        {
          contactId: contact.contactId,
          text: text.trim(),
          scheduledAt: new Date(scheduleAt).toISOString(),
        },
      )
      toast.success('Message scheduled', {
        description: `Will be sent to ${contact.name} at ${new Date(scheduleAt).toLocaleString()}`,
      })
      setScheduleOpen(false)
    } catch (err) {
      toast.error('Failed to schedule message', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setScheduling(false)
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
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{contact.name}</span>
            {contact.leadScore >= 25 && <LeadBadge score={contact.leadScore} />}
            {contact.humanMode && (
              <Badge className="border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-300">
                Human
              </Badge>
            )}
            {contact.tags.length > 0 && <TagBadgeCluster tags={contact.tags} />}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{statusLine}</div>
        </div>
        {/* Export conversation */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={exporting || messages.length === 0}
              aria-label="Export conversation"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => void handleExport('csv')}
              className="gap-2 text-xs"
            >
              <FileText className="h-3.5 w-3.5" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleExport('json')}
              className="gap-2 text-xs"
            >
              <Braces className="h-3.5 w-3.5" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative h-full overflow-y-auto scrollbar-thin bg-background px-3 py-4"
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
                    <MessageBubble key={m.id} message={m} onReply={handleReply} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
        {/* Scroll-to-bottom floating button */}
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-4 right-4 grid h-9 w-9 place-items-center rounded-full border bg-card shadow-lg transition-opacity hover:bg-muted',
            showScrollButton
              ? 'opacity-100'
              : 'pointer-events-none opacity-0',
          )}
          aria-label="Scroll to latest message"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>

      {/* Composer */}
      <div className="border-t bg-background/95 p-3 backdrop-blur">
        {aiActive && (
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>AI is handling this conversation. Take over to reply manually.</span>
          </div>
        )}
        <div className="relative flex items-end gap-2">
          <QuickReplySlashDropdown
            matches={slash.matches}
            activeIndex={slash.activeIndex}
            detection={slash.detection}
            onSelect={insertSlashReply}
            onHover={slash.setActiveIndex}
          />
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleComposerChange}
            onKeyUp={handleComposerSelect}
            onClick={handleComposerSelect}
            onSelect={handleComposerSelect}
            onKeyDown={handleKeyDown}
            placeholder={aiActive ? 'Type to take over & send… · / for quick replies' : 'Type a message… · / for quick replies'}
            className="min-h-10 max-h-30 resize-none text-sm"
            rows={1}
            aria-label="Message composer"
          />
          <QuickReplyPicker
            items={qr.items}
            loading={qr.loading}
            onPick={insertQuickReply}
            onManage={() => setQrManagerOpen(true)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                onClick={openSchedule}
                disabled={!text.trim() || !contact}
                aria-label="Schedule message"
              >
                <Clock className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Schedule this message for later</TooltipContent>
          </Tooltip>
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

      {/* Schedule-message dialog (composed from current composer text) */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-emerald-400" />
              Schedule message
            </DialogTitle>
            <DialogDescription>
              Send this message to {contact?.name} at a future time.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-foreground/80">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Message preview
              </div>
              <p className="whitespace-pre-wrap break-words">{text.trim()}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chat-sched-at" className="text-xs">
                Send at
              </Label>
              <Input
                id="chat-sched-at"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="bg-background text-sm [color-scheme:dark]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setScheduleOpen(false)}
              disabled={scheduling}
            >
              Cancel
            </Button>
            <Button
              onClick={handleScheduleSubmit}
              disabled={scheduling || !scheduleAt || !text.trim()}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
            >
              {scheduling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Reply manager dialog — opened from the Zap popover */}
      <QuickReplyManagerDialog
        open={qrManagerOpen}
        onOpenChange={setQrManagerOpen}
        items={qr.items}
        loading={qr.loading}
        onCreate={qr.createReply}
        onUpdate={qr.updateReply}
        onDelete={qr.deleteReply}
      />
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
  allTags: TagWithCount[]
  onToggleHumanMode: (enabled: boolean) => Promise<void>
  onPin: (pinned: boolean) => Promise<void>
  onStatusChange: (status: ContactStatus) => Promise<void>
  onNotesSave: (notes: string) => Promise<void>
  onAddTag: (tagId: string) => Promise<void>
  onCreateTag: (name: string) => Promise<void>
  onRemoveTag: (tagId: string) => Promise<void>
  onViewProfile?: (contactId: string) => void
}

function DetailsPanel({
  detail,
  loading,
  pinned,
  allTags,
  onToggleHumanMode,
  onPin,
  onStatusChange,
  onNotesSave,
  onAddTag,
  onCreateTag,
  onRemoveTag,
  onViewProfile,
}: DetailsPanelProps) {
  const [notesDraft, setNotesDraft] = React.useState('')
  const [savingNotes, setSavingNotes] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const [tagPickerOpen, setTagPickerOpen] = React.useState(false)
  const [removingTagId, setRemovingTagId] = React.useState<string | null>(null)

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

  const handleRemoveTag = async (tagId: string) => {
    setRemovingTagId(tagId)
    try {
      await onRemoveTag(tagId)
    } finally {
      setRemovingTagId(null)
    }
  }

  const currentTagIds = new Set(detail.tags.map((t) => t.id))

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
        {onViewProfile && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100"
            onClick={() => onViewProfile(detail.id)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Full Profile
          </Button>
        )}
        {detail.summary && (
          <p className="mt-3 rounded-lg bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
            {detail.summary}
          </p>
        )}
      </div>

      {/* Tags section */}
      <Section icon={<Tags className="h-3.5 w-3.5" />} title="Tags">
        {detail.tags.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
            No tags yet. Use “Add tag” to organize this conversation.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.tags.map((t) => (
              <TagPill
                key={t.id}
                tag={t}
                onRemove={
                  removingTagId === t.id ? undefined : () => void handleRemoveTag(t.id)
                }
              />
            ))}
          </div>
        )}
        <div className="mt-2">
          <TagPicker
            open={tagPickerOpen}
            onOpenChange={setTagPickerOpen}
            allTags={allTags}
            currentTagIds={currentTagIds}
            onAddExisting={onAddTag}
            onCreate={onCreateTag}
          />
        </div>
      </Section>

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
export function ChatsView({ onViewProfile }: { onViewProfile?: (contactId: string) => void } ) {
  // --- Data state ---
  const [items, setItems] = React.useState<ChatListItem[]>([])
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [detail, setDetail] = React.useState<ContactDetail | null>(null)
  const [waState, setWaState] = React.useState<WhatsAppState>('disconnected')
  const [allTags, setAllTags] = React.useState<TagWithCount[]>([])

  // --- UI state ---
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [mobilePane, setMobilePane] = React.useState<'list' | 'chat'>('list')
  const [detailsSheetOpen, setDetailsSheetOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [tagFilter, setTagFilter] = React.useState('')
  const [loadingChats, setLoadingChats] = React.useState(true)
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [markingAllRead, setMarkingAllRead] = React.useState(false)

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
    if (tagFilter.trim()) p.set('tag', tagFilter.trim())
    p.set('sort', 'recent')
    p.set('limit', '100')
    return p.toString()
  }, [debouncedSearch, filter, tagFilter])

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

  // --- Fetch the full tag list (with contact counts) for the picker / filter ---
  const fetchAllTags = React.useCallback(async () => {
    try {
      const data = await apiGet<{ items: TagWithCount[] }>('/api/tags')
      setAllTags(data.items ?? [])
    } catch {
      /* non-fatal — picker just shows fewer options */
    }
  }, [])

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

  // --- Initial load + refetch on filter/search/tag change ---
  React.useEffect(() => {
    void fetchChats()
  }, [fetchChats])

  // --- Initial WA state fetch + tags list ---
  React.useEffect(() => {
    void fetchWaState()
    void fetchAllTags()
  }, [fetchWaState, fetchAllTags])

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

  const totalUnread = React.useMemo(
    () => items.filter((c) => c.unread > 0).length,
    [items],
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

  // --- Tag handlers ---
  // After any tag mutation we refresh three things in parallel:
  //   · the chats list (so tag badges in the list reflect the change)
  //   · the contact detail (so the right panel shows the new tag set)
  //   · the global allTags list (so contact counts in the picker stay fresh)
  const refreshAfterTagChange = React.useCallback(() => {
    void fetchChats({ silent: true })
    void fetchDetail({ silent: true })
    void fetchAllTags()
  }, [fetchChats, fetchDetail, fetchAllTags])

  const handleAddTag = React.useCallback(
    async (tagId: string) => {
      if (!selectedId) return
      try {
        const res = await apiPost<{ items: TagItem[] }>(
          `/api/contacts/${encodeURIComponent(selectedId)}/tags`,
          { tagId },
        )
        // Update the detail + the chats list optimistically from the response.
        setDetail((d) => (d && d.id === selectedId ? { ...d, tags: res.items } : d))
        setItems((prev) =>
          prev.map((c) =>
            c.contactId === selectedId ? { ...c, tags: res.items } : c,
          ),
        )
        const added = allTags.find((t) => t.id === tagId)
        toast.success(`Tag${added ? ` “${added.name}”` : ''} added`, {
          description: 'Conversation updated.',
        })
        refreshAfterTagChange()
      } catch (err) {
        toast.error('Failed to add tag', {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [selectedId, allTags, refreshAfterTagChange],
  )

  const handleCreateTag = React.useCallback(
    async (name: string) => {
      if (!selectedId) return
      try {
        const res = await apiPost<{ items: TagItem[] }>(
          `/api/contacts/${encodeURIComponent(selectedId)}/tags`,
          { name },
        )
        setDetail((d) => (d && d.id === selectedId ? { ...d, tags: res.items } : d))
        setItems((prev) =>
          prev.map((c) =>
            c.contactId === selectedId ? { ...c, tags: res.items } : c,
          ),
        )
        toast.success(`Tag “${name}” created`, {
          description: 'Added to this conversation.',
        })
        refreshAfterTagChange()
      } catch (err) {
        toast.error('Failed to create tag', {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [selectedId, refreshAfterTagChange],
  )

  const handleRemoveTag = React.useCallback(
    async (tagId: string) => {
      if (!selectedId) return
      try {
        await apiDelete<{ ok: boolean }>(
          `/api/contacts/${encodeURIComponent(selectedId)}/tags?tagId=${encodeURIComponent(tagId)}`,
        )
        // Optimistic update of detail + list
        setDetail((d) =>
          d && d.id === selectedId
            ? { ...d, tags: d.tags.filter((t) => t.id !== tagId) }
            : d,
        )
        setItems((prev) =>
          prev.map((c) =>
            c.contactId === selectedId
              ? { ...c, tags: c.tags.filter((t) => t.id !== tagId) }
              : c,
          ),
        )
        toast.success('Tag removed')
        refreshAfterTagChange()
      } catch (err) {
        toast.error('Failed to remove tag', {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    },
    [selectedId, refreshAfterTagChange],
  )

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true)
    try {
      const res = await apiPost<{ ok: boolean; updated: number }>(
        '/api/chats/mark-all-read',
      )
      // Optimistically clear unread counts on all visible conversations so
      // the list updates instantly (the next poll will confirm).
      setItems((prev) => prev.map((c) => (c.unread > 0 ? { ...c, unread: 0 } : c)))
      toast.success(
        `Marked ${res.updated} message${res.updated === 1 ? '' : 's'} as read`,
      )
    } catch (err) {
      toast.error('Failed to mark all as read', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setMarkingAllRead(false)
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
            tagFilter={tagFilter}
            allTags={allTags}
            totalUnread={totalUnread}
            markingAllRead={markingAllRead}
            onSelect={handleSelect}
            onSearchChange={setSearch}
            onFilterChange={setFilter}
            onTagFilterChange={setTagFilter}
            onMarkAllRead={() => void handleMarkAllRead()}
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
            allTags={allTags}
            onToggleHumanMode={handleToggleHumanMode}
            onPin={handlePin}
            onStatusChange={handleStatusChange}
            onNotesSave={handleNotesSave}
            onAddTag={handleAddTag}
            onCreateTag={handleCreateTag}
            onRemoveTag={handleRemoveTag}
            onViewProfile={onViewProfile}
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
                allTags={allTags}
                onToggleHumanMode={async (v) => {
                  await handleToggleHumanMode(v)
                }}
                onPin={handlePin}
                onStatusChange={handleStatusChange}
                onNotesSave={handleNotesSave}
                onAddTag={handleAddTag}
                onCreateTag={handleCreateTag}
                onRemoveTag={handleRemoveTag}
                onViewProfile={onViewProfile}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}

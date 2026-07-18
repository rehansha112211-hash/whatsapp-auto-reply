'use client'

// ============================================================
// ContactProfileView — deep-dive view for a single contact.
//
// Sections:
//   1. Header bar (avatar, name, phone, status, lead badge, quick actions)
//   2. Stats grid (4 cards: messages, AI vs owner, response time, duration)
//   3. Lead Score History (recharts line chart + events list + adjust dialog)
//   4. Tabs:
//        · Conversation — full read-only message timeline + export
//        · AI Memory — editable key/value list
//        · Activity Log — merged notifications + logs timeline
//        · Details — editable contact fields
//        · Statistics — per-contact conversation insights (charts + heatmap)
//   5. Danger Zone — pin/unpin + block/unblock
//
// All API access uses apiGet/apiPost/apiPatch/apiDelete.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft,
  MessageSquare,
  Bot,
  User,
  Clock,
  Brain,
  TrendingUp,
  Flame,
  Edit,
  Trash2,
  Plus,
  Save,
  Download,
  Ban,
  Pin,
  PinOff,
  Activity,
  History,
  Check,
  CheckCheck,
  AlertTriangle,
  Loader2,
  FileText,
  Braces,
  Inbox,
  ShieldAlert,
  Info,
  Bell,
  BarChart3,
  Zap,
  Calendar,
  Timer,
  Gauge,
  Smile,
  Meh,
  Frown,
  Heart,
  Globe,
  Languages,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { languageLabel } from '@/lib/translate-languages'
import {
  colorFromString,
  downloadFile,
  formatDateTime,
  formatTime,
  initials,
  leadBadge,
  timeAgo,
  toCsv,
} from '@/lib/format'
import { LeadBadge } from '@/components/status'
import type {
  ContactStatus,
  LogCategory,
  LogLevel,
  MessageSource,
  MessageStatus,
  ViewKey,
} from '@/lib/types'
import { LEAD_CATEGORIES } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

// ---------------------------------------------------------------------------
// API payload types (mirrors /api/contacts/[id]/profile)
// ---------------------------------------------------------------------------
interface ProfileContact {
  id: string
  name: string
  phone: string
  countryCode: string
  language: string
  status: string
  leadScore: number
  detectedService: string
  notes: string
  pinned: boolean
  humanMode: boolean
  firstSeen: string
  lastSeen: string
  lastMessageAt: string | null
  createdAt: string
}

interface ProfileMessage {
  id: string
  direction: string
  source: string
  text: string
  status: string
  read: boolean
  sentiment: string
  sentimentScore: number
  intent: string
  timestamp: string
  detectedLanguage?: string
  translatedText?: string
  isTranslated?: boolean
}

interface ProfileMemory {
  id: string
  key: string
  value: string
  updatedAt: string
}

interface ProfileLeadScore {
  id: string
  score: number
  category: string
  reason: string
  createdAt: string
}

interface ProfileNotification {
  id: string
  type: string
  title: string
  body: string
  severity: string
  createdAt: string
}

interface ProfileStats {
  totalMessages: number
  incomingCount: number
  outgoingCount: number
  aiCount: number
  ownerCount: number
  avgResponseMs: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  conversationDays: number
}

interface ProfilePayload {
  contact: ProfileContact
  messages: ProfileMessage[]
  memories: ProfileMemory[]
  leadScoreHistory: ProfileLeadScore[]
  stats: ProfileStats
  notifications: ProfileNotification[]
}

interface LogRow {
  id: string
  category: LogCategory
  level: LogLevel
  message: string
  meta: string
  contactId: string | null
  createdAt: string
}

interface LogsResponse {
  items: LogRow[]
  hasMore: boolean
}

// ---------------------------------------------------------------------------
// Stats payload (mirrors /api/contacts/[id]/stats)
// ---------------------------------------------------------------------------
interface StatsOverview {
  totalMessages: number
  incomingCount: number
  outgoingCount: number
  aiCount: number
  ownerCount: number
  customerInitiated: number
  avgResponseTimeMs: number
  avgCustomerResponseMs: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  conversationDuration: number
  messagesPerDay: number
  longestStreak: number
}

interface StatsTimelinePoint {
  date: string
  incoming: number
  outgoing: number
}

interface StatsHourlyBucket {
  hour: number
  count: number
}

interface StatsResponseTimePoint {
  replyMs: number
  timestamp: string
}

interface StatsDayOfWeekBucket {
  day: string
  count: number
}

interface StatsSourceBucket {
  source: string
  count: number
}

interface StatsConversationFlowPoint {
  direction: 'in' | 'out'
  gap_minutes: number
  timestamp: string
}

interface StatsPayload {
  overview: StatsOverview
  messageTimeline: StatsTimelinePoint[]
  hourlyHeatmap: StatsHourlyBucket[]
  responseTimes: StatsResponseTimePoint[]
  dayOfWeekDistribution: StatsDayOfWeekBucket[]
  sourceDistribution: StatsSourceBucket[]
  conversationFlow: StatsConversationFlowPoint[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CARD_CLS = 'rounded-xl border bg-card/60 backdrop-blur p-5 card-hover'

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

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hinglish', label: 'Hinglish' },
]

const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'customer', label: 'Customer' },
  { value: 'blocked', label: 'Blocked' },
]

const LEAD_SCORE_CONFIG: ChartConfig = {
  score: { label: 'Lead Score', color: '#10b981' }, // emerald-500
}

const HOT_LEAD_THRESHOLD = 70

// Stats-tab chart configs — WhatsApp-green theme (emerald/teal/sky).
const TIMELINE_CONFIG: ChartConfig = {
  incoming: { label: 'Incoming', color: '#10b981' }, // emerald-500
  outgoing: { label: 'Outgoing', color: '#14b8a6' }, // teal-500
}

const HOURLY_CONFIG: ChartConfig = {
  count: { label: 'Messages', color: '#10b981' },
}

const DOW_CONFIG: ChartConfig = {
  count: { label: 'Messages', color: '#14b8a6' },
}

const RESPONSE_TREND_CONFIG: ChartConfig = {
  replyMs: { label: 'AI reply time', color: '#10b981' },
}

const SOURCE_PIE_COLORS: Record<string, string> = {
  ai: '#10b981', // emerald-500
  owner: '#0ea5e9', // sky-500
  customer: '#a3a3a3', // zinc-400
}

const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

// ---------------------------------------------------------------------------
// Sentiment badge — small colored dot + emoji label used on the
// conversation timeline and the per-contact stats summary card.
// ---------------------------------------------------------------------------
type SentimentKey = 'positive' | 'neutral' | 'negative' | 'urgent' | 'unknown'

const SENTIMENT_META: Record<
  SentimentKey,
  { label: string; emoji: string; dot: string; chip: string; icon: React.ReactNode }
> = {
  positive: {
    label: 'Positive',
    emoji: '😊',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    icon: <Smile className="h-3 w-3" />,
  },
  neutral: {
    label: 'Neutral',
    emoji: '😐',
    dot: 'bg-zinc-400',
    chip: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
    icon: <Meh className="h-3 w-3" />,
  },
  negative: {
    label: 'Negative',
    emoji: '😟',
    dot: 'bg-rose-500',
    chip: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    icon: <Frown className="h-3 w-3" />,
  },
  urgent: {
    label: 'Urgent',
    emoji: '⚠️',
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  unknown: {
    label: '—',
    emoji: '·',
    dot: 'bg-muted-foreground',
    chip: 'bg-muted text-muted-foreground border-border',
    icon: <Info className="h-3 w-3" />,
  },
}

function sentimentMeta(s: string): { label: string; emoji: string; dot: string; chip: string; icon: React.ReactNode } {
  return SENTIMENT_META[s as SentimentKey] ?? SENTIMENT_META.unknown
}

/** Small inline sentiment pill (dot + emoji + label). */
function SentimentBadge({ sentiment }: { sentiment: string }) {
  const meta = sentimentMeta(sentiment)
  if (sentiment === 'unknown' || sentiment === '' || !sentiment) {
    return null
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        meta.chip,
      )}
      title={`Sentiment: ${meta.label}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatResponseTime(ms: number): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format a millisecond duration as a compact human string (e.g. "2m 13s", "1h 5m", "3d"). */
function formatDurationMs(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const totalMin = Math.round(totalSec / 60)
  if (totalMin < 60) return `${totalMin}m`
  const totalHr = Math.round(totalMin / 60)
  if (totalHr < 24) {
    const m = totalMin % 60
    return m === 0 ? `${totalHr}h` : `${totalHr}h ${m}m`
  }
  const days = Math.round(totalHr / 24)
  const h = totalHr % 24
  return h === 0 ? `${days}d` : `${days}d ${h}h`
}

/** Format an hour integer (0-23) as a 12-hour clock label like "3 PM". */
function formatHourLabel(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${ampm}`
}

function memoryLabel(key: string): string {
  return (
    MEMORY_KEY_LABELS[key] ??
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
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

function groupByDay(messages: ProfileMessage[]): { day: string; items: ProfileMessage[] }[] {
  const out: { day: string; items: ProfileMessage[] }[] = []
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

function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Small presentational components
// ---------------------------------------------------------------------------
function Avatar({ name, phone }: { name: string; phone: string }) {
  const cls = colorFromString(name || phone)
  return (
    <div
      className={cn(
        'grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-bold',
        cls,
      )}
      aria-hidden
    >
      {initials(name || phone)}
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 pb-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function DeliveryIcon({ status }: { status: MessageStatus }) {
  if (status === 'failed') {
    return <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
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

function SourceBadge({ source }: { source: MessageSource }) {
  if (source === 'customer') return null
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    ai: {
      label: 'AI',
      cls: 'bg-emerald-500/20 text-emerald-200',
      icon: <Bot className="h-3 w-3" />,
    },
    owner: {
      label: 'You',
      cls: 'bg-sky-500/20 text-sky-200',
      icon: <User className="h-3 w-3" />,
    },
    system: {
      label: 'System',
      cls: 'bg-zinc-500/20 text-zinc-200',
      icon: <Info className="h-3 w-3" />,
    },
  }
  const cfg = map[source]
  if (!cfg) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        cfg.cls,
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function SeverityIcon({ severity }: { severity: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    success: { icon: <Check className="h-3.5 w-3.5" />, cls: 'bg-emerald-500/20 text-emerald-300' },
    warning: { icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: 'bg-amber-500/20 text-amber-300' },
    error: { icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: 'bg-rose-500/20 text-rose-300' },
    info: { icon: <Info className="h-3.5 w-3.5" />, cls: 'bg-sky-500/20 text-sky-300' },
  }
  const cfg = map[severity] ?? map.info
  return (
    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full', cfg.cls)}>
      {cfg.icon}
    </span>
  )
}

function LogLevelDot({ level }: { level: LogLevel }) {
  const map: Record<LogLevel, string> = {
    info: 'bg-sky-400',
    warn: 'bg-amber-400',
    error: 'bg-rose-400',
    debug: 'bg-zinc-400',
  }
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', map[level])} />
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ContactProfileView({
  contactId,
  onBack,
  onNavigate,
}: {
  contactId: string
  onBack: () => void
  onNavigate?: (v: ViewKey) => void
}) {
  const [data, setData] = React.useState<ProfilePayload | null>(null)
  const [logs, setLogs] = React.useState<LogRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<string>('conversation')

  // ----- Load profile + logs -----
  const loadAll = React.useCallback(async () => {
    try {
      const [profile, logsResp] = await Promise.all([
        apiGet<ProfilePayload>(`/api/contacts/${contactId}/profile`),
        apiGet<LogsResponse>(`/api/logs?contactId=${encodeURIComponent(contactId)}&limit=200`),
      ])
      setData(profile)
      setLogs(logsResp.items)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load contact profile'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [contactId])

  React.useEffect(() => {
    setLoading(true)
    void loadAll()
  }, [loadAll])

  // ----- Quick action: toggle human mode -----
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const runAction = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(key)
    try {
      await fn()
    } finally {
      setActionLoading(null)
    }
  }

  const toggleHumanMode = async () => {
    if (!data) return
    const next = !data.contact.humanMode
    try {
      await apiPost(`/api/contacts/${contactId}/human-mode`, { enabled: next })
      setData({
        ...data,
        contact: { ...data.contact, humanMode: next },
      })
      toast.success(next ? 'Human mode enabled — AI paused' : 'AI auto-reply resumed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle human mode')
    }
  }

  const togglePinned = async () => {
    if (!data) return
    const next = !data.contact.pinned
    try {
      await apiPatch(`/api/contacts/${contactId}`, { pinned: next })
      setData({
        ...data,
        contact: { ...data.contact, pinned: next },
      })
      toast.success(next ? 'Contact pinned' : 'Contact unpinned')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle pin')
    }
  }

  const setStatus = async (status: ContactStatus) => {
    if (!data) return
    try {
      await apiPatch(`/api/contacts/${contactId}`, { status })
      setData({
        ...data,
        contact: { ...data.contact, status },
      })
      toast.success(`Status set to "${status}"`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  // Most recent detected language from incoming messages — surfaces
  // in the Details tab as a read-only "Detected language" metadata row.
  // Declared before the early returns below so the rules-of-hooks
  // invariant ("hooks called in the same order every render") holds.
  const latestDetectedLanguage = React.useMemo(() => {
    const msgs = data?.messages ?? []
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i]
      if (m.direction === 'incoming' && m.detectedLanguage) {
        return m.detectedLanguage
      }
    }
    return undefined
  }, [data?.messages])

  // ----- Loading state -----
  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  // ----- Error state -----
  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card className={cn(CARD_CLS, 'flex flex-col items-center gap-4 py-12 text-center')}>
          <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-500/15 text-rose-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Could not load contact profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => void loadAll()}>
              <Loader2 className="h-4 w-4" /> Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const { contact, messages, memories, leadScoreHistory, stats, notifications } = data
  const statusCls = STATUS_BADGE[contact.status as ContactStatus] ?? STATUS_BADGE.new

  return (
    <TooltipProvider delayDuration={300}>
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      {/* ---------- Header bar ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card className={CARD_CLS}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={onBack}
                aria-label="Back to chats"
                className="shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Avatar name={contact.name} phone={contact.phone} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{contact.name}</h1>
                <Badge variant="outline" className={cn('px-2 py-0 text-xs capitalize', statusCls)}>
                  {contact.status}
                </Badge>
                <LeadBadge score={contact.leadScore} className="px-2 py-0.5 text-xs" />
                {contact.humanMode && (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-300">
                    <User className="mr-1 h-3 w-3" /> Human mode
                  </Badge>
                )}
                {contact.pinned && (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                    <Pin className="mr-1 h-3 w-3" /> Pinned
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono">{contact.phone}</span>
                {contact.countryCode && <span>· {contact.countryCode}</span>}
                <span>· {categoryLabel(contact.detectedService)}</span>
                <span>· {contact.language}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.('chats')}
                className="gap-1.5"
              >
                <MessageSquare className="h-4 w-4" /> Open Chat
              </Button>
              <Button
                variant={contact.humanMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => void runAction('human', toggleHumanMode)}
                disabled={actionLoading === 'human'}
                className="gap-1.5"
              >
                {actionLoading === 'human' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : contact.humanMode ? (
                  <Bot className="h-4 w-4" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                {contact.humanMode ? 'Resume AI' : 'Take Over'}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ---------- Section 1: Stats Grid ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.25 }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <StatCard
          icon={<MessageSquare className="h-5 w-5" />}
          accent="bg-emerald-500/15 text-emerald-300"
          label="Total Messages"
          value={stats.totalMessages}
          sub={
            <span>
              <span className="text-emerald-400">{stats.incomingCount}</span> in ·{' '}
              <span className="text-sky-400">{stats.outgoingCount}</span> out
            </span>
          }
        />
        <StatCard
          icon={<Bot className="h-5 w-5" />}
          accent="bg-teal-500/15 text-teal-300"
          label="AI vs Owner"
          valueText={`${stats.aiCount} / ${stats.ownerCount}`}
          sub={
            <span>
              {stats.aiCount + stats.ownerCount > 0
                ? `${Math.round((stats.aiCount / (stats.aiCount + stats.ownerCount)) * 100)}% AI`
                : 'No replies yet'}
            </span>
          }
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          accent="bg-amber-500/15 text-amber-300"
          label="Avg Response"
          valueText={formatResponseTime(stats.avgResponseMs)}
          sub={<span>AI reply speed</span>}
        />
        <StatCard
          icon={<History className="h-5 w-5" />}
          accent="bg-cyan-500/15 text-cyan-300"
          label="Duration"
          value={stats.conversationDays}
          suffix={stats.conversationDays === 1 ? ' day' : ' days'}
          sub={
            <span>
              {stats.firstMessageAt ? `from ${shortDate(stats.firstMessageAt)}` : 'No messages yet'}
            </span>
          }
        />
      </motion.div>

      {/* ---------- Section 2: Lead Score History ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
      >
        <LeadScoreSection
          contactId={contactId}
          history={leadScoreHistory}
          currentScore={contact.leadScore}
          currentCategory={contact.detectedService}
          onAdjusted={() => void loadAll()}
        />
      </motion.div>

      {/* ---------- Section 3: Tabs ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
      >
        <Card className={CARD_CLS}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
              <TabsTrigger value="conversation" className="gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Conversation
              </TabsTrigger>
              <TabsTrigger value="memory" className="gap-1.5">
                <Brain className="h-3.5 w-3.5" /> AI Memory
                <span className="ml-1 rounded bg-muted px-1.5 py-0 text-[10px] tabular-nums">
                  {memories.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Activity
              </TabsTrigger>
              <TabsTrigger value="details" className="gap-1.5">
                <Edit className="h-3.5 w-3.5" /> Details
              </TabsTrigger>
              <TabsTrigger value="statistics" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Statistics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="conversation" className="mt-4">
              <ConversationTab messages={messages} contactName={contact.name} contactPhone={contact.phone} />
            </TabsContent>

            <TabsContent value="memory" className="mt-4">
              <MemoryTab contactId={contactId} memories={memories} onChanged={() => void loadAll()} />
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <ActivityTab notifications={notifications} logs={logs} />
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <DetailsTab
                contactId={contactId}
                contact={contact}
                onChanged={() => void loadAll()}
                latestDetectedLanguage={latestDetectedLanguage}
              />
            </TabsContent>

            <TabsContent value="statistics" className="mt-4">
              <StatisticsTab contactId={contactId} messages={messages} />
            </TabsContent>
          </Tabs>
        </Card>
      </motion.div>

      {/* ---------- Section 4: Danger Zone ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
      >
        <Card className={cn(CARD_CLS, 'border-rose-500/30 bg-rose-500/5')}>
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4 text-rose-300" />}
            title="Danger Zone"
            description="Irreversible & high-impact actions"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runAction('pin', togglePinned)}
              disabled={actionLoading === 'pin'}
              className="gap-1.5"
            >
              {actionLoading === 'pin' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : contact.pinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
              {contact.pinned ? 'Unpin contact' : 'Pin contact'}
            </Button>
            {contact.status !== 'blocked' ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void runAction('block', () => setStatus('blocked'))}
                disabled={actionLoading === 'block'}
                className="gap-1.5"
              >
                {actionLoading === 'block' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Ban className="h-3.5 w-3.5" />
                )}
                Block contact
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction('unblock', () => setStatus('active'))}
                disabled={actionLoading === 'unblock'}
                className="gap-1.5"
              >
                {actionLoading === 'unblock' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Unblock contact
              </Button>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({
  icon,
  accent,
  label,
  value,
  valueText,
  suffix,
  sub,
}: {
  icon: React.ReactNode
  accent: string
  label: string
  value?: number
  valueText?: string
  suffix?: string
  sub?: React.ReactNode
}) {
  return (
    <Card className={cn(CARD_CLS, 'relative overflow-hidden')}>
      <div
        className={cn(
          'pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20 blur-2xl',
          accent,
        )}
      />
      <div className={cn('grid h-9 w-9 place-items-center rounded-lg', accent)}>{icon}</div>
      <div className="mt-3 text-3xl font-bold tabular-nums leading-none">
        {valueText !== undefined ? (
          valueText
        ) : (
          <AnimatedCounter value={value ?? 0} suffix={suffix} />
        )}
      </div>
      <div className="mt-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Lead Score History
// ---------------------------------------------------------------------------
function LeadScoreSection({
  contactId,
  history,
  currentScore,
  currentCategory,
  onAdjusted,
}: {
  contactId: string
  history: ProfileLeadScore[]
  currentScore: number
  currentCategory: string
  onAdjusted: () => void
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false)

  // Build chart data — always include the current contact score as the final
  // point so the chart shows the latest state even if history is sparse.
  const chartData = React.useMemo(() => {
    const points = history.map((h) => ({
      date: shortDate(h.createdAt),
      score: h.score,
      ts: h.createdAt,
    }))
    // Append the current score as "now" if it differs from the last entry.
    const last = points[points.length - 1]
    if (!last || last.score !== currentScore) {
      points.push({ date: 'Now', score: currentScore, ts: new Date().toISOString() })
    }
    return points
  }, [history, currentScore])

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Lead Score History"
        description={`Current: ${currentScore} · ${categoryLabel(currentCategory)}`}
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Adjust Score
          </Button>
        }
      />

      <div className="mt-4">
        {chartData.length < 2 ? (
          <div className="flex h-[200px] w-full items-center justify-center text-xs text-muted-foreground">
            Not enough history yet — adjust the score to begin tracking.
          </div>
        ) : (
          <ChartContainer config={LEAD_SCORE_CONFIG} className="h-[200px] w-full">
            <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="leadScoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-score)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-score)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={(value) => (
                      <span className="font-mono tabular-nums text-foreground">
                        Score: {Number(value)}
                      </span>
                    )}
                  />
                }
              />
              <ReferenceLine
                y={HOT_LEAD_THRESHOLD}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: `Hot (${HOT_LEAD_THRESHOLD})`,
                  position: 'insideTopRight',
                  fill: '#f59e0b',
                  fontSize: 10,
                }}
              />
              <Area
                dataKey="score"
                type="monotone"
                stroke="var(--color-score)"
                strokeWidth={2.5}
                fill="url(#leadScoreFill)"
                dot={{ r: 3, fill: 'var(--color-score)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>

      {/* Events list */}
      <Separator className="my-4" />
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Score Events ({history.length})
        </div>
        {history.length === 0 ? (
          <div className="rounded-md border border-dashed bg-background/40 px-3 py-3 text-xs text-muted-foreground">
            No score events recorded yet.
          </div>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
            {[...history].reverse().map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 rounded-lg border bg-background/40 px-3 py-2"
              >
                <div className="flex w-12 shrink-0 justify-center">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                      leadBadge(h.score),
                    )}
                  >
                    {h.score >= 75 && <span>🔥</span>}
                    {h.score}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{h.reason || '—'}</div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge
                      variant="outline"
                      className="px-1 py-0 text-[9px] font-medium"
                    >
                      {categoryLabel(h.category)}
                    </Badge>
                    <span>{formatDateTime(h.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdjustScoreDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contactId={contactId}
        currentScore={currentScore}
        currentCategory={currentCategory}
        onSaved={onAdjusted}
      />
    </Card>
  )
}

function AdjustScoreDialog({
  open,
  onOpenChange,
  contactId,
  currentScore,
  currentCategory,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  contactId: string
  currentScore: number
  currentCategory: string
  onSaved: () => void
}) {
  const [score, setScore] = React.useState(currentScore)
  const [category, setCategory] = React.useState<string>(
    currentCategory || 'general',
  )
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Reset form whenever the dialog opens.
  React.useEffect(() => {
    if (open) {
      setScore(currentScore)
      setCategory(currentCategory || 'general')
      setReason('')
    }
  }, [open, currentScore, currentCategory])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/contacts/${contactId}/lead-score`, {
        score,
        category,
        reason: reason.trim() || 'Manual adjustment by operator',
      })
      toast.success(`Lead score set to ${score}`)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust score')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Lead Score</DialogTitle>
          <DialogDescription>
            Create a new score event in the history and update the contact's current score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Score</Label>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums',
                  leadBadge(score),
                )}
              >
                {score >= 75 && <span>🔥</span>}
                {score}
              </span>
            </div>
            <Slider
              value={[score]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setScore(v[0] ?? 0)}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span className="text-amber-400">70 (hot)</span>
              <span>100</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer confirmed ₹50k budget"
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save score
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — Conversation
// ---------------------------------------------------------------------------
function ConversationTab({
  messages,
  contactName,
  contactPhone,
}: {
  messages: ProfileMessage[]
  contactName: string
  contactPhone: string
}) {
  const grouped = groupByDay(messages)
  const [showTranslations, setShowTranslations] = React.useState(true)
  // Per-message manual translation cache (keyed by message id) — used
  // when the user clicks "Translate" on a message that wasn't
  // auto-translated.
  const [manualTranslations, setManualTranslations] = React.useState<
    Record<string, { text: string; from: string }>
  >({})
  const [translatingId, setTranslatingId] = React.useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = React.useState<Set<string>>(new Set())

  const toggleHidden = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleManualTranslate = async (m: ProfileMessage) => {
    // Auto-translation already present? Toggle visibility.
    const auto = m.isTranslated && m.translatedText
    if (auto) {
      toggleHidden(m.id)
      return
    }
    if (manualTranslations[m.id]) {
      toggleHidden(m.id)
      return
    }
    setTranslatingId(m.id)
    try {
      const res = await apiPost<{ translated: string; from: string; to: string }>(
        '/api/translate',
        { text: m.text, to: 'en' },
      )
      if (res?.translated) {
        setManualTranslations((prev) => ({
          ...prev,
          [m.id]: { text: res.translated, from: res.from },
        }))
        // Make sure it's not hidden.
        setHiddenIds((prev) => {
          const next = new Set(prev)
          next.delete(m.id)
          return next
        })
      } else {
        toast.error('No translation returned')
      }
    } catch (err) {
      toast.error('Failed to translate message', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setTranslatingId(null)
    }
  }

  const exportCsv = () => {
    const rows = messages.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      direction: m.direction,
      source: m.source,
      status: m.status,
      read: m.read ? 'yes' : 'no',
      detectedLanguage: m.detectedLanguage ?? '',
      isTranslated: m.isTranslated ? 'yes' : 'no',
      translatedText: m.translatedText ?? '',
      text: m.text,
    }))
    const csv = toCsv(rows)
    const safeName = (contactName || contactPhone).replace(/\s+/g, '_')
    downloadFile(`chat-${safeName}.csv`, csv, 'text/csv;charset=utf-8')
    toast.success(`Exported ${rows.length} messages to CSV`)
  }

  const exportJson = () => {
    const payload = {
      contact: { name: contactName, phone: contactPhone },
      messages,
      exportedAt: new Date().toISOString(),
    }
    const safeName = (contactName || contactPhone).replace(/\s+/g, '_')
    downloadFile(
      `chat-${safeName}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    )
    toast.success(`Exported ${messages.length} messages to JSON`)
  }

  // Count of messages that have an auto-translation available — used
  // to decide whether to show the "Show translations" toggle.
  const hasAnyTranslation = messages.some(
    (m) => m.isTranslated && m.translatedText,
  ) || Object.keys(manualTranslations).length > 0

  if (messages.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <span className="text-xs">No messages in this conversation yet.</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {messages.length} messages · read-only timeline
        </div>
        <div className="flex items-center gap-1.5">
          {hasAnyTranslation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowTranslations((v) => !v)}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
                    showTranslations
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                      : 'border-border/60 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-pressed={showTranslations}
                  aria-label={showTranslations ? 'Hide translations' : 'Show translations'}
                >
                  {showTranslations ? (
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <Languages className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">
                    {showTranslations ? 'Translations on' : 'Translations off'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showTranslations
                  ? 'Showing inline translations for incoming messages'
                  : 'Translations are hidden — click to reveal them'}
              </TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv} className="gap-2">
                <FileText className="h-3.5 w-3.5" /> Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportJson} className="gap-2">
                <Braces className="h-3.5 w-3.5" /> Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="max-h-[600px] space-y-4 overflow-y-auto scrollbar-thin rounded-lg border bg-background/30 p-4">
        {grouped.map((group) => (
          <div key={group.day}>
            <div className="sticky top-0 z-10 mb-2 flex justify-center">
              <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
                {formatDayHeader(group.day)}
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map((m) => {
                const isOutgoing = m.direction === 'outgoing'
                const showSentiment = !isOutgoing && m.sentiment && m.sentiment !== 'unknown'
                const manual = manualTranslations[m.id]
                const effectiveTranslated =
                  m.isTranslated && m.translatedText
                    ? m.translatedText
                    : manual?.text ?? ''
                const effectiveLang =
                  m.isTranslated && m.translatedText
                    ? (m.detectedLanguage ?? '')
                    : (manual?.from ?? '')
                const hasTranslation = Boolean(effectiveTranslated)
                const renderTranslation =
                  hasTranslation && showTranslations && !hiddenIds.has(m.id)
                return (
                  <div
                    key={m.id}
                    className={cn('group relative flex flex-col gap-0.5', isOutgoing ? 'items-end' : 'items-start')}
                  >
                    {showSentiment && (
                      <div className="px-1">
                        <SentimentBadge sentiment={m.sentiment} />
                      </div>
                    )}
                    <div
                      className={cn(
                        'flex max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        isOutgoing
                          ? m.source === 'owner'
                            ? 'rounded-br-sm bg-sky-500/20 text-sky-50'
                            : 'rounded-br-sm bg-emerald-500/20 text-emerald-50'
                          : 'rounded-bl-sm bg-muted text-foreground',
                      )}
                    >
                      <div className="min-w-0">
                        {isOutgoing && (
                          <div className="mb-1 flex items-center justify-end gap-1">
                            <SourceBadge source={m.source as MessageSource} />
                          </div>
                        )}
                        {/* Language badge row — incoming messages with a detected language */}
                        {!isOutgoing && m.detectedLanguage && (
                          <div className="mb-1 flex items-center gap-1">
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 px-1.5 py-0.5 text-[9px] font-medium leading-none text-muted-foreground"
                              title={`Detected language: ${languageLabel(m.detectedLanguage).label} (${m.detectedLanguage})`}
                            >
                              <span aria-hidden>{languageLabel(m.detectedLanguage).flag}</span>
                              <span className="uppercase">{m.detectedLanguage}</span>
                            </span>
                            {m.isTranslated && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-400/80">
                                <Languages className="h-2.5 w-2.5" aria-hidden />
                                Auto
                              </span>
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        {/* Inline translation section */}
                        {renderTranslation && (
                          <div className="border-t border-dashed border-border/50 mt-1 pt-1 text-xs text-muted-foreground">
                            <div className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider opacity-80">
                              <Globe className="h-2.5 w-2.5" aria-hidden />
                              <span>Translated</span>
                              {effectiveLang && (
                                <span className="opacity-70">
                                  · {languageLabel(effectiveLang).label}
                                </span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {effectiveTranslated}
                            </p>
                          </div>
                        )}
                        <div
                          className={cn(
                            'mt-1 flex items-center gap-1 text-[10px] opacity-70',
                            isOutgoing ? 'justify-end' : 'justify-start',
                          )}
                        >
                          <span>{formatTime(m.timestamp)}</span>
                          {isOutgoing && <DeliveryIcon status={m.status as MessageStatus} />}
                        </div>
                      </div>
                    </div>
                    {/* Hover Translate button — incoming messages only */}
                    {!isOutgoing && (
                      <div className="pointer-events-none absolute top-0 left-0 flex items-center gap-0.5 rounded-md border bg-card/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => void handleManualTranslate(m)}
                              disabled={translatingId === m.id}
                              className={cn(
                                'grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                                hasTranslation && !hiddenIds.has(m.id) && 'text-emerald-400 hover:text-emerald-300',
                              )}
                              aria-label={
                                hasTranslation
                                  ? hiddenIds.has(m.id)
                                    ? 'Show translation'
                                    : 'Hide translation'
                                  : 'Translate this message'
                              }
                            >
                              {translatingId === m.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : hasTranslation && !hiddenIds.has(m.id) ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Globe className="h-3 w-3" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {hasTranslation
                              ? hiddenIds.has(m.id)
                                ? 'Show translation'
                                : 'Hide translation'
                              : 'Translate'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — AI Memory
// ---------------------------------------------------------------------------
function MemoryTab({
  contactId,
  memories,
  onChanged,
}: {
  contactId: string
  memories: ProfileMemory[]
  onChanged: () => void
}) {
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = React.useState<string | null>(null)
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null)

  // New memory form state
  const [newKey, setNewKey] = React.useState('')
  const [newValue, setNewValue] = React.useState('')
  const [adding, setAdding] = React.useState(false)

  const setDraft = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }))
  }

  const draftValue = (key: string, original: string) => {
    return drafts[key] ?? original
  }

  const saveMemory = async (key: string) => {
    const value = drafts[key]
    if (value === undefined) return
    setSavingKey(key)
    try {
      await apiPost(`/api/contacts/${contactId}/memory`, { key, value })
      toast.success(`Saved "${memoryLabel(key)}"`)
      setDrafts((d) => {
        const next = { ...d }
        delete next[key]
        return next
      })
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save memory')
    } finally {
      setSavingKey(null)
    }
  }

  const deleteMemory = async (key: string) => {
    setDeletingKey(key)
    try {
      await apiDelete(`/api/contacts/${contactId}/memory?key=${encodeURIComponent(key)}`)
      toast.success(`Deleted "${memoryLabel(key)}"`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete memory')
    } finally {
      setDeletingKey(null)
    }
  }

  const addMemory = async () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_')
    if (!key) {
      toast.error('Key is required')
      return
    }
    setAdding(true)
    try {
      await apiPost(`/api/contacts/${contactId}/memory`, { key, value: newValue })
      toast.success(`Added "${memoryLabel(key)}"`)
      setNewKey('')
      setNewValue('')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add memory')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-4">
      {memories.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
          <Brain className="h-6 w-6" />
          <span className="text-xs">No AI memory extracted yet.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => {
            const draft = draftValue(m.key, m.value)
            const dirty = draft !== m.value
            return (
              <div
                key={m.id}
                className="rounded-lg border bg-background/40 p-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                    {memoryLabel(m.key)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Updated {timeAgo(m.updatedAt)}
                  </span>
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(m.key, e.target.value)}
                  className="min-h-12 text-xs"
                  rows={2}
                />
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMemory(m.key)}
                    disabled={deletingKey === m.key}
                    className="h-7 gap-1 px-2 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                  >
                    {deletingKey === m.key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveMemory(m.key)}
                    disabled={!dirty || savingKey === m.key}
                    className="h-7 gap-1 px-2"
                  >
                    {savingKey === m.key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add new memory */}
      <Separator />
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
          <Plus className="h-3.5 w-3.5" /> Add new memory
        </div>
        <div className="space-y-2">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Key (e.g. budget, location, project_status)"
            className="text-xs"
            maxLength={64}
          />
          <Textarea
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Value…"
            className="min-h-12 text-xs"
            rows={2}
            maxLength={4000}
          />
          <Button
            size="sm"
            onClick={addMemory}
            disabled={adding || !newKey.trim()}
            className="gap-1.5"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add memory
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3 — Activity Log
// ---------------------------------------------------------------------------
type ActivityItem =
  | {
      kind: 'notification'
      id: string
      createdAt: string
      severity: string
      title: string
      body: string
      type: string
    }
  | {
      kind: 'log'
      id: string
      createdAt: string
      level: LogLevel
      category: LogCategory
      message: string
      meta: string
    }

function ActivityTab({
  notifications,
  logs,
}: {
  notifications: ProfileNotification[]
  logs: LogRow[]
}) {
  const items = React.useMemo<ActivityItem[]>(() => {
    const merged: ActivityItem[] = [
      ...notifications.map<ActivityItem>((n) => ({
        kind: 'notification',
        id: n.id,
        createdAt: n.createdAt,
        severity: n.severity,
        title: n.title,
        body: n.body,
        type: n.type,
      })),
      ...logs.map<ActivityItem>((l) => ({
        kind: 'log',
        id: l.id,
        createdAt: l.createdAt,
        level: l.level,
        category: l.category,
        message: l.message,
        meta: l.meta,
      })),
    ]
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return merged
  }, [notifications, logs])

  if (items.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <Activity className="h-6 w-6" />
        <span className="text-xs">No activity recorded for this contact.</span>
      </div>
    )
  }

  return (
    <div className="max-h-[600px] space-y-2 overflow-y-auto scrollbar-thin pr-1">
      {items.map((item) => {
        if (item.kind === 'notification') {
          return (
            <div
              key={`n-${item.id}`}
              className="flex gap-3 rounded-lg border bg-background/40 p-3"
            >
              <SeverityIcon severity={item.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>
                {item.body && (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{item.body}</p>
                )}
                <Badge
                  variant="outline"
                  className="mt-1.5 px-1 py-0 text-[9px] font-medium capitalize"
                >
                  <Bell className="mr-1 h-2.5 w-2.5" />
                  {item.type.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          )
        }
        // log item
        return (
          <div
            key={`l-${item.id}`}
            className="flex gap-3 rounded-lg border bg-background/40 p-3"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center">
              <LogLevelDot level={item.level} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.category}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDateTime(item.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 break-words text-xs">{item.message}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 4 — Details
// ---------------------------------------------------------------------------
function DetailsTab({
  contactId,
  contact,
  onChanged,
  latestDetectedLanguage,
}: {
  contactId: string
  contact: ProfileContact
  onChanged: () => void
  latestDetectedLanguage?: string
}) {
  const [name, setName] = React.useState(contact.name)
  const [phone, setPhone] = React.useState(contact.phone)
  const [language, setLanguage] = React.useState(contact.language || 'en')
  const [status, setStatus] = React.useState<ContactStatus>(
    (contact.status as ContactStatus) || 'new',
  )
  const [notes, setNotes] = React.useState(contact.notes)
  const [saving, setSaving] = React.useState(false)

  const dirty =
    name !== contact.name ||
    phone !== contact.phone ||
    language !== (contact.language || 'en') ||
    status !== (contact.status as ContactStatus) ||
    notes !== (contact.notes ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      // PATCH /api/contacts/[id] currently supports notes/pinned/status only,
      // but accepting name/phone/language on the route is a backwards-compatible
      // extension we make here. We still patch the supported fields, and also
      // fall back gracefully if name/phone/language are ignored.
      await apiPatch(`/api/contacts/${contactId}`, {
        notes,
        status,
        name,
        phone,
        language,
      })
      toast.success('Contact details saved')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Languages className="h-3 w-3 text-muted-foreground" />
            Preferred Language
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            The language the AI uses when replying to this contact.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ContactStatus)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Private notes about this customer…"
          className="min-h-20 text-sm"
          maxLength={4000}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save details
        </Button>
      </div>

      <Separator />

      {/* Read-only metadata */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border bg-background/40 p-3 text-xs sm:grid-cols-2">
        <MetaRow label="First seen" value={formatDateTime(contact.firstSeen)} />
        <MetaRow label="Last seen" value={formatDateTime(contact.lastSeen)} />
        <MetaRow
          label="Last message"
          value={contact.lastMessageAt ? formatDateTime(contact.lastMessageAt) : '—'}
        />
        <MetaRow label="Created at" value={formatDateTime(contact.createdAt)} />
        <MetaRow label="Country code" value={contact.countryCode || '—'} />
        {/* Detected language — derived from the most recent incoming
            message that had its language auto-detected. Falls back to
            the contact's stored language when no detection is on file. */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Detected language</span>
          <span className="inline-flex items-center gap-1 truncate font-medium">
            {latestDetectedLanguage ? (
              <>
                <span aria-hidden>{languageLabel(latestDetectedLanguage).flag}</span>
                <span>{languageLabel(latestDetectedLanguage).label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({latestDetectedLanguage})
                </span>
              </>
            ) : contact.language ? (
              <>
                <span aria-hidden>{languageLabel(contact.language).flag}</span>
                <span>{languageLabel(contact.language).label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ({contact.language})
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        <MetaRow label="Contact ID" value={contact.id} mono />
      </div>
    </div>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('truncate font-medium', mono && 'font-mono text-[10px]')}>{value}</span>
    </div>
  )
}

// ===========================================================================
// Tab 5 — Statistics
// ===========================================================================

/** A blank 7×24 matrix (Mon-first rows × 24 hour columns). */
function buildHeatmapMatrix(flow: StatsConversationFlowPoint[]): number[][] {
  const m: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const p of flow) {
    const d = new Date(p.timestamp)
    const jsDay = d.getDay() // 0=Sun..6=Sat
    const monFirst = (jsDay + 6) % 7 // 0=Mon..6=Sun
    const hour = d.getHours()
    if (monFirst >= 0 && monFirst < 7 && hour >= 0 && hour < 24) {
      m[monFirst][hour] += 1
    }
  }
  return m
}

function StatisticsTab({ contactId, messages }: { contactId: string; messages: ProfileMessage[] }) {
  const [stats, setStats] = React.useState<StatsPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Compute sentiment distribution from incoming messages (only those
  // that have been analyzed — sentiment != 'unknown' / '').
  // Note: hooks must be called BEFORE any early return.
  const sentimentCounts = React.useMemo(() => {
    const buckets = { positive: 0, neutral: 0, negative: 0, urgent: 0, unknown: 0 }
    for (const m of messages) {
      if (m.direction !== 'incoming') continue
      const s = m.sentiment || 'unknown'
      if (s === 'positive' || s === 'neutral' || s === 'negative' || s === 'urgent' || s === 'unknown') {
        buckets[s] += 1
      } else {
        buckets.unknown += 1
      }
    }
    return buckets
  }, [messages])

  const loadStats = React.useCallback(async () => {
    try {
      const data = await apiGet<StatsPayload>(`/api/contacts/${contactId}/stats`)
      setStats(data)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load statistics'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [contactId])

  React.useEffect(() => {
    setLoading(true)
    void loadStats()
  }, [loadStats])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <span className="text-xs">{error}</span>
        <Button variant="outline" size="sm" onClick={() => void loadStats()} className="mt-1 gap-1.5">
          <Loader2 className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  if (!stats) return null

  // Not enough data — friendly empty state.
  if (stats.overview.totalMessages < 5) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-background/30 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Not enough data yet</h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Statistics become available once this contact has at least 5 messages.
            Currently there {stats.overview.totalMessages === 1 ? 'is' : 'are'}{' '}
            <span className="font-semibold text-foreground">
              {stats.overview.totalMessages}
            </span>{' '}
            {stats.overview.totalMessages === 1 ? 'message' : 'messages'} recorded.
          </p>
        </div>
      </div>
    )
  }

  const ov = stats.overview

  // Container animation variants for staggered section entrance.
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
  }
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* (a) Enhanced overview stat tiles */}
      <motion.div
        variants={item}
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <StatTile
          icon={<MessageSquare className="h-4 w-4" />}
          accent="bg-emerald-500/15 text-emerald-300"
          label="Total Messages"
        >
          <div className="text-3xl font-bold tabular-nums leading-none">
            <AnimatedCounter value={ov.totalMessages} />
          </div>
          <SplitBar
            incoming={ov.incomingCount}
            outgoing={ov.outgoingCount}
            className="mt-2.5"
          />
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span className="text-emerald-400">{ov.incomingCount} in</span>
            <span className="text-teal-400">{ov.outgoingCount} out</span>
          </div>
        </StatTile>

        <StatTile
          icon={<Bot className="h-4 w-4" />}
          accent="bg-teal-500/15 text-teal-300"
          label="AI vs Owner ratio"
        >
          <RatioBar
            aiCount={ov.aiCount}
            ownerCount={ov.ownerCount}
          />
        </StatTile>

        <StatTile
          icon={<Zap className="h-4 w-4" />}
          accent="bg-amber-500/15 text-amber-300"
          label="Avg Response Time"
        >
          <div className="text-3xl font-bold tabular-nums leading-none">
            {formatResponseTime(ov.avgResponseTimeMs)}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            Customer → our reply
          </div>
        </StatTile>

        <StatTile
          icon={<Timer className="h-4 w-4" />}
          accent="bg-sky-500/15 text-sky-300"
          label="Avg Customer Reply"
        >
          <div className="text-3xl font-bold tabular-nums leading-none">
            {formatDurationMs(ov.avgCustomerResponseMs)}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            Our reply → customer back
          </div>
        </StatTile>

        <StatTile
          icon={<Gauge className="h-4 w-4" />}
          accent="bg-violet-500/15 text-violet-300"
          label="Messages / Day"
        >
          <div className="text-3xl font-bold tabular-nums leading-none">
            <AnimatedCounter value={ov.messagesPerDay} decimals={1} />
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            Avg daily volume
          </div>
        </StatTile>

        <StatTile
          icon={<History className="h-4 w-4" />}
          accent="bg-cyan-500/15 text-cyan-300"
          label="Conversation Duration"
        >
          <div className="text-3xl font-bold tabular-nums leading-none">
            <AnimatedCounter value={ov.conversationDuration} />
            <span className="ml-1 text-base font-medium text-muted-foreground">
              {ov.conversationDuration === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            {ov.firstMessageAt
              ? `from ${shortDate(ov.firstMessageAt)}`
              : 'No messages yet'}
            {ov.longestStreak > 0 && (
              <span className="ml-1 text-amber-400">
                · 🔥 {ov.longestStreak}d streak
              </span>
            )}
          </div>
        </StatTile>
      </motion.div>

      {/* (b) Sentiment summary — overall sentiment distribution for this contact */}
      <motion.div variants={item}>
        <SentimentSummaryCard counts={sentimentCounts} />
      </motion.div>

      {/* (c) Message timeline (stacked area, 30 days) */}
      <motion.div variants={item}>
        <MessageTimelineChart data={stats.messageTimeline} />
      </motion.div>

      {/* (d) Activity heatmap (7×24 custom grid) */}
      <motion.div variants={item}>
        <ActivityHeatmap flow={stats.conversationFlow} />
      </motion.div>

      {/* (e) Hourly distribution + (f) Day of week — side by side */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.div variants={item}>
          <HourlyDistributionChart data={stats.hourlyHeatmap} />
        </motion.div>
        <motion.div variants={item}>
          <DayOfWeekChart data={stats.dayOfWeekDistribution} />
        </motion.div>
      </div>

      {/* (g) Response time trend (line chart, full width) */}
      <motion.div variants={item}>
        <ResponseTimeTrendChart data={stats.responseTimes} />
      </motion.div>

      {/* (h) Source distribution + (i) Conversation flow — side by side */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.div variants={item}>
          <SourceDistributionChart data={stats.sourceDistribution} />
        </motion.div>
        <motion.div variants={item}>
          <ConversationFlowViz flow={stats.conversationFlow} />
        </motion.div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Stats tab — sub-components
// ---------------------------------------------------------------------------

/**
 * Sentiment summary card — overall sentiment distribution for this contact
 * computed from the messages array passed in. Renders a 4-segment split bar
 * + per-label percentages + a small AI-tone footer line.
 */
function SentimentSummaryCard({
  counts,
}: {
  counts: { positive: number; neutral: number; negative: number; urgent: number; unknown: number }
}) {
  const total =
    counts.positive + counts.neutral + counts.negative + counts.urgent + counts.unknown
  const analyzed = total - counts.unknown
  const pct = (n: number) => (analyzed > 0 ? Math.round((n / analyzed) * 100) : 0)

  const segments: { key: SentimentKey; value: number }[] = [
    { key: 'positive', value: counts.positive },
    { key: 'neutral', value: counts.neutral },
    { key: 'negative', value: counts.negative },
    { key: 'urgent', value: counts.urgent },
  ]

  // Dominant tone (only when we have at least 1 analyzed message).
  const dominant: SentimentKey = (() => {
    if (analyzed === 0) return 'unknown'
    let best: SentimentKey = 'positive'
    let bestN = -1
    for (const seg of segments) {
      if (seg.value > bestN) {
        bestN = seg.value
        best = seg.key
      }
    }
    return best
  })()

  const dominantMeta = sentimentMeta(dominant)

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<Brain className="h-4 w-4" />}
        title="Sentiment Summary"
        description={
          analyzed === 0
            ? 'No sentiment analysis yet — analyzed messages will appear here'
            : `${analyzed} of ${total} incoming messages analyzed · AI-detected tone`
        }
        action={
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
              dominantMeta.chip,
            )}
          >
            {dominant !== 'unknown' ? (
              <>
                <span>{dominantMeta.emoji}</span>
                <span>{dominantMeta.label}</span>
              </>
            ) : (
              '—'
            )}
          </span>
        }
      />

      <div className="mt-4 space-y-3">
        {/* Stacked split bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {analyzed === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
              no data
            </div>
          ) : (
            segments.map((seg) => {
              if (seg.value === 0) return null
              const meta = sentimentMeta(seg.key)
              const widthPct = (seg.value / analyzed) * 100
              return (
                <div
                  key={seg.key}
                  className={cn('h-full', meta.dot)}
                  style={{ width: `${widthPct}%` }}
                  title={`${meta.label}: ${seg.value} (${pct(seg.value)}%)`}
                />
              )
            })
          )}
        </div>

        {/* Per-label grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {segments.map((seg) => {
            const meta = sentimentMeta(seg.key)
            return (
              <div
                key={seg.key}
                className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} />
                  <span className="text-[11px] font-medium">
                    {meta.emoji} {meta.label}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums leading-none">
                    {seg.value}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    · {pct(seg.value)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {analyzed > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {dominant === 'positive' && '😊 Customer tone is mostly positive — great rapport.'}
            {dominant === 'neutral' && '😐 Customer tone is mostly neutral / informational.'}
            {dominant === 'negative' && '😟 Customer tone leans negative — consider proactive follow-up.'}
            {dominant === 'urgent' && '⚠️ Multiple urgent messages — prioritize this contact.'}
          </p>
        )}
      </div>
    </Card>
  )
}

function StatTile({
  icon,
  accent,
  label,
  children,
}: {
  icon: React.ReactNode
  accent: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn(CARD_CLS, 'relative overflow-hidden p-4')}>
      <div
        className={cn(
          'pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20 blur-2xl',
          accent,
        )}
      />
      <div className="flex items-center gap-2">
        <span className={cn('grid h-7 w-7 place-items-center rounded-md', accent)}>
          {icon}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-2">{children}</div>
    </Card>
  )
}

/** Tiny split bar showing incoming vs outgoing proportional volume. */
function SplitBar({
  incoming,
  outgoing,
  className,
}: {
  incoming: number
  outgoing: number
  className?: string
}) {
  const total = incoming + outgoing
  const inPct = total > 0 ? (incoming / total) * 100 : 0
  const outPct = total > 0 ? (outgoing / total) * 100 : 0
  return (
    <div className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="bg-emerald-500/70" style={{ width: `${inPct}%` }} />
      <div className="bg-teal-500/70" style={{ width: `${outPct}%` }} />
    </div>
  )
}

/** AI vs Owner mini donut-ish ratio bar. */
function RatioBar({ aiCount, ownerCount }: { aiCount: number; ownerCount: number }) {
  const total = aiCount + ownerCount
  const aiPct = total > 0 ? (aiCount / total) * 100 : 0
  const ownerPct = total > 0 ? (ownerCount / total) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums leading-none text-emerald-300">
          {aiCount}
        </span>
        <span className="text-base text-muted-foreground">/</span>
        <span className="text-2xl font-semibold tabular-nums leading-none text-sky-300">
          {ownerCount}
        </span>
      </div>
      <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${aiPct}%` }} />
        <div className="bg-sky-500" style={{ width: `${ownerPct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span className="text-emerald-400">
          {total > 0 ? `${Math.round(aiPct)}% AI` : 'No replies yet'}
        </span>
        <span className="text-sky-400">
          {total > 0 ? `${Math.round(ownerPct)}% You` : '—'}
        </span>
      </div>
    </div>
  )
}

// (b) Message timeline — stacked AreaChart (30 days)
function MessageTimelineChart({ data }: { data: StatsTimelinePoint[] }) {
  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<TrendingUp className="h-4 w-4" />}
        title="Message Timeline"
        description="Daily incoming vs outgoing volume · last 30 days"
      />
      <div className="mt-4">
        <ChartContainer config={TIMELINE_CONFIG} className="h-[220px] w-full">
          <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="incomingFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-incoming)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--color-incoming)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="outgoingFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-outgoing)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--color-outgoing)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              fontSize={10}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
              fontSize={10}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area
              dataKey="incoming"
              type="monotone"
              stroke="var(--color-incoming)"
              strokeWidth={2}
              fill="url(#incomingFill)"
              stackId="a"
            />
            <Area
              dataKey="outgoing"
              type="monotone"
              stroke="var(--color-outgoing)"
              strokeWidth={2}
              fill="url(#outgoingFill)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </Card>
  )
}

// (c) Activity Heatmap — custom 7×24 CSS grid
function ActivityHeatmap({ flow }: { flow: StatsConversationFlowPoint[] }) {
  const matrix = React.useMemo(() => buildHeatmapMatrix(flow), [flow])
  const max = React.useMemo(() => {
    let m = 0
    for (const row of matrix) for (const v of row) if (v > m) m = v
    return m
  }, [matrix])

  const total = flow.length
  const [hover, setHover] = React.useState<{ day: number; hour: number; count: number } | null>(null)

  // Opacity scale: 0 → 0.08 (almost empty), max → 1.0
  const opacityFor = (count: number) => {
    if (count === 0 || max === 0) return 0.08
    return 0.2 + 0.8 * (count / max)
  }

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<Flame className="h-4 w-4" />}
        title="Activity Heatmap"
        description={`Message density by day-of-week × hour · ${total} total`}
        action={
          <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
            <span>Less</span>
            <div className="flex items-center gap-0.5">
              {[0.08, 0.3, 0.55, 0.8, 1].map((o) => (
                <span
                  key={o}
                  className="h-3 w-3 rounded-sm bg-emerald-500"
                  style={{ opacity: o }}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        }
      />

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour labels across the top */}
          <div className="mb-1 flex pl-8 text-[9px] text-muted-foreground">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="flex-1 text-center tabular-nums"
                style={{ minWidth: 0 }}
              >
                {h % 3 === 0 ? `${h}` : ''}
              </div>
            ))}
          </div>

          {/* Rows: Mon..Sun */}
          <div className="space-y-0.5">
            {matrix.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-0.5">
                <div className="w-8 shrink-0 text-[10px] font-medium text-muted-foreground">
                  {HEATMAP_DAYS[dayIdx]}
                </div>
                {row.map((count, hour) => (
                  <div
                    key={hour}
                    className="relative flex-1"
                    style={{ minWidth: 0 }}
                    onMouseEnter={() => setHover({ day: dayIdx, hour, count })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className="h-4 w-full rounded-sm bg-emerald-500 transition-colors"
                      style={{ opacity: opacityFor(count) }}
                      title={`${HEATMAP_DAYS[dayIdx]} ${formatHourLabel(hour)}: ${count} message${count === 1 ? '' : 's'}`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom hour axis (12 AM, 6 AM, 12 PM, 6 PM) */}
          <div className="mt-1 flex pl-8 text-[9px] text-muted-foreground">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center">
                {h === 0 ? '12a' : h === 6 ? '6a' : h === 12 ? '12p' : h === 18 ? '6p' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover detail footer */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {hover ? (
            <span className="text-foreground">
              <span className="font-medium">{HEATMAP_DAYS[hover.day]}</span>{' '}
              {formatHourLabel(hover.hour)} ·{' '}
              <span className="font-semibold text-emerald-300">{hover.count}</span>{' '}
              message{hover.count === 1 ? '' : 's'}
            </span>
          ) : (
            'Hover any cell to see the exact count.'
          )}
        </span>
        {max > 0 && (
          <span>
            Peak: <span className="font-semibold text-emerald-300">{max}</span> in a single hour
          </span>
        )}
      </div>
    </Card>
  )
}

// (d) Hourly distribution — BarChart with peak highlight
function HourlyDistributionChart({ data }: { data: StatsHourlyBucket[] }) {
  const peak = React.useMemo(() => {
    let p = { hour: 0, count: 0 }
    for (const b of data) if (b.count > p.count) p = b
    return p
  }, [data])

  const chartData = React.useMemo(
    () =>
      data.map((b) => ({
        ...b,
        label: `${b.hour}`,
        isPeak: b.hour === peak.hour && peak.count > 0,
      })),
    [data, peak],
  )

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<Clock className="h-4 w-4" />}
        title="Hourly Distribution"
        description={
          peak.count > 0
            ? `Peak at ${formatHourLabel(peak.hour)} · ${peak.count} messages`
            : 'When this contact is most active'
        }
      />
      <div className="mt-4">
        <ChartContainer config={HOURLY_CONFIG} className="h-[220px] w-full">
          <BarChart data={chartData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              fontSize={9}
              interval={1}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
              fontSize={10}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_, payload) => {
                    const hour = payload?.[0]?.payload?.hour
                    return typeof hour === 'number' ? formatHourLabel(hour) : ''
                  }}
                />
              }
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={18}>
              {chartData.map((d) => (
                <Cell
                  key={d.hour}
                  fill={d.isPeak ? '#f59e0b' : 'var(--color-count)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </Card>
  )
}

// (e) Day of Week — horizontal BarChart
function DayOfWeekChart({ data }: { data: StatsDayOfWeekBucket[] }) {
  const peak = React.useMemo(() => {
    let p = { day: '', count: 0 }
    for (const b of data) if (b.count > p.count) p = b
    return p
  }, [data])

  const chartData = React.useMemo(
    () =>
      data.map((b) => ({
        ...b,
        isPeak: b.day === peak.day && peak.count > 0,
      })),
    [data, peak],
  )

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<Calendar className="h-4 w-4" />}
        title="Day of Week"
        description={
          peak.count > 0
            ? `Most active on ${peak.day} · ${peak.count} messages`
            : 'Activity by weekday'
        }
      />
      <div className="mt-4">
        <ChartContainer config={DOW_CONFIG} className="h-[220px] w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              allowDecimals={false}
              fontSize={10}
            />
            <YAxis
              type="category"
              dataKey="day"
              tickLine={false}
              axisLine={false}
              width={36}
              fontSize={11}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {chartData.map((d) => (
                <Cell
                  key={d.day}
                  fill={d.isPeak ? '#f59e0b' : 'var(--color-count)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </Card>
  )
}

// (f) Response time trend — LineChart with avg ReferenceLine
function ResponseTimeTrendChart({ data }: { data: StatsResponseTimePoint[] }) {
  const chartData = React.useMemo(
    () =>
      data.map((p, i) => ({
        idx: i + 1,
        replyMs: p.replyMs,
        timestamp: p.timestamp,
      })),
    [data],
  )

  const avg = React.useMemo(() => {
    if (data.length === 0) return 0
    return Math.round(data.reduce((s, p) => s + p.replyMs, 0) / data.length)
  }, [data])

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<Activity className="h-4 w-4" />}
        title="Response Time Trend"
        description={`AI reply speed over the last ${data.length} replies · avg ${formatResponseTime(avg)}`}
      />
      <div className="mt-4">
        {chartData.length < 2 ? (
          <div className="flex h-[220px] w-full items-center justify-center text-xs text-muted-foreground">
            Not enough AI reply logs yet — need at least 2 data points.
          </div>
        ) : (
          <ChartContainer config={RESPONSE_TREND_CONFIG} className="h-[220px] w-full">
            <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="idx"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={10}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                fontSize={10}
                tickFormatter={(v: number) => formatResponseTime(v)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={(value) => (
                      <span className="font-mono tabular-nums text-foreground">
                        {formatResponseTime(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <ReferenceLine
                y={avg}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: `avg ${formatResponseTime(avg)}`,
                  position: 'insideTopRight',
                  fill: '#f59e0b',
                  fontSize: 10,
                }}
              />
              <Line
                dataKey="replyMs"
                type="monotone"
                stroke="var(--color-replyMs)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--color-replyMs)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </Card>
  )
}

// (g) Source distribution — Donut/PieChart
function SourceDistributionChart({ data }: { data: StatsSourceBucket[] }) {
  const total = data.reduce((s, d) => s + d.count, 0)

  const chartData = React.useMemo(
    () =>
      data
        .filter((d) => d.count > 0)
        .map((d) => ({
          name: d.source,
          value: d.count,
          fill: SOURCE_PIE_COLORS[d.source] ?? '#a3a3a3',
        })),
    [data],
  )

  const SOURCE_LABELS: Record<string, string> = {
    ai: 'AI replies',
    owner: 'You (owner)',
    customer: 'Customer',
  }

  const config: ChartConfig = React.useMemo(
    () =>
      Object.fromEntries(
        data.map((d) => [
          d.source,
          {
            label: SOURCE_LABELS[d.source] ?? d.source,
            color: SOURCE_PIE_COLORS[d.source] ?? '#a3a3a3',
          },
        ]),
      ),
    [data],
  )

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<BarChart3 className="h-4 w-4" />}
        title="Source Distribution"
        description="Who sent what · AI vs You vs Customer"
      />
      <div className="mt-4">
        {chartData.length === 0 || total === 0 ? (
          <div className="flex h-[220px] w-full items-center justify-center text-xs text-muted-foreground">
            No messages yet.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <ChartContainer config={config} className="h-[200px] w-[200px]">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      formatter={(value, name) => {
                        const v = Number(value)
                        const pct = total > 0 ? Math.round((v / total) * 100) : 0
                        return (
                          <span className="font-mono tabular-nums text-foreground">
                            {SOURCE_LABELS[String(name)] ?? name}: {v} ({pct}%)
                          </span>
                        )
                      }}
                    />
                  }
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            {/* Legend with counts */}
            <div className="flex w-full flex-col gap-1.5 sm:w-auto">
              {data.map((d) => {
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0
                const color = SOURCE_PIE_COLORS[d.source] ?? '#a3a3a3'
                return (
                  <div
                    key={d.source}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium">
                        {SOURCE_LABELS[d.source] ?? d.source}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold tabular-nums">{d.count}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  </div>
                )
              })}
              <div className="mt-0.5 flex items-center justify-between gap-3 px-2.5 text-[10px] text-muted-foreground">
                <span>Total</span>
                <span className="font-semibold tabular-nums text-foreground">{total}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// (h) Conversation Flow — custom rhythm visualization
function ConversationFlowViz({ flow }: { flow: StatsConversationFlowPoint[] }) {
  // Take the most recent 20 messages so the rhythm chart stays readable.
  const recent = React.useMemo(() => flow.slice(-20), [flow])

  const maxGap = React.useMemo(() => {
    let m = 0
    for (const p of recent) if (p.gap_minutes > m) m = p.gap_minutes
    return m
  }, [recent])

  // Bar width is proportional to the gap (logarithmic scale so a 1-minute gap
  // and a 3-day gap both remain visible). Min 8% so even tiny gaps render.
  const widthFor = (gap: number) => {
    if (gap <= 0) return 6
    if (maxGap <= 0) return 6
    const log = Math.log10(gap + 1)
    const logMax = Math.log10(maxGap + 1)
    return 6 + 94 * (log / (logMax || 1))
  }

  return (
    <Card className={CARD_CLS}>
      <SectionHeader
        icon={<Activity className="h-4 w-4" />}
        title="Conversation Flow"
        description="Recent 20 messages · bar width = time gap since previous"
      />
      <div className="mt-4 space-y-1">
        {recent.length === 0 ? (
          <div className="flex h-[220px] w-full items-center justify-center text-xs text-muted-foreground">
            No messages yet.
          </div>
        ) : (
          recent.map((p, i) => {
            const isIn = p.direction === 'in'
            const widthPct = widthFor(p.gap_minutes)
            const gapLabel =
              p.gap_minutes <= 0
                ? 'first'
                : p.gap_minutes < 60
                  ? `${p.gap_minutes}m`
                  : p.gap_minutes < 60 * 24
                    ? `${Math.round(p.gap_minutes / 60)}h ${p.gap_minutes % 60}m`
                    : `${Math.round(p.gap_minutes / (60 * 24))}d`
            return (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span
                  className={cn(
                    'w-7 shrink-0 text-right tabular-nums',
                    isIn ? 'text-emerald-400' : 'text-teal-400',
                  )}
                >
                  {isIn ? 'IN' : 'OUT'}
                </span>
                <div className="flex h-4 flex-1 items-center">
                  <div
                    className={cn(
                      'h-3 rounded-sm transition-all',
                      isIn ? 'bg-emerald-500/80' : 'bg-teal-500/80',
                    )}
                    style={{ width: `${widthPct}%` }}
                    title={`${formatDateTime(p.timestamp)} · gap ${gapLabel}`}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                  {gapLabel}
                </span>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" /> Incoming (customer)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-teal-500/80" /> Outgoing (AI / you)
        </span>
        <span className="ml-auto">Bar width = time since previous message</span>
      </div>
    </Card>
  )
}

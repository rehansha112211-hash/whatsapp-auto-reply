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
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
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
  timestamp: string
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatResponseTime(ms: number): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
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
              />
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

  const exportCsv = () => {
    const rows = messages.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      direction: m.direction,
      source: m.source,
      status: m.status,
      read: m.read ? 'yes' : 'no',
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
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {messages.length} messages · read-only timeline
        </div>
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
                return (
                  <div
                    key={m.id}
                    className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        isOutgoing
                          ? m.source === 'owner'
                            ? 'rounded-br-sm bg-sky-500/20 text-sky-50'
                            : 'rounded-br-sm bg-emerald-500/20 text-emerald-50'
                          : 'rounded-bl-sm bg-muted text-foreground',
                      )}
                    >
                      {isOutgoing && (
                        <div className="mb-1 flex items-center justify-end gap-1">
                          <SourceBadge source={m.source as MessageSource} />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
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
}: {
  contactId: string
  contact: ProfileContact
  onChanged: () => void
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
          <Label className="text-xs">Language</Label>
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

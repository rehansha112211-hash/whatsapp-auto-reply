'use client'

import * as React from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Clock,
  Flame,
  MessageCircle,
  MessagesSquare,
  PieChart as PieChartIcon,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { LeadBadge, StatusDot, WhatsAppStatusBadge } from '@/components/status'
import { apiGet } from '@/lib/api-client'
import {
  colorFromString,
  formatDateTime,
  formatUptime,
  initials,
  timeAgo,
} from '@/lib/format'
import type { ChatListItem, DashboardStats, ViewKey } from '@/lib/types'
import { cn } from '@/lib/utils'

// Local type for notification list items returned by /api/notifications
interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  severity: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: string
}

const SEVERITY_DOT: Record<NotificationItem['severity'], string> = {
  info: 'bg-teal-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-rose-500',
}

const AI_STATE_MAP: Record<DashboardStats['aiStatus'], 'ok' | 'error' | 'untested'> = {
  ok: 'ok',
  error: 'error',
  untested: 'untested',
}

// Defensive array extraction — supports plain arrays or { items | notifications | chats | data | rows }
function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of ['items', 'notifications', 'chats', 'data', 'rows']) {
      if (Array.isArray(obj[key])) return obj[key] as T[]
    }
  }
  return []
}

const CARD_CLS =
  'rounded-xl border bg-card/60 backdrop-blur p-4 gap-3 hover:border-primary/40 transition-colors shadow-sm'

// ----------------------------------------------------------------
// Stat card shell — consistent icon + label header
// ----------------------------------------------------------------
function StatCard({
  icon,
  label,
  accent,
  children,
}: {
  icon: React.ReactNode
  label: string
  accent?: string
  children: React.ReactNode
}) {
  return (
    <Card className={CARD_CLS}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn(
            'grid h-8 w-8 place-items-center rounded-lg',
            accent ?? 'bg-emerald-500/15 text-emerald-300',
          )}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {children}
    </Card>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
      <span className="opacity-40">{icon}</span>
      <p className="text-xs">{text}</p>
    </div>
  )
}

// ----------------------------------------------------------------
// Last 7 Days — trends section (4 charts)
// ----------------------------------------------------------------
interface TrendDay {
  date: string
  label: string
  incoming: number
  outgoing: number
  ai: number
  owner: number
  newContacts: number
}
interface CategoryCount {
  category: string
  count: number
}
interface LeadBucket {
  range: string
  count: number
}
interface TrendsData {
  days: TrendDay[]
  byCategory: CategoryCount[]
  leadDistribution: LeadBucket[]
}

// Chart configs — map each series key to a label + CSS color.
// ChartContainer injects `--color-<key>` CSS vars for use in strokes/fills.
const AREA_CONFIG: ChartConfig = {
  incoming: { label: 'Incoming', color: '#10b981' }, // emerald-500
  outgoing: { label: 'Outgoing', color: '#14b8a6' }, // teal-500
}
const BAR_CONFIG: ChartConfig = {
  ai: { label: 'AI Replies', color: '#34d399' }, // emerald-400
  owner: { label: 'Owner Replies', color: '#38bdf8' }, // sky-400
}
const LEAD_PIE_CONFIG: ChartConfig = {
  cold: { label: 'Cold (0-24)', color: '#71717a' }, // zinc-500
  warm: { label: 'Warm (25-49)', color: '#f59e0b' }, // amber-500
  hot: { label: 'Hot (50-74)', color: '#f97316' }, // orange-500
  flame: { label: 'Flame (75-100)', color: '#10b981' }, // emerald-500
}
const SOURCES_CONFIG: ChartConfig = {
  count: { label: 'Contacts', color: '#14b8a6' }, // teal-500
}

const LEAD_PIE_COLORS = ['#71717a', '#f59e0b', '#f97316', '#10b981']
const LEAD_PIE_KEYS = ['cold', 'warm', 'hot', 'flame'] as const

function ChartCardShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn(CARD_CLS, 'flex flex-col')}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
          {icon}
        </span>
        <span className="truncate">{title}</span>
      </div>
      <div className="mt-2 flex-1">{children}</div>
    </Card>
  )
}

function ChartSkeleton() {
  return (
    <div className="flex h-[220px] w-full items-end justify-around gap-2 px-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton
          key={i}
          className="w-full rounded-md"
          style={{ height: `${30 + ((i * 13) % 70)}%` }}
        />
      ))}
    </div>
  )
}

function MessagesAreaChart({ data }: { data: TrendDay[] }) {
  return (
    <ChartContainer config={AREA_CONFIG} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillIncoming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-incoming)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-incoming)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="fillOutgoing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-outgoing)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-outgoing)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Legend />
        <Area
          dataKey="incoming"
          type="monotone"
          stroke="var(--color-incoming)"
          fill="url(#fillIncoming)"
          strokeWidth={2}
          dot={false}
        />
        <Area
          dataKey="outgoing"
          type="monotone"
          stroke="var(--color-outgoing)"
          fill="url(#fillOutgoing)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

function RepliesBarChart({ data }: { data: TrendDay[] }) {
  return (
    <ChartContainer config={BAR_CONFIG} className="h-[220px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Legend />
        <Bar dataKey="ai" fill="var(--color-ai)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="owner" fill="var(--color-owner)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

function LeadDistributionPie({ data }: { data: LeadBucket[] }) {
  // The API returns buckets in fixed order: 0-24, 25-49, 50-74, 75-100.
  // Re-map to friendly keys so the legend + tooltip pick up our config.
  const chartData = data.map((b, i) => ({
    range: b.range,
    count: b.count,
    key: LEAD_PIE_KEYS[i] ?? 'cold',
  }))

  return (
    <ChartContainer config={LEAD_PIE_CONFIG} className="h-[220px] w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" indicator="dot" />} />
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="key"
          innerRadius={48}
          outerRadius={80}
          paddingAngle={2}
          stroke="none"
        >
          {chartData.map((entry, i) => (
            <Cell key={entry.range} fill={LEAD_PIE_COLORS[i] ?? LEAD_PIE_COLORS[0]} />
          ))}
        </Pie>
        <Legend />
      </PieChart>
    </ChartContainer>
  )
}

function LeadSourcesBar({ data }: { data: CategoryCount[] }) {
  // Horizontal bar — show up to 8 categories so the chart stays legible.
  const rows = data.slice(0, 8)
  // Friendly labels: title-case the snake_case category names.
  const labelled = rows.map((r) => ({
    ...r,
    label: r.category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  }))

  if (labelled.length === 0) {
    return (
      <div className="flex h-[220px] w-full items-center justify-center text-xs text-muted-foreground">
        No categories detected yet
      </div>
    )
  }

  return (
    <ChartContainer config={SOURCES_CONFIG} className="h-[220px] w-full">
      <BarChart
        data={labelled}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={92}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

function TrendsSection() {
  const [trends, setTrends] = React.useState<TrendsData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await apiGet<TrendsData>('/api/dashboard/trends')
        if (active) {
          setTrends(data)
          setLoading(false)
        }
      } catch {
        if (active) setLoading(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  return (
    <section aria-label="Last 7 days trends" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Last 7 Days</h2>
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            7d
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Auto-refreshes every 30s
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading && !trends ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className={cn(CARD_CLS, 'flex flex-col')}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="mt-3">
                <ChartSkeleton />
              </div>
            </Card>
          ))
        ) : trends ? (
          <>
            <ChartCardShell
              icon={<TrendingUp className="h-4 w-4" />}
              title="Messages — Incoming vs Outgoing"
            >
              <MessagesAreaChart data={trends.days} />
            </ChartCardShell>

            <ChartCardShell
              icon={<BarChart3 className="h-4 w-4" />}
              title="Replies — AI vs Owner"
            >
              <RepliesBarChart data={trends.days} />
            </ChartCardShell>

            <ChartCardShell
              icon={<Flame className="h-4 w-4" />}
              title="Lead Score Distribution"
            >
              <LeadDistributionPie data={trends.leadDistribution} />
            </ChartCardShell>

            <ChartCardShell
              icon={<PieChartIcon className="h-4 w-4" />}
              title="Lead Sources by Category"
            >
              <LeadSourcesBar data={trends.byCategory} />
            </ChartCardShell>
          </>
        ) : (
          <Card className={cn(CARD_CLS, 'col-span-full')}>
            <EmptyState
              icon={<Tag className="h-5 w-5" />}
              text="Trends unavailable — try again in a moment."
            />
          </Card>
        )}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------
// Individual stat cards
// ----------------------------------------------------------------
function WhatsAppStatusCard({
  stats,
  onNavigate,
}: {
  stats: DashboardStats
  onNavigate?: (v: ViewKey) => void
}) {
  const connected = stats.whatsappState === 'connected'
  const sessionUptimeSec = stats.connectedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(stats.connectedAt).getTime()) / 1000),
      )
    : 0
  return (
    <Card className={CARD_CLS}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/25 to-teal-500/15 text-emerald-300">
          <MessageCircle className="h-4 w-4" />
        </span>
        <span className="truncate">WhatsApp Status</span>
      </div>
      <div className="flex flex-col gap-2">
        <WhatsAppStatusBadge state={stats.whatsappState} />
        {connected ? (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {stats.connectedName && (
              <div className="truncate font-medium text-foreground/80">
                {stats.connectedName}
              </div>
            )}
            {stats.connectedNumber && (
              <div className="font-mono text-[11px]">{stats.connectedNumber}</div>
            )}
            <div>Since {formatDateTime(stats.connectedAt)}</div>
            <div className="text-emerald-300/80">
              Session {formatUptime(sessionUptimeSec)}
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => onNavigate?.('whatsapp')}
            className="mt-1 w-full gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            Connect WhatsApp
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  )
}

function TodayMessagesCard({ stats }: { stats: DashboardStats }) {
  return (
    <StatCard icon={<Activity className="h-4 w-4" />} label="Today's Messages">
      <div className="flex flex-col gap-1">
        <div className="text-3xl font-bold tabular-nums">{stats.todayMessages}</div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Bot className="h-3 w-3 text-emerald-300" />
            AI {stats.aiReplies}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3 text-teal-300" />
            Owner {stats.ownerReplies}
          </span>
        </div>
      </div>
    </StatCard>
  )
}

function TotalContactsCard({ stats }: { stats: DashboardStats }) {
  return (
    <StatCard
      icon={<Users className="h-4 w-4" />}
      label="Total Contacts"
      accent="bg-teal-500/15 text-teal-300"
    >
      <div className="flex flex-col gap-1">
        <div className="text-3xl font-bold tabular-nums">{stats.totalContacts}</div>
        <div className="inline-flex items-center gap-1 text-[11px] text-emerald-300/90">
          <TrendingUp className="h-3 w-3" />
          +{stats.newCustomersToday} new today
        </div>
      </div>
    </StatCard>
  )
}

function HotLeadsCard({
  stats,
  onNavigate,
}: {
  stats: DashboardStats
  onNavigate?: (v: ViewKey) => void
}) {
  return (
    <StatCard
      icon={<Flame className="h-4 w-4" />}
      label="Hot Leads"
      accent="bg-amber-500/15 text-amber-300"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{stats.hotLeads}</span>
          <span className="text-[11px] text-muted-foreground">score ≥ 70</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onNavigate?.('leads')}
          className="w-full gap-1.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          View leads
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </StatCard>
  )
}

function AiRepliesCard({ stats }: { stats: DashboardStats }) {
  return (
    <StatCard
      icon={<Bot className="h-4 w-4" />}
      label="AI Replies (today)"
      accent="bg-emerald-500/15 text-emerald-300"
    >
      <div className="flex flex-col gap-1">
        <div className="text-3xl font-bold tabular-nums">{stats.aiReplies}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StatusDot state={AI_STATE_MAP[stats.aiStatus]} pulse={stats.aiStatus === 'ok'} />
          <span className="truncate font-mono">
            {stats.aiProvider}/{stats.aiModel}
          </span>
        </div>
      </div>
    </StatCard>
  )
}

function SystemUptimeCard({ stats }: { stats: DashboardStats }) {
  const operational = stats.dbStatus === 'ok'
  return (
    <StatCard
      icon={<Clock className="h-4 w-4" />}
      label="System Uptime"
      accent="bg-teal-500/15 text-teal-300"
    >
      <div className="flex flex-col gap-1">
        <div className="text-3xl font-bold tabular-nums">
          {formatUptime(stats.uptimeSec)}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StatusDot state={stats.dbStatus} pulse={operational} />
          <span className={operational ? 'text-emerald-300/90' : 'text-rose-300'}>
            {operational ? 'System operational' : 'Database issue'}
          </span>
        </div>
      </div>
    </StatCard>
  )
}

// ----------------------------------------------------------------
// Recent activity (notifications)
// ----------------------------------------------------------------
function RecentActivityCard({ notifications }: { notifications: NotificationItem[] }) {
  return (
    <Card className={CARD_CLS}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
            <Bell className="h-4 w-4" />
          </span>
          Recent Activity
        </div>
        <span className="text-[11px] text-muted-foreground">
          {notifications.length} recent
        </span>
      </div>
      <div className="-mr-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
        {notifications.length === 0 ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} text="No recent notifications" />
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li
                key={n.id}
                className="flex gap-3 rounded-lg border border-border/50 bg-background/40 p-2.5 transition-colors hover:bg-background/70"
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    SEVERITY_DOT[n.severity] ?? 'bg-zinc-400',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  {n.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ----------------------------------------------------------------
// Recent conversations
// ----------------------------------------------------------------
function RecentConversationsCard({
  conversations,
  onNavigate,
}: {
  conversations: ChatListItem[]
  onNavigate?: (v: ViewKey) => void
}) {
  return (
    <Card className={CARD_CLS}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
            <MessagesSquare className="h-4 w-4" />
          </span>
          Recent Conversations
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.('chats')}
          className="text-[11px] text-emerald-300 transition-colors hover:text-emerald-200"
        >
          View all
        </button>
      </div>
      <div className="-mr-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
        {conversations.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-5 w-5" />}
            text="No conversations yet"
          />
        ) : (
          <ul className="space-y-1.5">
            {conversations.map((c) => (
              <li key={c.contactId}>
                <button
                  type="button"
                  onClick={() => onNavigate?.('chats')}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-primary/30 hover:bg-background/60"
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                      colorFromString(c.name),
                    )}
                  >
                    {initials(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {c.lastMessage || '—'}
                      </p>
                      <LeadBadge score={c.leadScore} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ----------------------------------------------------------------
// Main dashboard view
// ----------------------------------------------------------------
export function DashboardView({ onNavigate }: { onNavigate?: (v: ViewKey) => void }) {
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])
  const [conversations, setConversations] = React.useState<ChatListItem[]>([])
  const [loading, setLoading] = React.useState(true)

  // Poll dashboard stats every 5s
  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await apiGet<DashboardStats>('/api/dashboard')
        if (active) {
          setStats(data)
          setLoading(false)
        }
      } catch {
        if (active) setLoading(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 5000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  // Poll recent notifications every 10s
  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await apiGet<unknown>('/api/notifications?limit=8')
        if (active) setNotifications(asArray<NotificationItem>(data))
      } catch {
        // route may not yet be deployed by another agent — keep previous data
      }
    }
    void load()
    const id = setInterval(() => void load(), 10000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  // Poll recent conversations every 10s
  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await apiGet<unknown>('/api/chats?limit=6')
        if (active) setConversations(asArray<ChatListItem>(data))
      } catch {
        // route may not yet be deployed by another agent — keep previous data
      }
    }
    void load()
    const id = setInterval(() => void load(), 10000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real-time overview of your WhatsApp AI auto-reply platform
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </div>
      </header>

      {/* Stat cards grid */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {loading && !stats ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))
        ) : stats ? (
          <>
            <WhatsAppStatusCard stats={stats} onNavigate={onNavigate} />
            <TodayMessagesCard stats={stats} />
            <TotalContactsCard stats={stats} />
            <HotLeadsCard stats={stats} onNavigate={onNavigate} />
            <AiRepliesCard stats={stats} />
            <SystemUptimeCard stats={stats} />
          </>
        ) : null}
      </section>

      {/* Last 7 days — 4 charts (area + bar + pie + horizontal bar) */}
      <TrendsSection />

      {/* Recent activity + recent conversations */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentActivityCard notifications={notifications} />
        <RecentConversationsCard conversations={conversations} onNavigate={onNavigate} />
      </section>
    </div>
  )
}

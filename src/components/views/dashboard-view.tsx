'use client'

import * as React from 'react'
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Clock,
  Flame,
  MessageCircle,
  MessagesSquare,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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

      {/* Recent activity + recent conversations */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentActivityCard notifications={notifications} />
        <RecentConversationsCard conversations={conversations} onNavigate={onNavigate} />
      </section>
    </div>
  )
}

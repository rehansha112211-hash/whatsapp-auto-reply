'use client'

// ============================================================
// AnalyticsView — deep-insights dashboard for QorvixNode WA Auto Reply.
//
// Pulls a comprehensive payload from /api/analytics (every 30s) and renders:
//   1. Overview KPIs (6 cards) — contacts, messages, AI/owner replies,
//      avg response time, conversion rate.
//   2. Response Time Trend (LineChart, 7d) + AI vs Owner (stacked BarChart, 7d).
//   3. Peak Hours — full-width bar chart, peak hour highlighted with callout.
//   4. Conversion Funnel — custom 5-stage horizontal funnel (divs).
//   5. Category Breakdown (horizontal BarChart) + Language Distribution (Donut).
//   6. Contact Growth — 14-day Area chart (newContacts + newMessages).
//   7. Top Contacts — top-5 by message count.
//
// Every section is wrapped in a staggered framer-motion fade-in.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Activity,
  Award,
  BarChart3,
  Bot,
  Clock,
  Flame,
  Globe,
  MessageSquare,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'

import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'
import {
  colorFromString,
  formatDateTime,
  initials,
  leadBadge,
  timeAgo,
} from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

// ---------------------------------------------------------------------------
// API payload types (mirrors /api/analytics/route.ts)
// ---------------------------------------------------------------------------
interface OverviewPayload {
  totalContacts: number
  totalMessages: number
  aiReplies: number
  ownerReplies: number
  avgResponseMs: number
  conversionRate: number
  hotLeadRate: number
}
interface ResponseTrendPoint { date: string; avgMs: number }
interface AiVsOwnerPoint { day: string; ai: number; owner: number }
interface PeakHourPoint { hour: string; count: number }
interface FunnelStage { stage: string; count: number }
interface CategoryBreakdownRow { category: string; count: number; avgScore: number }
interface TopContactRow {
  id: string
  name: string
  phone: string
  leadScore: number
  messageCount: number
  lastMessageAt: string | null
}
interface GrowthTrendPoint { date: string; newContacts: number; newMessages: number }
interface LanguageRow { language: string; count: number }

interface AnalyticsPayload {
  overview: OverviewPayload
  responseTimeTrend: ResponseTrendPoint[]
  aiVsOwner: AiVsOwnerPoint[]
  peakHours: PeakHourPoint[]
  leadFunnel: FunnelStage[]
  categoryBreakdown: CategoryBreakdownRow[]
  topContacts: TopContactRow[]
  growthTrend: GrowthTrendPoint[]
  languageDistribution: LanguageRow[]
}

// ---------------------------------------------------------------------------
// Chart configs — each series maps to a label + WhatsApp-green color.
// ChartContainer injects `--color-<key>` CSS vars usable in strokes/fills.
// ---------------------------------------------------------------------------
const RESPONSE_TIME_CONFIG: ChartConfig = {
  avgMs: { label: 'Avg Response', color: '#10b981' }, // emerald-500
}
const AI_OWNER_CONFIG: ChartConfig = {
  ai: { label: 'AI Replies', color: '#34d399' }, // emerald-400
  owner: { label: 'Owner Replies', color: '#38bdf8' }, // sky-400 (owner series)
}
const PEAK_HOURS_CONFIG: ChartConfig = {
  count: { label: 'Messages', color: '#14b8a6' }, // teal-500
}
const CATEGORY_CONFIG: ChartConfig = {
  count: { label: 'Contacts', color: '#14b8a6' }, // teal-500
}
const GROWTH_CONFIG: ChartConfig = {
  newContacts: { label: 'New Contacts', color: '#10b981' }, // emerald-500
  newMessages: { label: 'New Messages', color: '#f59e0b' }, // amber-500
}
const LANGUAGE_CONFIG: ChartConfig = {
  count: { label: 'Contacts', color: '#14b8a6' },
}

// Donut palette — emerald / teal / amber / orange / cyan / lime / zinc.
const LANGUAGE_COLORS = [
  '#10b981', '#14b8a6', '#f59e0b', '#f97316',
  '#06b6d4', '#84cc16', '#71717a', '#fb7185',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatResponseTime(ms: number): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatHourLabel(hh: string): string {
  const h = Number(hh)
  if (!Number.isFinite(h)) return hh
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${period}`
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Shared shells
// ---------------------------------------------------------------------------
const CARD_CLS = 'rounded-xl border bg-card/60 backdrop-blur p-5 shadow-sm card-hover'

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description?: string
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 pb-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="flex h-[240px] w-full items-end justify-around gap-2 px-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton
          key={i}
          className="w-full rounded-md"
          style={{ height: `${30 + ((i * 17) % 70)}%` }}
        />
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-[240px] w-full items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  )
}

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
      <div className="mt-3 flex-1">{children}</div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 1 — Overview KPIs
// ---------------------------------------------------------------------------
interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  accent: string // tailwind gradient classes
  index: number
}

function KpiCard({ icon, label, value, sub, accent, index }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS, 'relative overflow-hidden')}>
        <div
          className={cn(
            'pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl',
            accent,
          )}
        />
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg',
              accent,
            )}
          >
            {icon}
          </span>
        </div>
        <div className="mt-3 text-3xl font-bold tabular-nums leading-none">
          {value}
        </div>
        <div className="mt-1.5 text-xs font-medium text-muted-foreground">
          {label}
        </div>
        {sub && <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>}
      </Card>
    </motion.div>
  )
}

function OverviewSection({ data }: { data: OverviewPayload }) {
  const total = data.aiReplies + data.ownerReplies
  const aiPct = total > 0 ? Math.round((data.aiReplies / total) * 100) : 0
  const ownerPct = total > 0 ? Math.round((data.ownerReplies / total) * 100) : 0

  const kpis: KpiCardProps[] = [
    {
      icon: <Users className="h-4 w-4" />,
      label: 'Total Contacts',
      value: <AnimatedCounter value={data.totalContacts} />,
      sub: <span className="inline-flex items-center gap-1 text-emerald-400"><TrendingUp className="h-3 w-3" />All-time</span>,
      accent: 'bg-emerald-500/15 text-emerald-300',
      index: 0,
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: 'Total Messages',
      value: <AnimatedCounter value={data.totalMessages} />,
      sub: <span className="inline-flex items-center gap-1 text-emerald-400"><TrendingUp className="h-3 w-3" />All-time</span>,
      accent: 'bg-teal-500/15 text-teal-300',
      index: 1,
    },
    {
      icon: <Bot className="h-4 w-4" />,
      label: 'AI Replies',
      value: <AnimatedCounter value={data.aiReplies} />,
      sub: <span>{aiPct}% of replies</span>,
      accent: 'bg-emerald-500/15 text-emerald-300',
      index: 2,
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: 'Owner Replies',
      value: <AnimatedCounter value={data.ownerReplies} />,
      sub: <span>{ownerPct}% of replies</span>,
      accent: 'bg-sky-500/15 text-sky-300',
      index: 3,
    },
    {
      icon: <Clock className="h-4 w-4" />,
      label: 'Avg Response Time',
      value: formatResponseTime(data.avgResponseMs),
      sub: <span className="inline-flex items-center gap-1 text-emerald-400"><Zap className="h-3 w-3" />AI engine</span>,
      accent: 'bg-amber-500/15 text-amber-300',
      index: 4,
    },
    {
      icon: <Target className="h-4 w-4" />,
      label: 'Conversion Rate',
      value: <><AnimatedCounter value={data.conversionRate} />%</>,
      sub: (
        <span className="inline-flex items-center gap-1">
          <Flame className="h-3 w-3 text-emerald-400" />
          {data.hotLeadRate}% hot leads
        </span>
      ),
      accent: 'bg-emerald-500/15 text-emerald-300',
      index: 5,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<Activity className="h-4 w-4" />}
          title="Overview"
          description="Real-time totals across all conversations"
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      </Card>
    </motion.div>
  )
}

function OverviewSkeleton() {
  return (
    <Card className={cn(CARD_CLS)}>
      <div className="flex items-center gap-3 border-b border-border/60 pb-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className={cn(CARD_CLS)}>
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Response Time Trend (LineChart) + AI vs Owner (BarChart)
// ---------------------------------------------------------------------------
function ResponseTimeLineChart({ data }: { data: ResponseTrendPoint[] }) {
  const hasData = data.some((p) => p.avgMs > 0)
  if (!hasData) {
    return <EmptyState text="No AI response-time data yet — send a message via the Simulator to populate this chart." />
  }
  return (
    <ChartContainer config={RESPONSE_TIME_CONFIG} className="h-[240px] w-full">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="rtLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-avgMs)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--color-avgMs)" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)}
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
        <Line
          dataKey="avgMs"
          type="monotone"
          stroke="url(#rtLine)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: 'var(--color-avgMs)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  )
}

function AiVsOwnerBarChart({ data }: { data: AiVsOwnerPoint[] }) {
  const hasData = data.some((p) => p.ai > 0 || p.owner > 0)
  if (!hasData) {
    return <EmptyState text="No reply data for the last 7 days yet." />
  }
  return (
    <ChartContainer config={AI_OWNER_CONFIG} className="h-[240px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Legend />
        <Bar dataKey="ai" stackId="a" fill="var(--color-ai)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="owner" stackId="a" fill="var(--color-owner)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

function ChartsRow1Section({
  responseTrend,
  aiVsOwner,
}: {
  responseTrend: ResponseTrendPoint[]
  aiVsOwner: AiVsOwnerPoint[]
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<TrendingUp className="h-4 w-4" />}
          title="Response Performance"
          description="AI response speed and AI vs owner reply mix over the last 7 days"
        />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCardShell
            icon={<Clock className="h-4 w-4" />}
            title="Response Time Trend (7 days)"
          >
            <ResponseTimeLineChart data={responseTrend} />
          </ChartCardShell>
          <ChartCardShell
            icon={<Bot className="h-4 w-4" />}
            title="AI vs Owner Replies (7 days)"
          >
            <AiVsOwnerBarChart data={aiVsOwner} />
          </ChartCardShell>
        </div>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Peak Hours (full-width BarChart with peak hour callout)
// ---------------------------------------------------------------------------
function PeakHoursSection({ data }: { data: PeakHourPoint[] }) {
  const peakIdx = data.reduce(
    (best, cur, idx) => (cur.count > data[best]!.count ? idx : best),
    0,
  )
  const peak = data[peakIdx]
  const peakLabel = peak ? formatHourLabel(peak.hour) : '—'
  const peakCount = peak?.count ?? 0
  const hasData = data.some((p) => p.count > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<Activity className="h-4 w-4" />}
          title="Peak Hours"
          description="Message volume by hour of day — when your audience is most active"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <Zap className="h-3 w-3" />
              Peak: {peakLabel} ({peakCount} msgs)
            </span>
            <span className="text-[11px] text-muted-foreground">
              24-hour distribution · local time
            </span>
          </div>
        </div>
        <div className="mt-3">
          {!hasData ? (
            <EmptyState text="No message-timestamp data yet — peak hours will appear here." />
          ) : (
            <ChartContainer config={PEAK_HOURS_CONFIG} className="h-[240px] w-full">
              <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="hour"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={0}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => {
                    const h = Number(v)
                    if (h % 3 !== 0) return ''
                    return v
                  }}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(_, payload) => {
                        const hour = payload?.[0]?.payload?.hour
                        return hour ? formatHourLabel(String(hour)) : ''
                      }}
                    />
                  }
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.map((entry, idx) => (
                    <Cell
                      key={entry.hour}
                      fill={idx === peakIdx ? '#f59e0b' : 'var(--color-count)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — Conversion Funnel (custom divs)
// ---------------------------------------------------------------------------
function FunnelSection({ data }: { data: FunnelStage[] }) {
  const total = data[0]?.count ?? 0
  const totalOrOne = total > 0 ? total : 1

  // Gradient stops emerald → teal for the 5 stages.
  const stageColors = [
    'from-emerald-500 to-emerald-600',
    'from-emerald-500 to-teal-600',
    'from-teal-500 to-teal-600',
    'from-teal-500 to-cyan-600',
    'from-cyan-500 to-cyan-700',
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<Target className="h-4 w-4" />}
          title="Conversion Funnel"
          description="From first contact all the way to closed customer"
        />
        <div className="mt-4 flex flex-col gap-3">
          {data.map((stage, idx) => {
            const pct = Math.round((stage.count / totalOrOne) * 100)
            const width = total > 0 ? Math.max(pct, 6) : 0
            return (
              <div key={stage.stage} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{stage.stage}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{stage.count.toLocaleString()}</span>
                    <span className="mx-1.5 text-muted-foreground/60">·</span>
                    <span>{total > 0 ? `${pct}%` : '—'}</span>
                  </span>
                </div>
                <div className="h-7 w-full overflow-hidden rounded-lg bg-muted/40">
                  <div
                    className={cn(
                      'flex h-full items-center rounded-lg bg-gradient-to-r shadow-sm transition-all duration-500',
                      stageColors[idx] ?? stageColors[0],
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {total === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            No contacts yet — the funnel will populate as conversations arrive.
          </p>
        )}
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section 5 — Category Breakdown + Language Distribution
// ---------------------------------------------------------------------------
function CategoryBarChart({ data }: { data: CategoryBreakdownRow[] }) {
  const rows = data.slice(0, 8)
  const labelled = rows.map((r) => ({
    ...r,
    label: titleCase(r.category),
  }))
  if (labelled.length === 0) {
    return <EmptyState text="No service categories detected yet." />
  }
  return (
    <ChartContainer config={CATEGORY_CONFIG} className="h-[240px] w-full">
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
          width={100}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, _name, item) => {
                const avg = (item?.payload as CategoryBreakdownRow | undefined)?.avgScore
                return (
                  <span className="font-mono tabular-nums text-foreground">
                    {value} contacts{avg != null ? ` · avg ${avg}` : ''}
                  </span>
                )
              }}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

function LanguageDonut({ data }: { data: LanguageRow[] }) {
  const labelled = data.map((r) => ({
    ...r,
    label: titleCase(r.language),
  }))
  if (labelled.length === 0) {
    return <EmptyState text="No language data available." />
  }
  return (
    <ChartContainer config={LANGUAGE_CONFIG} className="h-[240px] w-full">
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent nameKey="label" indicator="dot" />}
        />
        <Pie
          data={labelled}
          dataKey="count"
          nameKey="label"
          innerRadius={48}
          outerRadius={80}
          paddingAngle={2}
          stroke="none"
        >
          {labelled.map((entry, i) => (
            <Cell
              key={entry.language}
              fill={LANGUAGE_COLORS[i % LANGUAGE_COLORS.length]}
            />
          ))}
        </Pie>
        <Legend />
      </PieChart>
    </ChartContainer>
  )
}

function ChartsRow2Section({
  categories,
  languages,
}: {
  categories: CategoryBreakdownRow[]
  languages: LanguageRow[]
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<Globe className="h-4 w-4" />}
          title="Audience Breakdown"
          description="Which services prospects ask about and the languages they use"
        />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCardShell
            icon={<BarChart3 className="h-4 w-4" />}
            title="Contacts by Service Category"
          >
            <CategoryBarChart data={categories} />
          </ChartCardShell>
          <ChartCardShell
            icon={<Globe className="h-4 w-4" />}
            title="Language Distribution"
          >
            <LanguageDonut data={languages} />
          </ChartCardShell>
        </div>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section 6 — Contact Growth (14-day Area chart, 2 series)
// ---------------------------------------------------------------------------
function GrowthAreaChart({ data }: { data: GrowthTrendPoint[] }) {
  const hasData = data.some((p) => p.newContacts > 0 || p.newMessages > 0)
  if (!hasData) {
    return <EmptyState text="No growth activity in the last 14 days yet." />
  }
  return (
    <ChartContainer config={GROWTH_CONFIG} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="growContacts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-newContacts)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-newContacts)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="growMessages" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-newMessages)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-newMessages)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Legend />
        <Area
          dataKey="newContacts"
          type="monotone"
          stroke="var(--color-newContacts)"
          fill="url(#growContacts)"
          strokeWidth={2}
          dot={false}
        />
        <Area
          dataKey="newMessages"
          type="monotone"
          stroke="var(--color-newMessages)"
          fill="url(#growMessages)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

function GrowthSection({ data }: { data: GrowthTrendPoint[] }) {
  const totalContacts14 = data.reduce((s, p) => s + p.newContacts, 0)
  const totalMessages14 = data.reduce((s, p) => s + p.newMessages, 0)
  const lastDay = data[data.length - 1]
  const prevDay = data[data.length - 2]
  const todayContacts = lastDay?.newContacts ?? 0
  const yesterdayContacts = prevDay?.newContacts ?? 0
  const delta = todayContacts - yesterdayContacts
  const trendUp = delta > 0
  const trendDown = delta < 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<TrendingUp className="h-4 w-4" />}
          title="Contact Growth"
          description="New contacts and new messages over the last 14 days"
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="text-[11px] text-muted-foreground">New contacts (14d)</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {totalContacts14.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="text-[11px] text-muted-foreground">New messages (14d)</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {totalMessages14.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="text-[11px] text-muted-foreground">Today vs yesterday</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
              {todayContacts}
              {trendUp && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-400">
                  <TrendingUp className="h-3 w-3" />+{delta}
                </span>
              )}
              {trendDown && (
                <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-400">
                  <TrendingDown className="h-3 w-3" />{delta}
                </span>
              )}
              {!trendUp && !trendDown && (
                <span className="text-xs font-medium text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <GrowthAreaChart data={data} />
        </div>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Section 7 — Top Contacts (table)
// ---------------------------------------------------------------------------
function TopContactsSection({ data }: { data: TopContactRow[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.25 }}
    >
      <Card className={cn(CARD_CLS)}>
        <SectionHeader
          icon={<Award className="h-4 w-4" />}
          title="Top Contacts"
          description="The 5 most engaged contacts by message count"
        />
        <div className="mt-4">
          {data.length === 0 ? (
            <EmptyState text="No contact activity yet." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="text-right">Last Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((c, idx) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-center text-xs font-semibold text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                              colorFromString(c.name || c.phone),
                            )}
                          >
                            {initials(c.name || c.phone)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{c.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {c.phone}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={cn('tabular-nums', leadBadge(c.leadScore))}
                        >
                          {c.leadScore}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {c.messageCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {c.lastMessageAt ? (
                          <span title={formatDateTime(c.lastMessageAt)}>
                            {timeAgo(c.lastMessageAt)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main view component
// ---------------------------------------------------------------------------
export function AnalyticsView() {
  const [data, setData] = React.useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const payload = await apiGet<AnalyticsPayload>('/api/analytics')
        if (active) {
          setData(payload)
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics')
          setLoading(false)
        }
      }
    }
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  // Show toast on hard error once.
  React.useEffect(() => {
    if (error) {
      toast.error('Analytics load failed', { description: error })
    }
  }, [error])

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <OverviewSkeleton />
        <Card className={CARD_CLS}>
          <Skeleton className="h-9 w-48 rounded-lg" />
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className={CARD_CLS}>
              <Skeleton className="h-8 w-40 rounded-lg" />
              <div className="mt-3"><ChartSkeleton /></div>
            </Card>
            <Card className={CARD_CLS}>
              <Skeleton className="h-8 w-40 rounded-lg" />
              <div className="mt-3"><ChartSkeleton /></div>
            </Card>
          </div>
        </Card>
        <Card className={CARD_CLS}>
          <Skeleton className="h-9 w-48 rounded-lg" />
          <div className="mt-4"><ChartSkeleton /></div>
        </Card>
        <Card className={CARD_CLS}>
          <Skeleton className="h-9 w-48 rounded-lg" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <Card className={cn(CARD_CLS, 'flex flex-col items-center gap-3 py-12')}>
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">Analytics unavailable</div>
        <p className="text-xs text-muted-foreground">
          {error ?? 'Please try again in a moment.'}
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <OverviewSection data={data.overview} />
      <ChartsRow1Section
        responseTrend={data.responseTimeTrend}
        aiVsOwner={data.aiVsOwner}
      />
      <PeakHoursSection data={data.peakHours} />
      <FunnelSection data={data.leadFunnel} />
      <ChartsRow2Section
        categories={data.categoryBreakdown}
        languages={data.languageDistribution}
      />
      <GrowthSection data={data.growthTrend} />
      <TopContactsSection data={data.topContacts} />
    </div>
  )
}

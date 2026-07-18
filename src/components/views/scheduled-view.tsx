'use client'

// ============================================================
// ScheduledView — owner-authored scheduled messages.
//
// Layout:
//   · Header + "New Scheduled Message" button
//   · Stats row (Pending / Sent today / Cancelled)
//   · Tabs: Pending | Sent | All
//   · New/Edit dialog: contact picker, message textarea, datetime
//     picker with quick-pick chips, schedule button.
//
// Auto-processing:
//   The view polls POST /api/scheduled/process every 30s to send any
//   due messages. A subtle "Auto-processing ON" pill shows this.
//   Polling is paused while the document is hidden (no tab focus) to
//   avoid burning CPU in background tabs; it resumes on visibility.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Clock,
  Calendar,
  Send,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Bell,
  Search,
  Loader2,
  RefreshCw,
  Inbox,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { formatDateTime, timeAgo, colorFromString, initials } from '@/lib/format'
import type { ViewKey, ScheduledMessageRow, ChatListItem } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AnimatedCounter } from '@/components/ui/animated-counter'

// ------------------------------------------------------------
// Constants & helpers
// ------------------------------------------------------------
const MAX_MESSAGE = 1000
const POLL_PROCESS_MS = 30_000

type ScheduledStatus = 'pending' | 'sent' | 'cancelled' | 'failed'

interface ProcessResponse {
  ok: boolean
  processed: number
  failed?: number
}

function statusBadge(s: ScheduledStatus): { label: string; cls: string } {
  switch (s) {
    case 'pending':
      return {
        label: 'Pending',
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      }
    case 'sent':
      return {
        label: 'Sent',
        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
      }
    case 'failed':
      return {
        label: 'Failed',
        cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      }
    default:
      return {
        label: s,
        cls: 'bg-muted text-muted-foreground border-border',
      }
  }
}

// Time-until badge for pending rows.
function timeUntilBadge(dateStr: string): { label: string; cls: string } {
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const diffMs = target - now
  if (diffMs <= 0) {
    return { label: 'Overdue', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
  }
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(diffMs / 60_000))
    return { label: `in ${mins}m`, cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    const hours = Math.round(diffMs / (60 * 60 * 1000))
    return { label: `in ${hours}h`, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
  }
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
  return { label: `in ${days}d`, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
}

// Convert a Date to a string suitable for <input type="datetime-local">.
// datetime-local expects 'YYYY-MM-DDTHH:MM' in the *local* timezone
// (no Z), so we build it from local components.
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function isSentToday(sentAt: string | null): boolean {
  if (!sentAt) return false
  return new Date(sentAt).getTime() >= startOfToday().getTime()
}

// Quick-pick presets used in the dialog.
function quickPicks(): { label: string; date: Date }[] {
  const now = new Date()
  const in1h = new Date(now.getTime() + 60 * 60 * 1000)
  const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000)

  const tomorrow9 = new Date(now)
  tomorrow9.setDate(now.getDate() + 1)
  tomorrow9.setHours(9, 0, 0, 0)

  const nextMonday9 = new Date(now)
  const dayOfWeek = now.getDay() // 0 = Sun ... 6 = Sat
  const daysUntilMonday = ((1 + 7 - dayOfWeek) % 7) || 7 // next Monday
  nextMonday9.setDate(now.getDate() + daysUntilMonday)
  nextMonday9.setHours(9, 0, 0, 0)

  return [
    { label: 'In 1 hour', date: in1h },
    { label: 'In 3 hours', date: in3h },
    { label: 'Tomorrow 9 AM', date: tomorrow9 },
    { label: 'Next Monday 9 AM', date: nextMonday9 },
  ]
}

// ------------------------------------------------------------
// Avatar (small, self-contained — same colour system as chats-view)
// ------------------------------------------------------------
function Avatar({ name, phone }: { name: string; phone: string }) {
  const cls = colorFromString(name || phone)
  return (
    <div
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold',
        cls,
      )}
      aria-hidden
    >
      {initials(name || phone)}
    </div>
  )
}

// ------------------------------------------------------------
// Main view
// ------------------------------------------------------------
export function ScheduledView({ onNavigate }: { onNavigate?: (v: ViewKey) => void }) {
  const [items, setItems] = React.useState<ScheduledMessageRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ScheduledMessageRow | null>(null)
  const [autoProcessingOn, setAutoProcessingOn] = React.useState(true)

  // --- Fetch the scheduled-message list ---
  const fetchItems = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const d = await apiGet<{ items: ScheduledMessageRow[] }>('/api/scheduled')
        setItems(d.items ?? [])
      } catch (err) {
        toast.error('Failed to load scheduled messages', {
          description: err instanceof Error ? err.message : undefined,
        })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [],
  )

  React.useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  // --- Auto-processing poll (POST /api/scheduled/process every 30s) ---
  // Pause when the tab is hidden — saves CPU/network in background tabs.
  const processDue = React.useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const res = await apiPost<ProcessResponse>('/api/scheduled/process')
      if (res.processed > 0) {
        toast.success(`Processed ${res.processed} scheduled message${res.processed === 1 ? '' : 's'}`, {
          description: res.failed ? `${res.failed} failed` : undefined,
        })
        await fetchItems({ silent: true })
      }
    } catch {
      // Non-fatal — poll again next tick.
    }
  }, [fetchItems])

  React.useEffect(() => {
    if (!autoProcessingOn) return
    void processDue()
    const id = setInterval(() => void processDue(), POLL_PROCESS_MS)
    return () => clearInterval(id)
  }, [autoProcessingOn, processDue])

  // --- Handlers ---
  const handleOpenNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (row: ScheduledMessageRow) => {
    setEditing(row)
    setDialogOpen(true)
  }

  const handleCancel = async (row: ScheduledMessageRow) => {
    try {
      await apiDelete(`/api/scheduled/${encodeURIComponent(row.id)}`)
      setItems((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: 'cancelled' } : r)),
      )
      toast.success('Scheduled message cancelled')
    } catch (err) {
      toast.error('Failed to cancel', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleSaved = (row: ScheduledMessageRow, isNew: boolean) => {
    setItems((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id)
      if (idx === -1) return [row, ...prev]
      const next = [...prev]
      next[idx] = row
      return next
    })
    setDialogOpen(false)
    setEditing(null)
    toast.success(isNew ? 'Message scheduled' : 'Scheduled message updated')
  }

  // --- Derived stats ---
  const pendingCount = items.filter((i) => i.status === 'pending').length
  const sentTodayCount = items.filter(
    (i) => i.status === 'sent' && isSentToday(i.sentAt),
  ).length
  const cancelledCount = items.filter((i) => i.status === 'cancelled').length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <Clock className="h-5 w-5 text-emerald-400" />
            Scheduled Messages
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose a message now, send it automatically at a future time. Due
            messages are sent by a background processor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchItems()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={handleOpenNew}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Scheduled Message</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard
          label="Pending"
          value={pendingCount}
          icon={<Clock className="h-4 w-4 text-amber-400" />}
          accent="border-amber-500/20"
        />
        <StatCard
          label="Sent today"
          value={sentTodayCount}
          icon={<Check className="h-4 w-4 text-emerald-400" />}
          accent="border-emerald-500/20"
        />
        <StatCard
          label="Cancelled"
          value={cancelledCount}
          icon={<X className="h-4 w-4 text-zinc-400" />}
          accent="border-zinc-500/20"
        />
      </motion.div>

      {/* Auto-processing indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-flex h-2 w-2 rounded-full',
            autoProcessingOn ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500',
          )}
        />
        <span>Auto-processing {autoProcessingOn ? 'ON' : 'PAUSED'}</span>
        <span className="text-zinc-600">·</span>
        <span>Checks every 30s for due messages</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-[10px]"
          onClick={() => setAutoProcessingOn((v) => !v)}
        >
          {autoProcessingOn ? 'Pause' : 'Resume'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="pending" className="flex-1 sm:flex-none">
            <Clock className="mr-1.5 h-4 w-4" /> Pending
            {pendingCount > 0 && (
              <Badge className="ml-1.5 bg-amber-500/15 text-amber-300 border-amber-500/30 px-1.5 py-0 text-[10px]">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1 sm:flex-none">
            <Check className="mr-1.5 h-4 w-4" /> Sent
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1 sm:flex-none">
            <Bell className="mr-1.5 h-4 w-4" /> All
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingTab
            items={items.filter((i) => i.status === 'pending')}
            loading={loading}
            onEdit={handleOpenEdit}
            onCancel={handleCancel}
            onNavigate={onNavigate}
          />
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          <SentTab
            items={items.filter((i) => i.status === 'sent' || i.status === 'failed')}
            loading={loading}
            onNavigate={onNavigate}
          />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AllTab
            items={items}
            loading={loading}
            onEdit={handleOpenEdit}
            onCancel={handleCancel}
            onNavigate={onNavigate}
          />
        </TabsContent>
      </Tabs>

      {/* New / edit dialog */}
      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditing(null)
        }}
        editing={editing}
        onSaved={handleSaved}
      />
    </div>
  )
}

// ------------------------------------------------------------
// StatCard
// ------------------------------------------------------------
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Card className={cn('rounded-xl border bg-card/60 p-5 backdrop-blur card-hover', accent)}>
      <CardContent className="flex items-center justify-between p-0">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            <AnimatedCounter value={value} />
          </div>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted/60">
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// Empty state
// ------------------------------------------------------------
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/30 p-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  )
}

// ------------------------------------------------------------
// Row
// ------------------------------------------------------------
function Row({
  row,
  onEdit,
  onCancel,
  onNavigate,
}: {
  row: ScheduledMessageRow
  onEdit?: (row: ScheduledMessageRow) => void
  onCancel?: (row: ScheduledMessageRow) => void
  onNavigate?: (v: ViewKey) => void
}) {
  const badge = statusBadge(row.status)
  const timeBadge =
    row.status === 'pending' ? timeUntilBadge(row.scheduledAt) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border bg-card/60 p-4 backdrop-blur card-hover hover:border-emerald-500/40 hover:bg-card/80"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          onClick={() => onNavigate?.('chats')}
          title="Open chats"
          aria-label={`Open chats with ${row.contactName}`}
        >
          <Avatar name={row.contactName} phone={row.contactPhone} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {row.contactName}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.contactPhone}
            </span>
            <Badge className={cn('px-1.5 py-0 text-[10px] font-semibold', badge.cls)}>
              {badge.label}
            </Badge>
            {timeBadge && (
              <Badge className={cn('px-1.5 py-0 text-[10px] font-semibold', timeBadge.cls)}>
                {timeBadge.label}
              </Badge>
            )}
          </div>

          <p className="mt-1.5 line-clamp-2 text-sm text-foreground/80">
            {row.text}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateTime(row.scheduledAt)}
            </span>
            {row.sentAt && (
              <span className="inline-flex items-center gap-1">
                <Send className="h-3 w-3" />
                Sent {timeAgo(row.sentAt)}
              </span>
            )}
            <span>Created {timeAgo(row.createdAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {row.status === 'pending' && onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(row)}
              aria-label="Edit scheduled message"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {row.status === 'pending' && onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={() => void onCancel(row)}
              aria-label="Cancel scheduled message"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ------------------------------------------------------------
// Pending tab
// ------------------------------------------------------------
function PendingTab({
  items,
  loading,
  onEdit,
  onCancel,
  onNavigate,
}: {
  items: ScheduledMessageRow[]
  loading: boolean
  onEdit: (row: ScheduledMessageRow) => void
  onCancel: (row: ScheduledMessageRow) => void
  onNavigate?: (v: ViewKey) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState message="No pending scheduled messages. Create one to see it here." />
    )
  }
  return (
    <ScrollArea className="max-h-[60vh] pr-3">
      <div className="flex flex-col gap-3">
        {items.map((row) => (
          <Row
            key={row.id}
            row={row}
            onEdit={onEdit}
            onCancel={onCancel}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

// ------------------------------------------------------------
// Sent tab
// ------------------------------------------------------------
function SentTab({
  items,
  loading,
  onNavigate,
}: {
  items: ScheduledMessageRow[]
  loading: boolean
  onNavigate?: (v: ViewKey) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (items.length === 0) {
    return <EmptyState message="No sent or failed scheduled messages yet." />
  }
  return (
    <ScrollArea className="max-h-[60vh] pr-3">
      <div className="flex flex-col gap-3">
        {items.map((row) => (
          <Row key={row.id} row={row} onNavigate={onNavigate} />
        ))}
      </div>
    </ScrollArea>
  )
}

// ------------------------------------------------------------
// All tab
// ------------------------------------------------------------
function AllTab({
  items,
  loading,
  onEdit,
  onCancel,
  onNavigate,
}: {
  items: ScheduledMessageRow[]
  loading: boolean
  onEdit: (row: ScheduledMessageRow) => void
  onCancel: (row: ScheduledMessageRow) => void
  onNavigate?: (v: ViewKey) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState message="No scheduled messages. Create your first one to get started." />
    )
  }
  return (
    <ScrollArea className="max-h-[60vh] pr-3">
      <div className="flex flex-col gap-3">
        {items.map((row) => (
          <Row
            key={row.id}
            row={row}
            onEdit={onEdit}
            onCancel={onCancel}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

// ------------------------------------------------------------
// Schedule dialog (create + edit share this form)
// ------------------------------------------------------------
interface ScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ScheduledMessageRow | null
  onSaved: (row: ScheduledMessageRow, isNew: boolean) => void
}

function ScheduleDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: ScheduleDialogProps) {
  const isEdit = !!editing

  const [contactId, setContactId] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [text, setText] = React.useState('')
  const [scheduledAt, setScheduledAt] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // Reset form when dialog opens (with editing seed if provided).
  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setContactId(editing.contactId)
      setContactName(editing.contactName)
      setText(editing.text)
      setScheduledAt(toDatetimeLocalValue(new Date(editing.scheduledAt)))
    } else {
      // Default to "in 1 hour"
      setContactId('')
      setContactName('')
      setText('')
      setScheduledAt(toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)))
    }
  }, [open, editing])

  const canSubmit =
    !saving && !!contactId && !!text.trim() && !!scheduledAt

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      if (isEdit && editing) {
        const res = await apiPatch<{ item: ScheduledMessageRow }>(
          `/api/scheduled/${encodeURIComponent(editing.id)}`,
          { text: text.trim(), scheduledAt: new Date(scheduledAt).toISOString() },
        )
        onSaved(res.item, false)
      } else {
        const res = await apiPost<{ item: ScheduledMessageRow }>(
          '/api/scheduled',
          {
            contactId,
            text: text.trim(),
            scheduledAt: new Date(scheduledAt).toISOString(),
          },
        )
        onSaved(res.item, true)
      }
    } catch (err) {
      toast.error(isEdit ? 'Failed to update' : 'Failed to schedule', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-emerald-400" />
            {isEdit ? 'Edit scheduled message' : 'Schedule a message'}
          </DialogTitle>
          <DialogDescription>
            The message will be sent automatically at the chosen time as long
            as auto-processing is on.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Contact picker */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-contact">Recipient</Label>
            <ContactPicker
              selectedId={contactId}
              selectedName={contactName}
              disabled={isEdit}
              onSelect={(c) => {
                setContactId(c.contactId)
                setContactName(c.name)
              }}
            />
          </div>

          {/* Message */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sched-text">Message</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {text.length}/{MAX_MESSAGE}
              </span>
            </div>
            <Textarea
              id="sched-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE))}
              placeholder="Type the message to send later…"
              className="min-h-24 resize-none text-sm"
            />
          </div>

          {/* Schedule date/time */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-at">Send at</Label>
            <Input
              id="sched-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="bg-background text-sm [color-scheme:dark]"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickPicks().map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setScheduledAt(toDatetimeLocalValue(p.date))}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            {isEdit ? 'Save changes' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// ContactPicker — searchable combobox over /api/chats
// ------------------------------------------------------------
interface ContactPickerProps {
  selectedId: string
  selectedName: string
  disabled?: boolean
  onSelect: (c: { contactId: string; name: string; phone: string }) => void
}

function ContactPicker({
  selectedId,
  selectedName,
  disabled,
  onSelect,
}: ContactPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [contacts, setContacts] = React.useState<ChatListItem[]>([])
  const [loading, setLoading] = React.useState(false)

  // Load contacts lazily when the picker is opened.
  const loadContacts = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await apiGet<{ items: ChatListItem[] }>('/api/chats?limit=100')
      setContacts(d.items ?? [])
    } catch {
      /* best-effort */
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open && contacts.length === 0) {
      void loadContacts()
    }
  }, [open, contacts.length, loadContacts])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    )
  }, [contacts, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
          aria-label="Select recipient"
        >
          <span className="flex items-center gap-2 truncate">
            {selectedId ? (
              <>
                <Avatar name={selectedName} phone="" />
                <span className="truncate">{selectedName}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Select a contact…</span>
            )}
          </span>
          <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <div className="flex flex-col">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="h-8 pl-7 text-xs"
                autoFocus
              />
            </div>
          </div>
          <ScrollArea className="max-h-64">
            {loading ? (
              <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No contacts found.
              </div>
            ) : (
              <ul className="flex flex-col py-1">
                {filtered.map((c) => (
                  <li key={c.contactId}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted',
                        c.contactId === selectedId && 'bg-muted/60',
                      )}
                      onClick={() => {
                        onSelect({
                          contactId: c.contactId,
                          name: c.name,
                          phone: c.phone,
                        })
                        setOpen(false)
                        setSearch('')
                      }}
                    >
                      <Avatar name={c.name} phone={c.phone} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {c.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {c.phone}
                        </span>
                      </span>
                      {c.contactId === selectedId && (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}

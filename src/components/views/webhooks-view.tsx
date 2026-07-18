'use client'

// ============================================================
// WebhooksView — outgoing webhook / API integration manager.
//
// Layout:
//   · Header + "New Webhook" button
//   · Info banner explaining the integration model
//   · Webhook list — each card shows name, active toggle, URL,
//     event badges, delivery stats bar, and action buttons:
//     Test / Deliveries / Edit / Regenerate Secret / Delete
//   · Empty state with a hint to integrate Zapier / n8n / Slack
//
// Dialogs:
//   · New/Edit — name, URL, events checklist, auto-generated secret
//     with one-time view + copy button
//   · Deliveries — recent delivery table with expandable payload,
//     status codes, response snippets. Auto-refreshes every 10s.
//   · Secret reveal — one-time view of a freshly generated secret.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Webhook as WebhookIcon,
  Plus,
  Pencil,
  Trash2,
  Send,
  Check,
  X,
  Copy,
  RefreshCw,
  Eye,
  Activity,
  Zap,
  Inbox,
  Loader2,
  ShieldAlert,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { formatDateTime, timeAgo } from '@/lib/format'
import {
  WEBHOOK_EVENTS,
  type WebhookListItem,
  type WebhookDeliveryRow,
  type WebhookEventCategory,
} from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ------------------------------------------------------------
// Event category → badge color mapping
// (message=emerald, lead=amber, owner=rose, ai=violet, whatsapp=teal, contact=sky)
// ------------------------------------------------------------
const CATEGORY_BADGE: Record<WebhookEventCategory, string> = {
  message: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  lead: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  owner: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  ai: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  whatsapp: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  contact: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
}

function eventDef(value: string) {
  return WEBHOOK_EVENTS.find((e) => e.value === value)
}

function eventBadgeClass(value: string): string {
  const def = eventDef(value)
  if (!def) return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
  return CATEGORY_BADGE[def.category]
}

function eventLabel(value: string): string {
  return eventDef(value)?.label ?? value
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
const POLL_DELIVERIES_MS = 10_000
const MAX_URL = 2048
const MAX_NAME = 80

// ------------------------------------------------------------
// Main view
// ------------------------------------------------------------
export function WebhooksView() {
  const [webhooks, setWebhooks] = React.useState<WebhookListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<WebhookListItem | null>(null)
  const [deliveriesFor, setDeliveriesFor] = React.useState<WebhookListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<WebhookListItem | null>(null)

  const fetchWebhooks = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const d = await apiGet<{ items: WebhookListItem[] }>('/api/webhooks')
        setWebhooks(d.items)
      } catch (err) {
        toast.error('Failed to load webhooks', {
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
    void fetchWebhooks()
  }, [fetchWebhooks])

  const handleOpenNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const handleOpenEdit = (w: WebhookListItem) => {
    setEditing(w)
    setEditorOpen(true)
  }

  const handleToggleActive = async (w: WebhookListItem, next: boolean) => {
    // Optimistic update
    setWebhooks((prev) =>
      prev.map((x) => (x.id === w.id ? { ...x, isActive: next } : x)),
    )
    try {
      await apiPatch(`/api/webhooks/${w.id}`, { isActive: next })
      toast.success(`Webhook ${next ? 'enabled' : 'disabled'}`)
    } catch (err) {
      // Revert
      setWebhooks((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, isActive: !next } : x)),
      )
      toast.error('Failed to update webhook', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleTest = async (w: WebhookListItem) => {
    const tid = toast.loading(`Sending test to ${w.name}…`)
    try {
      const res = await apiPost<{ ok: boolean; statusCode: number; response: string }>(
        `/api/webhooks/${w.id}/test`,
      )
      if (res.ok) {
        toast.success('Test delivered', {
          id: tid,
          description: `HTTP ${res.statusCode} · ${res.response.slice(0, 80) || 'empty body'}`,
        })
      } else {
        toast.error('Test failed', {
          id: tid,
          description: `HTTP ${res.statusCode || '—'} · ${res.response.slice(0, 120) || 'no response'}`,
        })
      }
      void fetchWebhooks({ silent: true })
    } catch (err) {
      toast.error('Test request failed', {
        id: tid,
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/webhooks/${deleteTarget.id}`)
      toast.success('Webhook deleted')
      setDeleteTarget(null)
      void fetchWebhooks({ silent: true })
    } catch (err) {
      toast.error('Failed to delete webhook', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <WebhookIcon className="h-5 w-5 text-emerald-400" />
            Webhooks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send real-time event data to external services like Zapier, n8n, Make.com, or any HTTP endpoint.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchWebhooks({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleOpenNew}>
            <Plus className="h-4 w-4" />
            New Webhook
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <Card className="rounded-xl border-emerald-500/20 bg-emerald-500/[0.04]">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
            <Zap className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              How webhooks work
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              When events happen (new message, hot lead, AI error, etc.), we&apos;ll POST a JSON
              payload to your URL. Verify the{' '}
              <code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] text-emerald-200">
                X-QorvixNode-Signature
              </code>{' '}
              header by computing an HMAC-SHA256 of the raw request body using your secret.
            </p>
            <a
              href="#"
              className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
              onClick={(e) => e.preventDefault()}
            >
              Read the docs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Webhook list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : webhooks.length === 0 ? (
        <EmptyState onCreate={handleOpenNew} />
      ) : (
        <div className="grid gap-4">
          {webhooks.map((w, i) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
            >
              <WebhookCard
                webhook={w}
                onToggle={(next) => void handleToggleActive(w, next)}
                onTest={() => void handleTest(w)}
                onEdit={() => handleOpenEdit(w)}
                onShowDeliveries={() => setDeliveriesFor(w)}
                onDelete={() => setDeleteTarget(w)}
                onMutated={() => void fetchWebhooks({ silent: true })}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* New/Edit dialog */}
      <WebhookEditorDialog
        open={editorOpen}
        editing={editing}
        onOpenChange={(v) => {
          setEditorOpen(v)
          if (!v) setEditing(null)
        }}
        onSaved={() => {
          setEditorOpen(false)
          setEditing(null)
          void fetchWebhooks({ silent: true })
        }}
      />

      {/* Deliveries dialog */}
      <DeliveriesDialog
        webhook={deliveriesFor}
        onOpenChange={(v) => {
          if (!v) setDeliveriesFor(null)
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-400" />
              Delete webhook
            </AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
              All delivery history for this webhook will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => void handleConfirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================
// Empty state
// ============================================================
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="rounded-xl border-dashed border-emerald-500/20 bg-card/40">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
          <Inbox className="h-7 w-7" />
        </div>
        <div className="max-w-md">
          <p className="text-base font-medium text-foreground">No webhooks configured</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first webhook to integrate with Zapier, n8n, Slack, or any HTTP endpoint.
            Receive real-time events as JSON payloads, signed with HMAC.
          </p>
        </div>
        <Button onClick={onCreate} className="mt-2">
          <Plus className="h-4 w-4" />
          Create Webhook
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Webhook card
// ============================================================
interface WebhookCardProps {
  webhook: WebhookListItem
  onToggle: (next: boolean) => void
  onTest: () => void
  onEdit: () => void
  onShowDeliveries: () => void
  onDelete: () => void
  onMutated: () => void
}

function WebhookCard({
  webhook,
  onToggle,
  onTest,
  onEdit,
  onShowDeliveries,
  onDelete,
  onMutated,
}: WebhookCardProps) {
  const [regenerating, setRegenerating] = React.useState(false)
  const [revealSecret, setRevealSecret] = React.useState<string | null>(null)

  const total = webhook.deliveries.total
  const delivered = webhook.deliveries.delivered
  const failed = webhook.deliveries.failed
  const pending = Math.max(0, total - delivered - failed)
  const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res = await apiPost<{ ok: boolean; secret: string }>(
        `/api/webhooks/${webhook.id}/secret`,
      )
      setRevealSecret(res.secret)
      toast.success('Secret regenerated', {
        description: 'The old secret stops working immediately.',
      })
      onMutated()
    } catch (err) {
      toast.error('Failed to regenerate secret', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
      <CardContent className="flex flex-col gap-4 p-5">
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-foreground">
                {webhook.name}
              </h3>
              {webhook.isActive ? (
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active
                </Badge>
              ) : (
                <Badge className="bg-zinc-500/15 text-zinc-300 border-zinc-500/30">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  Paused
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono truncate max-w-[280px] sm:max-w-[420px]">
                {webhook.url}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label
              htmlFor={`wh-active-${webhook.id}`}
              className="text-[11px] text-muted-foreground"
            >
              {webhook.isActive ? 'Enabled' : 'Disabled'}
            </Label>
            <Switch
              id={`wh-active-${webhook.id}`}
              checked={webhook.isActive}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        </div>

        {/* Event badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {webhook.events.length === 0 ? (
            <Badge className="bg-zinc-500/15 text-zinc-300 border-zinc-500/30">
              All events
            </Badge>
          ) : (
            webhook.events.map((e) => (
              <Badge
                key={e}
                variant="outline"
                className={cn('font-mono text-[10px]', eventBadgeClass(e))}
                title={eventDef(e)?.description}
              >
                {eventLabel(e)}
              </Badge>
            ))
          )}
        </div>

        <Separator />

        {/* Delivery stats */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <Check className="h-3.5 w-3.5" />
              <span className="font-semibold tabular-nums">{delivered}</span>
              <span className="text-muted-foreground">delivered</span>
            </span>
            <span className="inline-flex items-center gap-1 text-rose-300">
              <X className="h-3.5 w-3.5" />
              <span className="font-semibold tabular-nums">{failed}</span>
              <span className="text-muted-foreground">failed</span>
            </span>
            {pending > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Activity className="h-3.5 w-3.5" />
                <span className="font-semibold tabular-nums">{pending}</span>
                <span className="text-muted-foreground">pending</span>
              </span>
            )}
            {webhook.deliveries.lastDeliveryAt && (
              <span className="text-muted-foreground">
                · last {timeAgo(webhook.deliveries.lastDeliveryAt)}
              </span>
            )}
          </div>
          {/* Delivery bar */}
          {total > 0 && (
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500"
                style={{ width: `${(delivered / total) * 100}%` }}
              />
              <div
                className="bg-rose-500"
                style={{ width: `${(failed / total) * 100}%` }}
              />
              <div
                className="bg-amber-500/70"
                style={{ width: `${(pending / total) * 100}%` }}
              />
            </div>
          )}
          {total > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Success rate{' '}
              <span
                className={cn(
                  'font-medium tabular-nums',
                  successRate >= 90
                    ? 'text-emerald-300'
                    : successRate >= 50
                      ? 'text-amber-300'
                      : 'text-rose-300',
                )}
              >
                {successRate}%
              </span>{' '}
              over last {total} {total === 1 ? 'delivery' : 'deliveries'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onTest}>
            <Send className="h-3.5 w-3.5" />
            Test
          </Button>
          <Button size="sm" variant="outline" onClick={onShowDeliveries}>
            <Activity className="h-3.5 w-3.5" />
            Deliveries
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', regenerating && 'animate-spin')} />
                <span className="hidden sm:inline">Secret</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Regenerate HMAC secret</TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            variant="outline"
            className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </CardContent>

      {/* Secret reveal dialog (after regenerate) */}
      <SecretRevealDialog
        secret={revealSecret}
        onOpenChange={(v) => {
          if (!v) setRevealSecret(null)
        }}
      />
    </Card>
  )
}

// ============================================================
// New / Edit webhook dialog
// ============================================================
interface WebhookEditorProps {
  open: boolean
  editing: WebhookListItem | null
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

function WebhookEditorDialog({
  open,
  editing,
  onOpenChange,
  onSaved,
}: WebhookEditorProps) {
  const isEdit = !!editing
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [events, setEvents] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [createdSecret, setCreatedSecret] = React.useState<string | null>(null)

  // Reset form when dialog opens
  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setUrl(editing.url)
      setEvents(editing.events)
    } else {
      setName('')
      setUrl('')
      setEvents([])
    }
    setCreatedSecret(null)
  }, [open, editing])

  const toggleEvent = (value: string) => {
    setEvents((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value],
    )
  }

  const valid =
    name.trim().length > 0 &&
    name.length <= MAX_NAME &&
    /^https?:\/\/.+/i.test(url.trim()) &&
    url.length <= MAX_URL &&
    !saving

  const handleSave = async () => {
    if (!valid) return
    setSaving(true)
    try {
      if (isEdit && editing) {
        await apiPatch(`/api/webhooks/${editing.id}`, {
          name: name.trim(),
          url: url.trim(),
          events,
        })
        toast.success('Webhook updated')
        onSaved()
      } else {
        const res = await apiPost<{
          ok: boolean
          webhook: WebhookListItem
          warning?: string
        }>('/api/webhooks', {
          name: name.trim(),
          url: url.trim(),
          events,
        })
        if (res.warning) {
          toast.warning('Webhook created', { description: res.warning })
        } else {
          toast.success('Webhook created')
        }
        setCreatedSecret(res.webhook.secret)
      }
    } catch (err) {
      toast.error(isEdit ? 'Failed to update webhook' : 'Failed to create webhook', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog
        open={open && !createdSecret}
        onOpenChange={(v) => {
          if (!saving) onOpenChange(v)
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WebhookIcon className="h-4 w-4 text-emerald-400" />
              {isEdit ? 'Edit webhook' : 'New webhook'}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the webhook configuration. The secret can be regenerated separately.'
                : 'Configure a new outbound webhook endpoint. A signing secret will be auto-generated.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                placeholder="e.g. Zapier — Lead to CRM"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME}
              />
              <p className="text-[11px] text-muted-foreground">
                A friendly label to identify this webhook.
              </p>
            </div>

            {/* URL */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url"
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={MAX_URL}
                className="font-mono text-sm"
                inputMode="url"
                autoComplete="url"
              />
              <p className="text-[11px] text-muted-foreground">
                Must be a valid <code>http</code> or <code>https</code> URL. We POST JSON to this endpoint.
              </p>
            </div>

            {/* Events */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Events</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setEvents(WEBHOOK_EVENTS.map((e) => e.value))}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setEvents([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Select which events trigger this webhook. Leave empty to subscribe to all events.
              </p>
              <ScrollArea className="max-h-72 rounded-lg border">
                <div className="flex flex-col divide-y">
                  {WEBHOOK_EVENTS.map((ev) => {
                    const checked = events.includes(ev.value)
                    return (
                      <label
                        key={ev.value}
                        htmlFor={`ev-${ev.value}`}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50',
                          checked && 'bg-emerald-500/[0.04]',
                        )}
                      >
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            id={`ev-${ev.value}`}
                            onClick={(e) => {
                              e.preventDefault()
                              toggleEvent(ev.value)
                            }}
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                              checked
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-input bg-transparent',
                            )}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </button>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {ev.label}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-mono text-[10px]',
                                CATEGORY_BADGE[ev.category],
                              )}
                            >
                              {ev.category}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {ev.description}
                          </p>
                          <code className="font-mono text-[10px] text-emerald-300/80">
                            {ev.value}
                          </code>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Secret note */}
            {!isEdit && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <p className="text-[11px] text-muted-foreground">
                  A signing secret will be auto-generated. Use it to verify the{' '}
                  <code className="font-mono text-emerald-200">X-QorvixNode-Signature</code> header on incoming requests.
                  The full secret is shown once after creation — copy it somewhere safe.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={!valid}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret reveal after create */}
      <SecretRevealDialog
        secret={createdSecret}
        title="Webhook created"
        description="Your new webhook is ready. Copy the signing secret below — you won't see it again."
        onOpenChange={(v) => {
          if (!v) {
            setCreatedSecret(null)
            onSaved()
          }
        }}
      />
    </>
  )
}

// ============================================================
// Secret reveal dialog (one-time view)
// ============================================================
interface SecretRevealProps {
  secret: string | null
  title?: string
  description?: string
  onOpenChange: (v: boolean) => void
}

function SecretRevealDialog({
  secret,
  title = 'New signing secret',
  description,
  onOpenChange,
}: SecretRevealProps) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!secret) setCopied(false)
  }, [secret])

  const handleCopy = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      toast.success('Secret copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  return (
    <Dialog
      open={!!secret}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ??
              'This is your new HMAC signing secret. The old one stops working immediately.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
            <strong className="font-semibold">This secret won&apos;t be shown again.</strong>{' '}
            Copy it now and store it securely (e.g. in your secrets manager).
          </div>

          <div className="flex items-stretch gap-2">
            <Input
              readOnly
              value={secret ?? ''}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button onClick={() => void handleCopy()} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            To verify a webhook request, compute an HMAC-SHA256 of the raw request body using this secret,
            then compare (in constant time) to the value sent in the{' '}
            <code className="font-mono">X-QorvixNode-Signature</code> header.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>I&apos;ve saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Deliveries dialog
// ============================================================
interface DeliveriesDialogProps {
  webhook: WebhookListItem | null
  onOpenChange: (v: boolean) => void
}

function DeliveriesDialog({ webhook, onOpenChange }: DeliveriesDialogProps) {
  const [items, setItems] = React.useState<WebhookDeliveryRow[]>([])
  const [loading, setLoading] = React.useState(false)

  const fetchDeliveries = React.useCallback(async () => {
    if (!webhook) return
    try {
      const d = await apiGet<{ items: WebhookDeliveryRow[] }>(
        `/api/webhooks/${webhook.id}/deliveries`,
      )
      setItems(d.items)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [webhook])

  React.useEffect(() => {
    if (!webhook) return
    setLoading(true)
    void fetchDeliveries()
    const t = setInterval(() => void fetchDeliveries(), POLL_DELIVERIES_MS)
    return () => clearInterval(t)
  }, [webhook, fetchDeliveries])

  return (
    <Dialog
      open={!!webhook}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            Deliveries — {webhook?.name}
          </DialogTitle>
          <DialogDescription>
            Recent webhook deliveries (last 50). Auto-refreshes every 10 seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No deliveries yet</p>
              <p className="text-[11px] text-muted-foreground">
                Trigger an event or send a test payload to see delivery history here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Event</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[70px]">Code</TableHead>
                  <TableHead className="w-[110px]">When</TableHead>
                  <TableHead>Payload / Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <DeliveryRow key={d.id} row={d} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Delivery row (expandable payload + response)
// ============================================================
function DeliveryRow({ row }: { row: WebhookDeliveryRow }) {
  const [open, setOpen] = React.useState(false)
  const isOk = row.status === 'delivered'
  const isPending = row.status === 'pending'

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <>
        <TableRow className="cursor-pointer hover:bg-muted/40">
          <TableCell>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-left"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <Badge
                  variant="outline"
                  className={cn('font-mono text-[10px]', eventBadgeClass(row.event))}
                >
                  {eventLabel(row.event)}
                </Badge>
              </button>
            </CollapsibleTrigger>
          </TableCell>
          <TableCell>
            {isOk ? (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                <Check className="h-3 w-3" /> Delivered
              </Badge>
            ) : isPending ? (
              <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                <Loader2 className="h-3 w-3" /> Pending
              </Badge>
            ) : (
              <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30">
                <X className="h-3 w-3" /> Failed
              </Badge>
            )}
          </TableCell>
          <TableCell>
            <span
              className={cn(
                'font-mono text-xs tabular-nums',
                row.statusCode === 0
                  ? 'text-muted-foreground'
                  : row.statusCode >= 200 && row.statusCode < 300
                    ? 'text-emerald-300'
                    : row.statusCode >= 300 && row.statusCode < 400
                      ? 'text-sky-300'
                      : 'text-rose-300',
              )}
            >
              {row.statusCode || '—'}
            </span>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {timeAgo(row.createdAt)}
          </TableCell>
          <TableCell className="max-w-[260px]">
            <span className="truncate text-[11px] font-mono text-muted-foreground">
              {row.response || '—'}
            </span>
          </TableCell>
        </TableRow>
        <CollapsibleContent asChild>
          <tr className="bg-muted/30">
            <TableCell colSpan={5} className="p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sent at
                  </p>
                  <p className="text-xs text-foreground">
                    {formatDateTime(row.createdAt)}
                  </p>
                  {row.deliveredAt && (
                    <p className="text-[11px] text-emerald-300">
                      Delivered: {formatDateTime(row.deliveredAt)}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Attempts: <span className="font-mono">{row.attempts}</span>
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Response body
                  </p>
                  <pre className="max-h-32 overflow-auto rounded border bg-background/60 p-2 text-[10px] font-mono leading-relaxed text-muted-foreground">
                    {row.response || '(empty)'}
                  </pre>
                </div>
                <div className="sm:col-span-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Payload
                  </p>
                  <pre className="max-h-48 overflow-auto rounded border bg-background/60 p-2 text-[10px] font-mono leading-relaxed text-emerald-200/80">
                    {prettyJson(row.payload) || '(empty)'}
                  </pre>
                </div>
              </div>
            </TableCell>
          </tr>
        </CollapsibleContent>
      </>
    </Collapsible>
  )
}

function prettyJson(s: string): string {
  if (!s) return ''
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

'use client'

// ============================================================
// BroadcastView — mass-messaging + reusable message templates.
//
// Two tabs:
//   • Campaigns  — compose & send a broadcast to a filtered audience,
//                  plus a list of recent campaigns.
//   • Templates  — create / edit / delete reusable message templates
//                  (seeded with 4 QorvixNode-branded defaults).
//
// Sending a broadcast goes through `/api/broadcast` which fans the
// message out to every matching contact via wa-engine.sendOwnerMessage
// — the resulting owner-source messages then show up in the Chats view.
// ============================================================
import * as React from 'react'
import { toast } from 'sonner'
import {
  Megaphone,
  Send,
  FileText,
  Plus,
  Trash2,
  Pencil,
  Users,
  AlertTriangle,
  Check,
  Copy,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { timeAgo, formatDateTime } from '@/lib/format'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
interface BroadcastRow {
  id: string
  name: string
  message: string
  audience: string
  sentCount: number
  deliveredCount: number
  status: string
  createdAt: string
  updatedAt: string
}

interface TemplateRow {
  id: string
  name: string
  body: string
  category: string
  createdAt: string
  updatedAt: string
}

type Audience = 'all' | 'leads' | 'hot' | 'active' | 'customer' | 'custom'
type TemplateCategory = 'greeting' | 'promotion' | 'followup' | 'support' | 'general'

interface SendResult {
  ok: boolean
  broadcast: BroadcastRow
  sentCount: number
  failedCount?: number
  warning?: string
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
const MAX_MESSAGE = 1000

const AUDIENCE_OPTIONS: { value: Audience; label: string; hint: string }[] = [
  { value: 'all', label: 'All Contacts', hint: 'Every contact in the database' },
  { value: 'leads', label: 'Leads (score ≥ 25)', hint: 'Warm + hot leads combined' },
  { value: 'hot', label: 'Hot Leads (score ≥ 70)', hint: 'Sales-ready contacts' },
  { value: 'active', label: 'Active', hint: 'Conversations currently active' },
  { value: 'customer', label: 'Customers', hint: 'Converted / paying customers' },
  { value: 'custom', label: 'Custom (soon)', hint: 'Audience builder coming soon' },
]

const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; badge: string }[] = [
  { value: 'greeting', label: 'Greeting', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'promotion', label: 'Promotion', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'followup', label: 'Follow-up', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { value: 'support', label: 'Support', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  { value: 'general', label: 'General', badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
]

function audienceLabel(v: string): string {
  return AUDIENCE_OPTIONS.find((a) => a.value === v)?.label ?? v
}

function audienceBadgeClass(v: string): string {
  switch (v) {
    case 'hot':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    case 'leads':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30'
    case 'active':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    case 'customer':
      return 'bg-teal-500/15 text-teal-300 border-teal-500/30'
    case 'custom':
      return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
    default:
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  }
}

function categoryBadgeClass(v: string): string {
  return (
    TEMPLATE_CATEGORIES.find((c) => c.value === v)?.badge ??
    'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
  )
}

function categoryLabel(v: string): string {
  return TEMPLATE_CATEGORIES.find((c) => c.value === v)?.label ?? v
}

function statusBadgeClass(s: string): string {
  if (s === 'sent') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (s === 'scheduled') return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
}

// ------------------------------------------------------------
// Main view
// ------------------------------------------------------------
export function BroadcastView() {
  const [tab, setTab] = React.useState<'campaigns' | 'templates'>('campaigns')

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <Megaphone className="h-5 w-5 text-emerald-400" />
            Broadcast
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a message to many contacts at once and manage reusable templates.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'campaigns' | 'templates')}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="campaigns" className="flex-1 sm:flex-none">
            <Send className="mr-1.5 h-4 w-4" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex-1 sm:flex-none">
            <FileText className="mr-1.5 h-4 w-4" /> Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// Campaigns tab
// ============================================================
function CampaignsTab() {
  const [name, setName] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [audience, setAudience] = React.useState<Audience>('all')

  const [audienceCount, setAudienceCount] = React.useState<number | null>(null)
  const [audienceCountLoading, setAudienceCountLoading] = React.useState(false)

  const [broadcasts, setBroadcasts] = React.useState<BroadcastRow[]>([])
  const [loadingList, setLoadingList] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const [templates, setTemplates] = React.useState<TemplateRow[]>([])

  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  // --- Load templates (for the quick-fill chips) ---
  const fetchTemplates = React.useCallback(async () => {
    try {
      const d = await apiGet<{ items: TemplateRow[] }>('/api/templates')
      setTemplates(d.items.slice(0, 6))
    } catch {
      /* best-effort */
    }
  }, [])

  // --- Load broadcast list ---
  const fetchBroadcasts = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoadingList(true)
      try {
        const d = await apiGet<{ items: BroadcastRow[] }>('/api/broadcast')
        setBroadcasts(d.items)
      } catch (err) {
        toast.error('Failed to load campaigns', {
          description: err instanceof Error ? err.message : undefined,
        })
      } finally {
        setLoadingList(false)
        setRefreshing(false)
      }
    },
    [],
  )

  React.useEffect(() => {
    void fetchBroadcasts()
    void fetchTemplates()
  }, [fetchBroadcasts, fetchTemplates])

  // --- Audience count: re-fetch when audience changes ---
  React.useEffect(() => {
    let cancelled = false
    setAudienceCountLoading(true)
    apiGet<{ audience: string; count: number }>(
      `/api/broadcast/audience-count?audience=${encodeURIComponent(audience)}`,
    )
      .then((d) => {
        if (!cancelled) setAudienceCount(d.count)
      })
      .catch(() => {
        if (!cancelled) setAudienceCount(null)
      })
      .finally(() => {
        if (!cancelled) setAudienceCountLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [audience])

  const canSend =
    name.trim().length > 0 &&
    message.trim().length > 0 &&
    message.length <= MAX_MESSAGE &&
    !sending

  const handleOpenConfirm = () => {
    if (!name.trim()) {
      toast.error('Campaign name is required')
      return
    }
    if (!message.trim()) {
      toast.error('Message body is required')
      return
    }
    if (message.length > MAX_MESSAGE) {
      toast.error(`Message too long (max ${MAX_MESSAGE} chars)`)
      return
    }
    setConfirmOpen(true)
  }

  const handleSend = async () => {
    setSending(true)
    try {
      const res = await apiPost<SendResult>('/api/broadcast', {
        name: name.trim(),
        message: message.trim(),
        audience,
      })
      if (res.warning) {
        toast.warning('Broadcast sent (empty audience)', { description: res.warning })
      } else {
        const failedNote =
          res.failedCount && res.failedCount > 0 ? ` · ${res.failedCount} failed` : ''
        toast.success('Broadcast sent', {
          description: `Delivered to ${res.sentCount} contact${res.sentCount === 1 ? '' : 's'}${failedNote}.`,
        })
      }
      // Reset form
      setName('')
      setMessage('')
      setConfirmOpen(false)
      // Refresh lists
      void fetchBroadcasts({ silent: true })
    } catch (err) {
      toast.error('Failed to send broadcast', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ----- New Broadcast form ----- */}
      <Card className="rounded-xl border bg-card/60 backdrop-blur card-hover">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-emerald-400" />
            New Broadcast
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bc-name">Campaign name</Label>
            <Input
              id="bc-name"
              placeholder="e.g. Diwali Offer 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>

          {/* Message */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="bc-message">Message</Label>
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  message.length > MAX_MESSAGE
                    ? 'text-rose-400'
                    : 'text-muted-foreground',
                )}
              >
                {message.length} / {MAX_MESSAGE}
              </span>
            </div>
            <Textarea
              id="bc-message"
              placeholder="Type the broadcast message. Use {name} as a placeholder for the contact's name."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              maxLength={MAX_MESSAGE}
              className="resize-y"
            />
          </div>

          {/* Audience */}
          <div className="flex flex-col gap-1.5">
            <Label>Audience</Label>
            <Select
              value={audience}
              onValueChange={(v) => setAudience(v as Audience)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {opt.hint}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Audience preview */}
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm">
            <Users className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="text-muted-foreground">This will reach</span>
            {audienceCountLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <span className="font-semibold text-emerald-300 tabular-nums">
                {audienceCount ?? '—'}
              </span>
            )}
            <span className="text-muted-foreground">
              contact{(audienceCount ?? 0) === 1 ? '' : 's'}
            </span>
          </div>

          {/* Quick templates */}
          {templates.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Quick templates
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMessage(t.body.slice(0, MAX_MESSAGE))}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      'border-border bg-muted/40 text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200',
                    )}
                    title={t.body}
                  >
                    <Copy className="h-3 w-3" />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Send button */}
          <Button
            type="button"
            onClick={handleOpenConfirm}
            disabled={!canSend}
            className={cn(
              'w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-900/20 transition-all hover:from-amber-400 hover:to-orange-500',
              !canSend && 'opacity-50',
            )}
          >
            <Send className="mr-2 h-4 w-4" />
            Send Broadcast
          </Button>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            Mass-send is irreversible. You will be asked to confirm before any message goes out.
          </p>
        </CardContent>
      </Card>

      {/* ----- Recent campaigns ----- */}
      <Card className="flex flex-col rounded-xl border bg-card/60 backdrop-blur card-hover">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-emerald-400" />
            Recent Campaigns
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchBroadcasts({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            <span className="sr-only">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
              <Megaphone className="h-8 w-8 text-muted-foreground/40" />
              <div>No campaigns yet.</div>
              <div className="text-[11px]">Send your first broadcast using the form on the left.</div>
            </div>
          ) : (
            <ScrollArea className="max-h-[32rem]">
              <div className="flex flex-col gap-2 px-4 pb-4">
                {broadcasts.map((b) => (
                  <BroadcastCard key={b.id} b={b} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ----- Confirmation dialog ----- */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Confirm broadcast
            </DialogTitle>
            <DialogDescription>
              You&apos;re about to send a mass message. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Campaign</span>
              <span className="font-medium">{name.trim()}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Audience</span>
              <Badge variant="outline" className={audienceBadgeClass(audience)}>
                {audienceLabel(audience)}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Recipients</span>
              <span className="font-semibold tabular-nums text-emerald-300">
                {audienceCount ?? '—'}
              </span>
            </div>
            <Separator />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Message preview
              </span>
              <p className="line-clamp-4 text-xs text-foreground/90">
                {message.trim()}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Send to {audienceCount ?? '—'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BroadcastCard({ b }: { b: BroadcastRow }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3 transition-colors card-hover hover:bg-card/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{b.name}</span>
            <Badge variant="outline" className={statusBadgeClass(b.status)}>
              {b.status}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {b.message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={audienceBadgeClass(b.audience)}>
              {audienceLabel(b.audience)}
            </Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
              <Send className="mr-1 h-3 w-3" />
              {b.sentCount} sent
            </Badge>
            {b.deliveredCount > 0 && b.deliveredCount !== b.sentCount && (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                <Check className="mr-1 h-3 w-3" />
                {b.deliveredCount} delivered
              </Badge>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          <div>{timeAgo(b.createdAt)}</div>
          <div className="mt-0.5 text-[10px]">{formatDateTime(b.createdAt)}</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Templates tab
// ============================================================
function TemplatesTab() {
  const [templates, setTemplates] = React.useState<TemplateRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TemplateRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<TemplateRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const fetchAll = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const d = await apiGet<{ items: TemplateRow[] }>('/api/templates')
        setTemplates(d.items)
      } catch (err) {
        toast.error('Failed to load templates', {
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
    void fetchAll()
  }, [fetchAll])

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (t: TemplateRow) => {
    setEditing(t)
    setEditorOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/templates?id=${encodeURIComponent(deleteTarget.id)}`)
      toast.success('Template deleted', { description: deleteTarget.name })
      setDeleteTarget(null)
      void fetchAll({ silent: true })
    } catch (err) {
      toast.error('Failed to delete template', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-emerald-400" /> Message Templates
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Reusable snippets. Click a chip in the broadcast form to drop one into the composer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchAll({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            <span className="sr-only">Refresh</span>
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> New Template
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <div>No templates yet.</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onEdit={() => openEdit(t)}
              onDelete={() => setDeleteTarget(t)}
            />
          ))}
        </div>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={() => {
          setEditorOpen(false)
          void fetchAll({ silent: true })
        }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              Delete template
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. The template will be removed permanently.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={categoryBadgeClass(deleteTarget.category)}>
                  {categoryLabel(deleteTarget.category)}
                </Badge>
                <span className="font-medium">{deleteTarget.name}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                {deleteTarget.body}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateCard({
  t,
  onEdit,
  onDelete,
}: {
  t: TemplateRow
  onEdit: () => void
  onDelete: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(t.body)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Clipboard not available')
    }
  }

  return (
    <Card className="flex flex-col rounded-xl border bg-card/60 backdrop-blur card-hover transition-colors hover:bg-card/80">
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{t.name}</div>
            <Badge variant="outline" className={cn('mt-1', categoryBadgeClass(t.category))}>
              {categoryLabel(t.category)}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCopy} title="Copy body">
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:text-rose-400"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="line-clamp-4 flex-1 text-xs text-muted-foreground">{t.body}</p>
        <div className="mt-1 text-[10px] text-muted-foreground">
          Updated {timeAgo(t.updatedAt)}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Template editor dialog (create / edit)
// ============================================================
function TemplateEditorDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: TemplateRow | null
  onSaved: () => void
}) {
  const [name, setName] = React.useState('')
  const [body, setBody] = React.useState('')
  const [category, setCategory] = React.useState<TemplateCategory>('general')
  const [saving, setSaving] = React.useState(false)

  // Sync fields when dialog opens or editing target changes
  React.useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setBody(editing?.body ?? '')
    setCategory((editing?.category as TemplateCategory) ?? 'general')
  }, [open, editing])

  const canSave =
    name.trim().length > 0 &&
    body.trim().length > 0 &&
    body.length <= 4000 &&
    !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await apiPost('/api/templates', {
        id: editing?.id ?? undefined,
        name: name.trim(),
        body: body.trim(),
        category,
      })
      toast.success(editing ? 'Template updated' : 'Template created', {
        description: name.trim(),
      })
      onSaved()
    } catch (err) {
      toast.error('Failed to save template', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            {editing ? 'Edit template' : 'New template'}
          </DialogTitle>
          <DialogDescription>
            Templates can include the placeholder {'{name}'} which gets replaced
            with the contact&apos;s name when used.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              placeholder="e.g. Holiday Greeting"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TemplateCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-body">Body</Label>
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  body.length > 4000 ? 'text-rose-400' : 'text-muted-foreground',
                )}
              >
                {body.length} / 4000
              </span>
            </div>
            <Textarea
              id="tpl-body"
              placeholder="Hi {name}, thanks for reaching out to QorvixNode Technologies…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={4000}
              className="resize-y"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

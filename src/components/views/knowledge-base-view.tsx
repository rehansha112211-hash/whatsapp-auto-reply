'use client'

// ============================================================
// KnowledgeBaseView — manage AI reference articles.
//
// Layout:
//   · Header + "New Article" button (admin only)
//   · Info banner explaining the AI integration
//   · Search bar + category filter chips
//   · Article grid (responsive 1 / 2 / 3 cols) — card shows
//     title, category badge, content preview (2 lines), tags,
//     view count, last updated, edit/delete buttons (admin only)
//   · Empty state with a hint to create the first article
//
// Dialogs:
//   · New / Edit — title, category, content (monospace textarea),
//     tags (comma-separated), priority slider, active toggle.
//     Live markdown preview pane alongside.
//   · Detail — full article view with formatted markdown content,
//     category, tags, view count, and an Edit button.
//   · Delete — confirmation alert.
// ============================================================
import * as React from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Search,
  Tag,
  Eye,
  FileText,
  Library,
  Brain,
  RefreshCw,
  Loader2,
  Sparkles,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { timeAgo, formatDateTime } from '@/lib/format'
import { useCan } from '@/hooks/use-current-user'
import type { KnowledgeArticleItem } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ------------------------------------------------------------
// Category metadata
// ------------------------------------------------------------
type CategoryKey = 'pricing' | 'services' | 'policies' | 'faq' | 'general'

interface CategoryMeta {
  label: string
  badgeClass: string
  dotClass: string
}

const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  pricing: {
    label: 'Pricing',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dotClass: 'bg-amber-400',
  },
  services: {
    label: 'Services',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
  },
  policies: {
    label: 'Policies',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-400',
  },
  faq: {
    label: 'FAQ',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dotClass: 'bg-sky-400',
  },
  general: {
    label: 'General',
    badgeClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    dotClass: 'bg-zinc-400',
  },
}

const CATEGORY_ORDER: CategoryKey[] = [
  'pricing',
  'services',
  'policies',
  'faq',
  'general',
]

function getCategoryMeta(category: string): CategoryMeta {
  if (category === 'pricing' || category === 'services' || category === 'policies' || category === 'faq') {
    return CATEGORY_META[category]
  }
  return CATEGORY_META.general
}

// ------------------------------------------------------------
// Lightweight markdown -> HTML renderer (no external dep).
// Supports: # / ## / ### headings, **bold**, `code`, - bullet
// lists, blank-line paragraph breaks. Output is safe because
// we HTML-escape before applying formatting.
// ------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/)
  const out: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }
    if (line.startsWith('### ')) {
      closeList()
      out.push(
        `<h3 class="mt-3 mb-1 text-sm font-semibold text-foreground">${inlineMd(line.slice(4))}</h3>`,
      )
    } else if (line.startsWith('## ')) {
      closeList()
      out.push(
        `<h2 class="mt-3 mb-1 text-base font-semibold text-foreground">${inlineMd(line.slice(3))}</h2>`,
      )
    } else if (line.startsWith('# ')) {
      closeList()
      out.push(
        `<h1 class="mt-3 mb-1 text-lg font-bold text-foreground">${inlineMd(line.slice(2))}</h1>`,
      )
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul class="my-1 ml-5 list-disc space-y-0.5">')
        inList = true
      }
      out.push(`<li>${inlineMd(line.replace(/^\s*[-*]\s+/, ''))}</li>`)
    } else {
      closeList()
      out.push(`<p class="my-1 leading-relaxed">${inlineMd(line)}</p>`)
    }
  }
  closeList()
  return out.join('')
}

function inlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>')
}

function previewExcerpt(md: string, maxChars = 160): string {
  // Strip markdown markers for the card preview.
  const stripped = md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
  if (stripped.length <= maxChars) return stripped
  return stripped.slice(0, maxChars).trimEnd() + '…'
}

// ------------------------------------------------------------
// Main view
// ------------------------------------------------------------
export function KnowledgeBaseView() {
  const canManage = useCan('canManageKnowledgeBase')
  const [items, setItems] = React.useState<KnowledgeArticleItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<'all' | CategoryKey>('all')
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<KnowledgeArticleItem | null>(null)
  const [detailItem, setDetailItem] = React.useState<KnowledgeArticleItem | null>(null)
  const [deleting, setDeleting] = React.useState<KnowledgeArticleItem | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (category !== 'all') params.set('category', category)
      if (search.trim()) params.set('search', search.trim())
      const qs = params.toString()
      const data = await apiGet<{ items: KnowledgeArticleItem[] }>(
        `/api/knowledge-base${qs ? `?${qs}` : ''}`,
      )
      setItems(data.items || [])
    } catch (err) {
      toast.error('Failed to load knowledge base', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [category, search])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Debounce search input: 300ms of no typing before we commit the
  // search term to the query that drives the fetch. This avoids
  // spamming the API on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const handleEdit = (item: KnowledgeArticleItem) => {
    setDetailItem(null)
    setEditing(item)
    setEditorOpen(true)
  }

  const handleSaved = () => {
    setEditorOpen(false)
    setEditing(null)
    void refresh()
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await apiDelete(`/api/knowledge-base/${deleting.id}`)
      toast.success('Article deleted', {
        description: `"${deleting.title}" was removed.`,
      })
      setDeleting(null)
      void refresh()
    } catch (err) {
      toast.error('Failed to delete article', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDeleteBusy(false)
    }
  }

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = { pricing: 0, services: 0, policies: 0, faq: 0, general: 0 }
    for (const it of items) {
      const key = (['pricing', 'services', 'policies', 'faq'].includes(it.category)
        ? it.category
        : 'general') as CategoryKey
      counts[key] += 1
    }
    return counts
  }, [items])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">
            <Brain className="h-3.5 w-3.5" />
            <span>AI reference library</span>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-gradient-premium">
            <BookOpen className="h-6 w-6 text-emerald-400" />
            Knowledge Base
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Create pricing, services, policy and FAQ articles. The AI auto-reply
            engine searches these articles on every incoming message and uses
            them to give accurate, company-specific answers — instead of making
            things up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canManage && (
            <Button size="sm" onClick={handleNew} className="bg-emerald-600 hover:bg-emerald-500">
              <Plus className="h-4 w-4" />
              <span>New Article</span>
            </Button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <Card className="rounded-xl border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-emerald-300">How it works: </span>
            When a customer asks about pricing, services, timelines, refunds or
            business hours, the AI engine finds matching articles here and
            injects them into its system prompt. The top 5 most relevant active
            articles are used per message; higher priority articles are
            referenced first.
          </div>
        </CardContent>
      </Card>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title or content…"
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          active={category === 'all'}
          onClick={() => setCategory('all')}
          label="All"
          count={items.length}
          dotClass="bg-zinc-400"
        />
        {CATEGORY_ORDER.map((c) => (
          <CategoryChip
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
            label={CATEGORY_META[c].label}
            count={categoryCounts[c]}
            dotClass={CATEGORY_META[c].dotClass}
          />
        ))}
      </div>

      <Separator />

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="rounded-xl border bg-card/40 p-5">
              <div className="flex items-center gap-2">
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                <div className="ml-auto h-5 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div className="mt-4 h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
              <div className="mt-1.5 h-3 w-5/6 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-3 w-1/3 animate-pulse rounded bg-muted" />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState canManage={canManage} onNew={handleNew} />
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((item) => (
            <motion.div
              key={item.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <ArticleCard
                item={item}
                canManage={canManage}
                onOpen={() => setDetailItem(item)}
                onEdit={() => handleEdit(item)}
                onDelete={() => setDeleting(item)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Editor dialog (new / edit) */}
      <ArticleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={handleSaved}
      />

      {/* Detail dialog */}
      <ArticleDetailDialog
        item={detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
        canManage={canManage}
        onEdit={() => detailItem && handleEdit(detailItem)}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                You are about to permanently remove:
              </span>
              <span className="mt-1 block font-medium text-foreground">
                “{deleting?.title}”
              </span>
              <span className="mt-2 block">
                The AI engine will no longer reference this content. This action
                cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleteBusy}
              className="bg-rose-600 hover:bg-rose-500"
            >
              {deleteBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

// ------------------------------------------------------------
// Category filter chip
// ------------------------------------------------------------
function CategoryChip({
  active,
  onClick,
  label,
  count,
  dotClass,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  dotClass: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
          : 'border-border bg-card/40 text-muted-foreground hover:border-emerald-500/30 hover:text-foreground',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
          active ? 'bg-emerald-500/25 text-emerald-100' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  )
}

// ------------------------------------------------------------
// Article card
// ------------------------------------------------------------
function ArticleCard({
  item,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: KnowledgeArticleItem
  canManage: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = getCategoryMeta(item.category)
  return (
    <Card className="group flex h-full flex-col rounded-xl border bg-card/60 p-5 backdrop-blur card-hover">
      <div className="flex items-start gap-2">
        <Badge className={cn('border', meta.badgeClass)} variant="outline">
          <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', meta.dotClass)} />
          {meta.label}
        </Badge>
        {!item.isActive && (
          <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400">
            Inactive
          </Badge>
        )}
        {item.priority !== 0 && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto border-border bg-muted/40 text-muted-foreground',
              item.priority > 0 ? 'text-emerald-300' : 'text-zinc-400',
            )}
            title="Priority (higher = referenced first)"
          >
            {item.priority > 0 ? (
              <ArrowUp className="mr-0.5 h-3 w-3" />
            ) : (
              <ArrowDown className="mr-0.5 h-3 w-3" />
            )}
            {Math.abs(item.priority)}
          </Badge>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 cursor-pointer text-left"
      >
        <h3 className="line-clamp-2 text-base font-semibold leading-tight text-foreground group-hover:text-emerald-300">
          {item.title}
        </h3>
      </button>

      <p className="mt-2 line-clamp-2 flex-1 text-sm text-muted-foreground">
        {previewExcerpt(item.content)}
      </p>

      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {item.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {t}
            </span>
          ))}
          {item.tags.length > 4 && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{item.tags.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3" />
          {item.viewCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {item.content.length.toLocaleString()} chars
        </span>
        <span className="ml-auto" title={formatDateTime(item.updatedAt)}>
          updated {timeAgo(item.updatedAt)}
        </span>
      </div>

      {canManage && (
        <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={onOpen}
          >
            Open
          </Button>
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------------------
// Empty state
// ------------------------------------------------------------
function EmptyState({ canManage, onNew }: { canManage: boolean; onNew: () => void }) {
  return (
    <Card className="rounded-xl border-dashed border-border bg-card/40">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
          <Library className="h-7 w-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          No articles yet
        </h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Create your first knowledge base article to help the AI give better
          answers. The platform auto-seeds five default articles on first load
          (pricing, services, refund policy, timeline, support hours) — if you
          still see this empty state, refresh once to trigger the seed.
        </p>
        {canManage && (
          <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-500" onClick={onNew}>
            <Plus className="mr-1 h-4 w-4" />
            Create article
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// Article editor dialog (new / edit) with live markdown preview
// ------------------------------------------------------------
interface EditorFormState {
  title: string
  content: string
  category: CategoryKey
  tags: string // comma-separated input
  isActive: boolean
  priority: number
}

function formFromItem(item: KnowledgeArticleItem | null): EditorFormState {
  if (!item) {
    return {
      title: '',
      content: '',
      category: 'general',
      tags: '',
      isActive: true,
      priority: 0,
    }
  }
  return {
    title: item.title,
    content: item.content,
    category: (['pricing', 'services', 'policies', 'faq'].includes(item.category)
      ? item.category
      : 'general') as CategoryKey,
    tags: item.tags.join(', '),
    isActive: item.isActive,
    priority: item.priority,
  }
}

function ArticleEditorDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: KnowledgeArticleItem | null
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<EditorFormState>(() => formFromItem(editing))
  const [saving, setSaving] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(true)

  // Reset form whenever the dialog opens (or editing target changes).
  React.useEffect(() => {
    if (open) {
      setForm(formFromItem(editing))
      setShowPreview(true)
    }
  }, [open, editing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!form.content.trim()) {
      toast.error('Content is required')
      return
    }
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const payload = {
      title: form.title.trim(),
      content: form.content,
      category: form.category,
      tags,
      isActive: form.isActive,
      priority: form.priority,
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/knowledge-base/${editing.id}`, payload)
        toast.success('Article updated', {
          description: `"${payload.title}" saved.`,
        })
      } else {
        await apiPost('/api/knowledge-base', payload)
        toast.success('Article created', {
          description: `"${payload.title}" added to the knowledge base.`,
        })
      }
      onSaved()
    } catch (err) {
      toast.error(editing ? 'Failed to update article' : 'Failed to create article', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-4xl gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-emerald-400" />
            {editing ? 'Edit article' : 'New knowledge base article'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Markdown is supported. The AI engine will reference this content
            when it matches the customer&apos;s question.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-2">
            {/* Left: form fields */}
            <div className="space-y-4 overflow-y-auto p-5">
              <div className="space-y-1.5">
                <Label htmlFor="kb-title">Title</Label>
                <Input
                  id="kb-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Pricing Guidelines"
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, category: v as CategoryKey }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ORDER.map((c) => (
                        <SelectItem key={c} value={c}>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                CATEGORY_META[c].dotClass,
                              )}
                            />
                            {CATEGORY_META[c].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-tags">Tags</Label>
                  <Input
                    id="kb-tags"
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="pricing, cost, quote"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Priority</Label>
                  <span className="text-xs font-mono text-emerald-300">
                    {form.priority > 0 ? `+${form.priority}` : form.priority}
                  </span>
                </div>
                <Slider
                  min={-10}
                  max={100}
                  step={1}
                  value={[form.priority]}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, priority: v[0] ?? 0 }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Higher priority articles are referenced first by the AI.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kb-content">Content (markdown)</Label>
                <Textarea
                  id="kb-content"
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="# Title

Write the article body here…"
                  className="min-h-[280px] resize-y font-mono text-sm leading-relaxed"
                />
                <p className="text-[11px] text-muted-foreground">
                  {form.content.length.toLocaleString()} / 16,000 chars
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <div>
                  <Label htmlFor="kb-active" className="text-sm">
                    Active
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Inactive articles are skipped by the AI engine.
                  </p>
                </div>
                <Switch
                  id="kb-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
            </div>

            {/* Right: live preview */}
            <div className="flex min-h-0 flex-col border-t border-border/60 bg-muted/20 md:border-l md:border-t-0">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  Live preview
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showPreview && (
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {form.content.trim() ? (
                      <article
                        className="prose prose-sm max-w-none text-sm text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content) }}
                      />
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        Nothing to preview yet. Start typing on the left…
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create article'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------
// Article detail dialog
// ------------------------------------------------------------
function ArticleDetailDialog({
  item,
  onOpenChange,
  canManage,
  onEdit,
}: {
  item: KnowledgeArticleItem | null
  onOpenChange: (open: boolean) => void
  canManage: boolean
  onEdit: () => void
}) {
  const open = !!item
  const meta = item ? getCategoryMeta(item.category) : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        {item && meta && (
          <>
            <DialogHeader className="border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-2">
                <Badge className={cn('border', meta.badgeClass)} variant="outline">
                  <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', meta.dotClass)} />
                  {meta.label}
                </Badge>
                {!item.isActive && (
                  <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400">
                    Inactive
                  </Badge>
                )}
                {item.priority !== 0 && (
                  <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                    Priority {item.priority > 0 ? `+${item.priority}` : item.priority}
                  </Badge>
                )}
              </div>
              <DialogTitle className="mt-2 pr-8 text-lg leading-snug">
                {item.title}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {item.viewCount} views
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {item.content.length.toLocaleString()} chars
                </span>
                <span>Updated {formatDateTime(item.updatedAt)}</span>
                <span>Created {formatDateTime(item.createdAt)}</span>
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <article
                className="prose prose-sm max-w-none p-5 text-sm text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }}
              />
            </ScrollArea>

            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-5 py-3">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {t}
                  </span>
                ))}
              </div>
            )}

            <DialogFooter className="border-t border-border/60 px-5 py-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {canManage && (
                <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={onEdit}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

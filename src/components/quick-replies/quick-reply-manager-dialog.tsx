'use client'

// ============================================================
// QuickReplyManagerDialog — full CRUD for quick replies.
//
// Two-column layout on desktop (list left, form right), single
// column on mobile. Supports create, edit, and delete-with-confirm.
// ============================================================
import * as React from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
  Zap,
  Search,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { QuickReplyRow } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  bodyPreview,
  categoryMeta,
  CATEGORY_ORDER,
  CATEGORY_META,
  type QuickReplyCategoryKey,
} from './quick-reply-helpers'

type CategoryKey = QuickReplyCategoryKey

interface QuickReplyFormState {
  shortcut: string
  title: string
  body: string
  category: CategoryKey
}

const EMPTY_FORM: QuickReplyFormState = {
  shortcut: '',
  title: '',
  body: '',
  category: 'general',
}

export interface QuickReplyManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: QuickReplyRow[]
  loading: boolean
  onCreate: (input: {
    shortcut: string
    title: string
    body: string
    category: string
  }) => Promise<QuickReplyRow>
  onUpdate: (
    id: string,
    input: {
      shortcut?: string
      title?: string
      body?: string
      category?: string
    },
  ) => Promise<QuickReplyRow>
  onDelete: (id: string) => Promise<void>
}

export function QuickReplyManagerDialog({
  open,
  onOpenChange,
  items,
  loading,
  onCreate,
  onUpdate,
  onDelete,
}: QuickReplyManagerDialogProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<QuickReplyFormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState<QuickReplyRow | null>(null)

  // Reset form when the dialog closes
  React.useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => {
        setEditingId(null)
        setForm(EMPTY_FORM)
        setQuery('')
        setDeleteTarget(null)
      }, 150)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = `${it.shortcut} ${it.title} ${it.body}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  const isEditing = editingId !== null

  const startNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const startEdit = (reply: QuickReplyRow) => {
    setEditingId(reply.id)
    setForm({
      shortcut: reply.shortcut,
      title: reply.title,
      body: reply.body,
      category: (reply.category as CategoryKey) in CATEGORY_META
        ? (reply.category as CategoryKey)
        : 'general',
    })
  }

  const handleSave = async () => {
    const shortcut = form.shortcut.trim()
    const title = form.title.trim()
    const body = form.body.trim()
    if (!shortcut) {
      toast.error('Shortcut is required')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(shortcut)) {
      toast.error('Shortcut must be alphanumeric (letters, numbers, underscore)')
      return
    }
    if (!title) {
      toast.error('Title is required')
      return
    }
    if (!body) {
      toast.error('Body is required')
      return
    }

    setSaving(true)
    try {
      if (isEditing && editingId) {
        await onUpdate(editingId, {
          shortcut,
          title,
          body,
          category: form.category,
        })
        toast.success(`Updated /${shortcut}`)
      } else {
        await onCreate({ shortcut, title, body, category: form.category })
        toast.success(`Created /${shortcut}`)
      }
      startNew()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quick reply')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await onDelete(deleteTarget.id)
      toast.success(`Deleted /${deleteTarget.shortcut}`)
      if (editingId === deleteTarget.id) startNew()
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b p-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-emerald-500" />
              Quick Replies
            </DialogTitle>
            <DialogDescription className="text-xs">
              Short snippets you can insert into the chat composer by clicking
              the Zap button or typing{' '}
              <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-semibold">
                /shortcut
              </kbd>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[70vh] min-h-[420px] grid-cols-1 overflow-hidden md:grid-cols-[1.1fr_1fr]">
            {/* ---------------- List column ---------------- */}
            <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  aria-label="Search quick replies"
                />
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {filtered.length}/{items.length}
                </span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-1.5">
                  {loading ? (
                    <div className="flex h-24 items-center justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex h-24 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                      <span>{items.length === 0 ? 'No quick replies yet' : 'No matches'}</span>
                    </div>
                  ) : (
                    filtered.map((reply) => {
                      const isActive = editingId === reply.id
                      return (
                        <div
                          key={reply.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => startEdit(reply)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              startEdit(reply)
                            }
                          }}
                          className={cn(
                            'group mb-1 cursor-pointer rounded-md border px-2.5 py-2 outline-none transition-colors',
                            isActive
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-transparent hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'shrink-0 px-1.5 py-0 text-[10px] font-semibold',
                                categoryMeta(reply.category).badge,
                              )}
                            >
                              /{reply.shortcut}
                            </Badge>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {reply.title}
                            </span>
                            {reply.usageCount > 0 && (
                              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                                ×{reply.usageCount}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                            {bodyPreview(reply.body)}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation()
                                startEdit(reply)
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-rose-400"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(reply)
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
              <div className="border-t p-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  onClick={startNew}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Quick Reply
                </Button>
              </div>
            </div>

            {/* ---------------- Form column ---------------- */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-semibold">
                  {isEditing ? 'Edit quick reply' : 'New quick reply'}
                </span>
                {isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
                    onClick={startNew}
                  >
                    <X className="h-3 w-3" />
                    Cancel edit
                  </Button>
                )}
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-3 p-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qr-shortcut" className="text-[11px] font-medium">
                      Shortcut
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">/</span>
                      <Input
                        id="qr-shortcut"
                        value={form.shortcut}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            shortcut: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
                          }))
                        }
                        placeholder="hi"
                        className="h-8 text-sm"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Letters, numbers, underscore. Type this in the composer to
                      autocomplete.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qr-title" className="text-[11px] font-medium">
                      Title
                    </Label>
                    <Input
                      id="qr-title"
                      value={form.title}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, title: e.target.value }))
                      }
                      placeholder="Greeting"
                      className="h-8 text-sm"
                      maxLength={120}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qr-category" className="text-[11px] font-medium">
                      Category
                    </Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, category: v as CategoryKey }))
                      }
                    >
                      <SelectTrigger id="qr-category" className="h-8 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map((key) => (
                          <SelectItem key={key} value={key} className="text-sm">
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  CATEGORY_META[key].dot,
                                )}
                              />
                              {CATEGORY_META[key].label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qr-body" className="text-[11px] font-medium">
                      Body
                    </Label>
                    <Textarea
                      id="qr-body"
                      value={form.body}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, body: e.target.value }))
                      }
                      placeholder="Hi! 👋 Thanks for reaching out…"
                      className="min-h-24 resize-y text-sm"
                      rows={5}
                      maxLength={4000}
                    />
                    <div className="flex justify-end text-[10px] text-muted-foreground tabular-nums">
                      {form.body.length}/4000
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between gap-2 border-t p-2">
                {isEditing ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-rose-400 hover:text-rose-500"
                    onClick={() =>
                      setDeleteTarget(
                        items.find((q) => q.id === editingId) ?? null,
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Tip: keep replies short &amp; friendly.
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {isEditing ? 'Save changes' : 'Create reply'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete /{deleteTarget?.shortcut}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the quick reply{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.title}
              </span>
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

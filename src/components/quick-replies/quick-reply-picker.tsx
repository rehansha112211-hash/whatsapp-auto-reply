'use client'

// ============================================================
// QuickReplyPicker — the Zap button in the composer + popover
// with a searchable, categorized list of quick replies.
//
// Also exports QuickReplySlashDropdown, the floating autocomplete
// that appears above the textarea when the user types `/shortcut`.
// ============================================================
import * as React from 'react'
import { Zap, Search, Settings2, Inbox } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import type { QuickReplyRow } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  bodyPreview,
  categoryMeta,
  filterQuickReplies,
  groupByCategory,
} from './quick-reply-helpers'

// ------------------------------------------------------------
// QuickReplyPicker — Zap button + popover
// ------------------------------------------------------------
export interface QuickReplyPickerProps {
  items: QuickReplyRow[]
  loading: boolean
  disabled?: boolean
  onPick: (reply: QuickReplyRow) => void
  onManage: () => void
}

export function QuickReplyPicker({
  items,
  loading,
  disabled,
  onPick,
  onManage,
}: QuickReplyPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)

  const hasItems = items.length > 0

  const filtered = React.useMemo(
    () => filterQuickReplies(items, query),
    [items, query],
  )
  const groups = React.useMemo(
    () => groupByCategory(filtered),
    [filtered],
  )

  // When the popover opens, focus the search field and reset the query.
  React.useEffect(() => {
    if (!open) return
    setQuery('')
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  const handlePick = (reply: QuickReplyRow) => {
    onPick(reply)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={disabled || loading}
          aria-label="Quick replies"
          title="Quick replies"
        >
          {loading ? (
            <Zap className="h-4 w-4 animate-pulse text-muted-foreground" />
          ) : (
            <Zap
              className={cn(
                'h-4 w-4 transition-colors',
                hasItems
                  ? 'text-emerald-500'
                  : 'text-muted-foreground',
              )}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search replies…"
            className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
            aria-label="Search quick replies"
          />
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {filtered.length}/{items.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-muted/60 text-muted-foreground">
              <Inbox className="h-5 w-5" />
            </div>
            <div className="text-xs text-muted-foreground">
              {items.length === 0
                ? 'No quick replies yet'
                : 'No matches found'}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage quick replies
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-72 overflow-y-auto">
            <div className="p-1">
              {groups.map((group) => (
                <div key={group.key} className="mb-1 last:mb-0">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        categoryMeta(group.key).dot,
                      )}
                    />
                    {group.label}
                    <span className="ml-auto font-normal normal-case tabular-nums">
                      {group.items.length}
                    </span>
                  </div>
                  {group.items.map((reply) => (
                    <button
                      key={reply.id}
                      type="button"
                      onClick={() => handlePick(reply)}
                      className="group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
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
                        <span className="truncate text-xs font-medium">
                          {reply.title}
                        </span>
                        {reply.usageCount > 0 && (
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                            ×{reply.usageCount}
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-1 text-[11px] text-muted-foreground">
                        {bodyPreview(reply.body)}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">
            Tip: type{' '}
            <kbd className="rounded border bg-muted px-1 py-0.5 text-[9px] font-semibold">
              /shortcut
            </kbd>{' '}
            in the composer
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            <Settings2 className="h-3 w-3" />
            Manage
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ------------------------------------------------------------
// QuickReplySlashDropdown — floating autocomplete above textarea
// ------------------------------------------------------------
export interface QuickReplySlashDropdownProps {
  matches: QuickReplyRow[]
  activeIndex: number
  detection: { partial: string; start: number; end: number } | null
  onSelect: (reply: QuickReplyRow) => void
  onHover: (index: number) => void
}

export function QuickReplySlashDropdown({
  matches,
  activeIndex,
  detection,
  onSelect,
  onHover,
}: QuickReplySlashDropdownProps) {
  if (!detection || matches.length === 0) return null

  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
      role="listbox"
      aria-label="Quick reply suggestions"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
        <span>Quick replies</span>
        <span className="tabular-nums">/{detection.partial || '…'}</span>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {matches.map((reply, i) => {
          const isActive = i === activeIndex
          return (
            <button
              key={reply.id}
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(reply)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                isActive ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 px-1.5 py-0 text-[10px] font-semibold',
                  categoryMeta(reply.category).badge,
                )}
              >
                /{reply.shortcut}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {reply.title}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {bodyPreview(reply.body, 50)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="border-t px-3 py-1 text-[9px] text-muted-foreground">
        <kbd className="rounded border bg-muted px-1 py-0.5 font-semibold">↑↓</kbd>{' '}
        navigate ·{' '}
        <kbd className="rounded border bg-muted px-1 py-0.5 font-semibold">↵</kbd>{' '}
        insert ·{' '}
        <kbd className="rounded border bg-muted px-1 py-0.5 font-semibold">esc</kbd>{' '}
        dismiss
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// showToastForPick — small helper so callers can fire a toast on
// insertion without duplicating the message.
// ------------------------------------------------------------
export function showQuickReplyToast(reply: QuickReplyRow) {
  toast.success(`Inserted /${reply.shortcut}`, {
    description: reply.title,
  })
}

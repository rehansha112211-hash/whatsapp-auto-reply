'use client'

import * as React from 'react'
import {
  Send,
  Plug,
  Flame,
  Megaphone,
  ScrollText,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { NAV_ITEMS } from '@/lib/nav'
import { apiGet } from '@/lib/api-client'
import { colorFromString, initials, timeAgo, findMatchSegments } from '@/lib/format'
import { LeadBadge } from '@/components/status'
import type { ChatListItem, SearchMessageItem, ViewKey } from '@/lib/types'

// ============================================================
// Global Command Palette (Cmd+K / Ctrl+K)
// Jump to any view, find any contact, or find any message.
// ============================================================

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  severity: string
  read: boolean
  createdAt: string
  contactId: string | null
  contactName: string | null
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (view: ViewKey) => void
  onOpenContact: (contactId: string) => void
  initialQuery?: string
}

interface QuickAction {
  label: string
  description: string
  icon: LucideIcon
  view: ViewKey
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Send a test message',
    description: 'Open the AI simulator',
    icon: Send,
    view: 'simulator',
  },
  {
    label: 'Connect WhatsApp',
    description: 'Show the QR login & session',
    icon: Plug,
    view: 'whatsapp',
  },
  {
    label: 'View hot leads',
    description: 'Lead pipeline sorted by score',
    icon: Flame,
    view: 'leads',
  },
  {
    label: 'Send a broadcast',
    description: 'Mass messages & templates',
    icon: Megaphone,
    view: 'broadcast',
  },
  {
    label: 'View system logs',
    description: 'Audit trail of every event',
    icon: ScrollText,
    view: 'logs',
  },
]

function severityIcon(severity: string): React.ReactNode {
  switch (severity) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
    case 'error':
      return <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
    default:
      return <Info className="h-4 w-4 shrink-0 text-sky-400" />
  }
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onOpenContact,
  initialQuery,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState('')
  const [contacts, setContacts] = React.useState<ChatListItem[]>([])
  const [messages, setMessages] = React.useState<SearchMessageItem[]>([])
  const [searching, setSearching] = React.useState(false)
  const [searchingMessages, setSearchingMessages] = React.useState(false)
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])

  // If an initialQuery is provided (e.g. opened from the search bar), seed it.
  React.useEffect(() => {
    if (open && initialQuery) setQuery(initialQuery)
  }, [open, initialQuery])

  // Reset transient state whenever the palette closes.
  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setContacts([])
      setMessages([])
      setSearching(false)
      setSearchingMessages(false)
    }
  }, [open])

  // Fetch recent notifications once per open.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    apiGet<{ items: NotificationItem[] }>('/api/notifications?limit=5')
      .then((d) => {
        if (!cancelled) setNotifications(d.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setNotifications([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Debounced server-side contact + message search (>= 2 chars).
  // Both requests fire in parallel and settle independently so a slow
  // messages query never delays the contacts list.
  React.useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setContacts([])
      setMessages([])
      setSearching(false)
      setSearchingMessages(false)
      return
    }
    setSearching(true)
    setSearchingMessages(true)
    const t = setTimeout(() => {
      // Contacts
      void apiGet<{ items: ChatListItem[] }>(
        `/api/chats?search=${encodeURIComponent(q)}&limit=8`,
      )
        .then((d) => setContacts(d.items ?? []))
        .catch(() => setContacts([]))
        .finally(() => setSearching(false))
      // Messages (top 5)
      void apiGet<{ items: SearchMessageItem[] }>(
        `/api/search?q=${encodeURIComponent(q)}&limit=5`,
      )
        .then((d) => setMessages(d.items ?? []))
        .catch(() => setMessages([]))
        .finally(() => setSearchingMessages(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Because we set shouldFilter={false} on the root Command (so the dynamic
  // contacts group is never re-filtered client-side), the static lists need
  // a small substring filter to feel native.
  const q = query.trim().toLowerCase()
  const filteredNav = q
    ? NAV_ITEMS.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.key.toLowerCase().includes(q),
      )
    : NAV_ITEMS
  const filteredActions = q
    ? QUICK_ACTIONS.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      )
    : QUICK_ACTIONS

  const showContacts = query.trim().length >= 2
  const showMessages = query.trim().length >= 2
  const anySearching = searching || searchingMessages
  const showRecent = q.length === 0 && notifications.length > 0

  const hasAnyResult =
    filteredNav.length > 0 ||
    filteredActions.length > 0 ||
    (showContacts && (anySearching || contacts.length > 0 || messages.length > 0)) ||
    showRecent

  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

  const handleNav = React.useCallback(
    (v: ViewKey) => {
      onNavigate(v)
      close()
    },
    [onNavigate, close],
  )

  const handleOpenSearch = React.useCallback(() => {
    onNavigate('search')
    close()
  }, [onNavigate, close])

  const handleContact = React.useCallback(
    (id: string) => {
      onOpenContact(id)
      close()
    },
    [onOpenContact, close],
  )

  // Build the highlighted snippet for a single message result.
  const renderSnippet = (m: SearchMessageItem) => {
    const segments = findMatchSegments(m.matchedSnippet, query.trim())
    return segments.map((seg, i) =>
      seg.match ? (
        <mark
          key={i}
          className="rounded bg-emerald-500/30 px-0.5 text-emerald-200"
        >
          {seg.text}
        </mark>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      ),
    )
  }

  // Direction/source label for a message result badge.
  function messageDirLabel(m: SearchMessageItem): { label: string; cls: string } {
    const dir = m.direction === 'incoming' ? 'In' : 'Out'
    const src =
      m.source === 'ai'
        ? 'AI'
        : m.source === 'owner'
          ? 'Owner'
          : m.source === 'customer'
            ? 'Cust'
            : 'Sys'
    let cls = 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
    if (m.source === 'ai') cls = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    else if (m.source === 'owner') cls = 'bg-sky-500/15 text-sky-300 border-sky-500/30'
    else if (m.source === 'customer') cls = 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    else if (m.direction === 'incoming') cls = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    else cls = 'bg-teal-500/15 text-teal-300 border-teal-500/30'
    return { label: `${dir} · ${src}`, cls }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      title="Command Palette"
      description="Search views, contacts, and quick actions"
      className="max-w-2xl"
    >
      <CommandInput
        placeholder="Search views, contacts, actions…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[60vh]">
        {!hasAnyResult && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No results found.
          </div>
        )}

        {/* Group 1 — Navigation */}
        {filteredNav.length > 0 && (
          <CommandGroup heading="Navigation">
            {filteredNav.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.key}
                  value={`nav-${item.key}-${item.label}`}
                  onSelect={() => handleNav(item.key)}
                  className="gap-3 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
                >
                  <Icon className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}

        {/* Group 2 — Contacts (server-side filtered) */}
        {showContacts && (
          <CommandGroup heading="Contacts">
            {searching ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>Searching contacts…</span>
              </div>
            ) : contacts.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No contacts found
              </div>
            ) : (
              contacts.map((c) => (
                <CommandItem
                  key={c.contactId}
                  value={`contact-${c.contactId}-${c.name}-${c.phone}`}
                  onSelect={() => handleContact(c.contactId)}
                  className="gap-3 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
                >
                  <div
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${colorFromString(
                      c.name,
                    )}`}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.name}
                      </span>
                      {c.unread > 0 && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-300">
                          {c.unread} unread
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{c.phone}</span>
                      <span className="truncate">
                        · {c.lastMessage || 'No messages yet'}
                      </span>
                    </div>
                  </div>
                  <LeadBadge score={c.leadScore} />
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}

        {/* Group 2.5 — Messages (server-side full-text search) */}
        {showMessages && (
          <CommandGroup heading="Messages">
            {searchingMessages ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span>Searching messages…</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No messages found
              </div>
            ) : (
              messages.map((m) => {
                const dir = messageDirLabel(m)
                return (
                  <CommandItem
                    key={m.messageId}
                    value={`msg-${m.messageId}-${m.contactName}-${m.matchedSnippet}`}
                    onSelect={handleOpenSearch}
                    className="gap-3 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-teal-400" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {m.contactName}
                        </span>
                        <span
                          className={`shrink-0 rounded-md border px-1 py-0 text-[10px] font-medium ${dir.cls}`}
                        >
                          {dir.label}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(m.timestamp)}
                        </span>
                      </div>
                      <span className="line-clamp-1 text-[11px] text-muted-foreground">
                        {renderSnippet(m)}
                      </span>
                    </div>
                  </CommandItem>
                )
              })
            )}
            {/* Footer: open the full search view */}
            <CommandItem
              value="msg-open-search-view"
              onSelect={handleOpenSearch}
              className="gap-3 border-t border-border/60 mt-1 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-emerald-400" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  Open full search view
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  See all matches with filters &amp; facets
                </span>
              </div>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Group 3 — Quick Actions */}
        {filteredActions.length > 0 && (
          <>
            {filteredNav.length > 0 || showContacts || showMessages ? <CommandSeparator /> : null}
            <CommandGroup heading="Quick Actions">
              {filteredActions.map((a) => {
                const Icon = a.icon
                return (
                  <CommandItem
                    key={a.label}
                    value={`action-${a.label}`}
                    onSelect={() => handleNav(a.view)}
                    className="gap-3 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-teal-400" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {a.label}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {a.description}
                      </span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}

        {/* Group 4 — Recent notifications */}
        {showRecent && <CommandSeparator />}
        {showRecent && (
          <CommandGroup heading="Recent">
            {notifications.map((n) => (
              <CommandItem
                key={n.id}
                value={`notif-${n.id}-${n.title}-${n.body}`}
                onSelect={() => {
                  if (n.contactId) handleContact(n.contactId)
                  else close()
                }}
                className="gap-3 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary"
              >
                {severityIcon(n.severity)}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {n.title}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {n.body}
                  </span>
                </div>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {timeAgo(n.createdAt)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

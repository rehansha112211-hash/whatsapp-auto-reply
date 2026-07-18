'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Menu,
  X,
  Bell,
  LogOut,
  Clock,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { NAV_ITEMS } from '@/lib/nav'
import type { ViewKey, AuthUser, DashboardStats } from '@/lib/types'
import { WhatsAppStatusBadge } from '@/components/status'
import { apiGet, apiPost } from '@/lib/api-client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatUptime } from '@/lib/format'

interface AppShellProps {
  user: AuthUser
  stats: DashboardStats | null
  active: ViewKey
  onNavigate: (v: ViewKey) => void
  onLogout: () => void
  children: React.ReactNode
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
        <MessageCircle className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 pulse-ring" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">
          WhatsApp Auto Reply
        </div>
        <div className="text-[10px] text-muted-foreground">
          by QorvixNode Technologies
        </div>
      </div>
    </div>
  )
}

function NavLinks({
  active,
  onNavigate,
  unread,
}: {
  active: ViewKey
  onNavigate: (v: ViewKey) => void
  unread: number
}) {
  const groups: { label: string; group: 'main' | 'settings' | 'system' }[] = [
    { label: 'Workspace', group: 'main' },
    { label: 'Settings', group: 'settings' },
    { label: 'System', group: 'system' },
  ]
  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {groups.map((g) => (
        <div key={g.group} className="flex flex-col gap-1">
          <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {g.label}
          </div>
          {NAV_ITEMS.filter((n) => n.group === g.group).map((item) => {
            const Icon = item.icon
            const isActive = active === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.key === 'chats' && unread > 0 && (
                  <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">
                    {unread}
                  </Badge>
                )}
                {item.key === 'leads' && (
                  <span className="text-[10px] text-emerald-400/80">●</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function NotificationsBell() {
  const [items, setItems] = React.useState<
    { id: string; type: string; title: string; body: string; severity: string; createdAt: string; read: boolean }[]
  >([])
  const [open, setOpen] = React.useState(false)

  const refresh = React.useCallback(async () => {
    try {
      const data = await apiGet<{ items: any[] }>('/api/notifications?limit=10')
      setItems(data.items)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [refresh])

  const unread = items.filter((i) => !i.read).length
  const markAll = async () => {
    await apiPost('/api/notifications/read-all')
    refresh()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <button
            onClick={markAll}
            className="text-[11px] text-primary hover:underline"
          >
            Mark all read
          </button>
        </div>
        <ScrollArea className="max-h-80">
          <div className="flex flex-col">
            {items.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No notifications yet
              </div>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'border-b px-3 py-2.5 last:border-0',
                  !n.read && 'bg-primary/5',
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      'mt-1 h-2 w-2 shrink-0 rounded-full',
                      n.severity === 'success' && 'bg-emerald-500',
                      n.severity === 'warning' && 'bg-amber-500',
                      n.severity === 'error' && 'bg-rose-500',
                      n.severity === 'info' && 'bg-sky-500',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{n.title}</div>
                    <div className="line-clamp-2 text-[11px] text-muted-foreground">
                      {n.body}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({
  user,
  stats,
  active,
  onNavigate,
  onLogout,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [now, setNow] = React.useState(() => new Date())

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const waState = (stats?.whatsappState ?? 'disconnected') as any
  const unread = stats?.unreadNotifications ?? 0

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b px-4">
        <BrandMark />
      </div>
      <ScrollArea className="flex-1 scrollbar-thin">
        <NavLinks active={active} onNavigate={onNavigate} unread={unread} />
      </ScrollArea>
      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Encrypted session</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Uptime</span>
            <span className="font-mono text-foreground">
              {formatUptime(stats?.uptimeSec ?? 0)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">AI model</span>
            <span className="font-mono text-foreground">
              {stats?.aiModel ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-sidebar/50 lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur glass lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
          <div className="flex items-center gap-2 lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <BrandMark />
          </div>

          <div className="hidden flex-1 items-center gap-3 lg:flex">
            <div>
              <div className="text-sm font-semibold leading-tight">
                WhatsApp_Auto_Reply
              </div>
              <div className="text-[10px] text-muted-foreground">
                QorvixNode Technologies
              </div>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <WhatsAppStatusBadge state={waState} />
            {stats?.connectedNumber && (
              <span className="text-xs text-muted-foreground">
                · {stats.connectedNumber}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground md:flex">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white">
                    {user.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="hidden text-sm font-medium md:inline">
                    {user.displayName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-sm font-semibold">{user.displayName}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">
                    @{user.username} · {user.role}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-rose-400 focus:text-rose-300">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>

        <footer className="mt-auto border-t bg-background/80 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex flex-col items-center justify-between gap-2 text-[11px] text-muted-foreground sm:flex-row">
            <div className="flex items-center gap-2">
              <span>© {new Date().getFullYear()} QorvixNode Technologies</span>
              <span>·</span>
              <Link
                href="https://qorvixnodetechnologies.indevs.in"
                target="_blank"
                className="hover:text-foreground hover:underline"
              >
                qorvixnodetechnologies.indevs.in
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span>WhatsApp Auto Reply v1.0</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-ring" />
                System operational
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

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
  Search,
  Volume2,
  VolumeX,
  Monitor,
  MonitorOff,
  HelpCircle,
  Keyboard,
  Info,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { NAV_ITEMS } from '@/lib/nav'
import { QORVIX_COMPANY } from '@/lib/types'
import type { ViewKey, AuthUser, DashboardStats } from '@/lib/types'
import { WhatsAppStatusBadge } from '@/components/status'
import { ThemeToggle } from '@/components/theme-toggle'
import { useNotificationAlerts } from '@/hooks/use-notification-alerts'
import { apiGet, apiPost } from '@/lib/api-client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { formatUptime } from '@/lib/format'
import { getVisibleNavItems, roleOf, type Role } from '@/lib/permissions'

interface AppShellProps {
  user: AuthUser
  stats: DashboardStats | null
  active: ViewKey
  onNavigate: (v: ViewKey) => void
  onLogout: () => void
  onOpenPalette?: () => void
  onStartTour?: () => void
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

// Maps a nav ViewKey to its data-tour attribute (used by the onboarding tour).
const NAV_TOUR_ATTRS: Partial<Record<ViewKey, string>> = {
  dashboard: 'nav-dashboard',
  whatsapp: 'nav-whatsapp',
  chats: 'nav-chats',
  simulator: 'nav-simulator',
  'ai-settings': 'nav-ai-settings',
}

function NavLinks({
  active,
  onNavigate,
  unread,
  role,
}: {
  active: ViewKey
  onNavigate: (v: ViewKey) => void
  unread: number
  role: Role
}) {
  const groups: { label: string; group: 'main' | 'settings' | 'system' }[] = [
    { label: 'Workspace', group: 'main' },
    { label: 'Settings', group: 'settings' },
    { label: 'System', group: 'system' },
  ]
  const visible = React.useMemo(() => new Set(getVisibleNavItems(role)), [role])
  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {groups.map((g) => {
        const items = NAV_ITEMS.filter(
          (n) => n.group === g.group && visible.has(n.key),
        )
        if (items.length === 0) return null
        return (
          <div key={g.group} className="flex flex-col gap-1">
            <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {g.label}
            </div>
            {items.map((item) => {
              const Icon = item.icon
              const isActive = active === item.key
              const tourAttr = NAV_TOUR_ATTRS[item.key]
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  data-tour={tourAttr}
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
        )
      })}
    </nav>
  )
}

function NotificationsBell() {
  const [items, setItems] = React.useState<
    { id: string; type: string; title: string; body: string; severity: string; createdAt: string; read: boolean }[]
  >([])
  const [open, setOpen] = React.useState(false)
  const { soundOn, desktopOn, toggleSound, toggleDesktop } = useNotificationAlerts(true)

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
        <Button variant="ghost" size="icon" className="relative h-9 w-9" data-tour="notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          {soundOn && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleSound(!soundOn)}
              title={soundOn ? 'Sound on' : 'Sound off'}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                soundOn ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => void toggleDesktop(!desktopOn)}
              title={desktopOn ? 'Desktop alerts on' : 'Desktop alerts off'}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                desktopOn ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {desktopOn ? <Monitor className="h-3.5 w-3.5" /> : <MonitorOff className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={markAll}
              className="ml-1 text-[11px] text-primary hover:underline"
            >
              Mark all
            </button>
          </div>
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

// ============================================================
// Help menu — circle with "?" that opens a dropdown with
// "Take the tour", "Keyboard shortcuts", and "About" actions.
// ============================================================
interface HelpMenuProps {
  onStartTour?: () => void
  onOpenPalette?: () => void
}

function HelpMenu({ onStartTour, onOpenPalette }: HelpMenuProps) {
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)
  const [aboutOpen, setAboutOpen] = React.useState(false)

  const handleStartTour = async () => {
    try {
      // Reset onboarding so the tour re-enables, then call the prop
      // which flips showTour=true on the parent.
      await apiPost('/api/onboarding', { action: 'reset' })
    } catch {
      /* best-effort — still try to open the tour */
    }
    onStartTour?.()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>Help & Tips</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleStartTour()}>
            <Sparkles className="mr-2 h-4 w-4 text-emerald-400" />
            Take the tour
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard shortcuts
          </DropdownMenuItem>
          {onOpenPalette && (
            <DropdownMenuItem onClick={onOpenPalette}>
              <Search className="mr-2 h-4 w-4" />
              Open Quick Search
              <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAboutOpen(true)}>
            <Info className="mr-2 h-4 w-4" />
            About QorvixNode
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Keyboard shortcuts dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-emerald-400" />
              Keyboard shortcuts
            </DialogTitle>
            <DialogDescription>
              Speed up your workflow with these keyboard shortcuts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {[
              { keys: ['⌘', 'K'], label: 'Open Quick Search (jump to any view, contact, or message)' },
              { keys: ['/'], label: 'Open Quick Search (when not typing)' },
              { keys: ['Esc'], label: 'Close dialogs, palette, or tour' },
              { keys: ['→'], label: 'Next tour step (while tour is active)' },
              { keys: ['←'], label: 'Previous tour step (while tour is active)' },
              { keys: ['⌘', '/'], label: 'Open this shortcuts dialog (browser default)' },
            ].map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
              >
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <div className="flex items-center gap-1">
                  {row.keys.map((k, j) => (
                    <kbd
                      key={j}
                      className="rounded border bg-background px-1.5 py-0.5 text-[11px] font-mono shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* About dialog */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                <MessageCircle className="h-4 w-4" />
              </div>
              About QorvixNode WhatsApp Auto Reply
            </DialogTitle>
            <DialogDescription>
              AI-powered WhatsApp auto-reply platform for modern businesses.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Platform</span>
              <span className="font-medium">WhatsApp Auto Reply</span>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">v1.0.0</span>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Built by</span>
              <span className="font-medium">{QORVIX_COMPANY.name}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">Website</span>
              <Link
                href={QORVIX_COMPANY.website}
                target="_blank"
                className="font-medium text-emerald-400 hover:underline"
              >
                qorvixnodetechnologies.indevs.in
              </Link>
            </div>
            <div className="rounded-md border bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {QORVIX_COMPANY.description}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AppShell({
  user,
  stats,
  active,
  onNavigate,
  onLogout,
  onOpenPalette,
  onStartTour,
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
  const role = roleOf(user) ?? 'viewer'

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b px-4">
        <BrandMark />
      </div>
      <ScrollArea className="flex-1 scrollbar-thin">
        <NavLinks active={active} onNavigate={onNavigate} unread={unread} role={role} />
      </ScrollArea>
      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/40 p-3 card-hover">
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
            {onOpenPalette && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenPalette}
                data-tour="quick-search"
                className="hidden gap-1.5 text-xs text-muted-foreground md:flex"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Quick search</span>
                <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                  ⌘K
                </kbd>
              </Button>
            )}
            <HelpMenu onStartTour={onStartTour} onOpenPalette={onOpenPalette} />
            <ThemeToggle />
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

        <main className="min-w-0 flex-1 bg-gradient-to-b from-background to-background/50 p-4 lg:p-6">{children}</main>

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

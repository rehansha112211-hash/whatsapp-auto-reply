'use client'

import * as React from 'react'
import { AnimatePresence } from 'framer-motion'
import { AppShell } from '@/components/app-shell'
import { CommandPalette } from '@/components/command-palette'
import { PageTransition } from '@/components/ui/page-transition'
import { LoginView } from '@/components/views/login-view'
import { DashboardView } from '@/components/views/dashboard-view'
import { WhatsAppView } from '@/components/views/whatsapp-view'
import { ChatsView } from '@/components/views/chats-view'
import { LeadsView } from '@/components/views/leads-view'
import { AISettingsView } from '@/components/views/ai-settings-view'
import { CompanySettingsView } from '@/components/views/company-settings-view'
import { OwnerSettingsView } from '@/components/views/owner-settings-view'
import { AutoReplySettingsView } from '@/components/views/autoreply-settings-view'
import { LogsView } from '@/components/views/logs-view'
import { SystemView } from '@/components/views/system-view'
import { SimulatorView } from '@/components/views/simulator-view'
import { BroadcastView } from '@/components/views/broadcast-view'
import { ScheduledView } from '@/components/views/scheduled-view'
import { AnalyticsView } from '@/components/views/analytics-view'
import { ContactProfileView } from '@/components/views/contact-profile-view'
import { apiGet, apiPost } from '@/lib/api-client'
import type { AuthUser, DashboardStats, ViewKey } from '@/lib/types'

export default function Home() {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = React.useState(false)
  const [active, setActive] = React.useState<ViewKey>('dashboard')
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [profileContactId, setProfileContactId] = React.useState<string | null>(null)

  // Check auth on mount
  React.useEffect(() => {
    let cancelled = false
    apiGet<{ user: AuthUser | null }>('/api/auth/me')
      .then((d) => {
        if (!cancelled) setUser(d.user)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Poll dashboard stats while authenticated
  React.useEffect(() => {
    if (!user) {
      setStats(null)
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const s = await apiGet<DashboardStats>('/api/dashboard')
        if (!cancelled) setStats(s)
      } catch {
        /* ignore */
      }
    }
    tick()
    const t = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [user])

  // Global keyboard shortcut: Cmd+K / Ctrl+K to open the command palette.
  // Also opens on "/" when not typing in an input/textarea.
  React.useEffect(() => {
    if (!user) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (e.key === '/' && !isTyping && !paletteOpen) {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [user, paletteOpen])

  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout')
    } catch {
      /* ignore */
    }
    setUser(null)
    setActive('dashboard')
  }

  if (!authChecked) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Loading QorvixNode WhatsApp Auto Reply…</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginView onLoggedIn={(u) => setUser(u)} />
  }

  return (
    <AppShell
      user={user}
      stats={stats}
      active={active}
      onNavigate={setActive}
      onLogout={handleLogout}
      onOpenPalette={() => setPaletteOpen(true)}
    >
      <AnimatePresence mode="wait">
        <PageTransition viewKey={active}>
          {active === 'dashboard' && <DashboardView onNavigate={setActive} />}
          {active === 'whatsapp' && <WhatsAppView />}
          {active === 'chats' && (
            <ChatsView
              onViewProfile={(id) => {
                setProfileContactId(id)
                setActive('contact-profile')
              }}
            />
          )}
          {active === 'leads' && <LeadsView onNavigate={setActive} />}
          {active === 'simulator' && <SimulatorView onNavigate={setActive} />}
          {active === 'broadcast' && <BroadcastView />}
          {active === 'scheduled' && <ScheduledView onNavigate={setActive} />}
          {active === 'analytics' && <AnalyticsView />}
          {active === 'contact-profile' && profileContactId && (
            <ContactProfileView
              contactId={profileContactId}
              onBack={() => setActive('chats')}
              onNavigate={setActive}
            />
          )}
          {active === 'ai-settings' && <AISettingsView />}
          {active === 'company-settings' && <CompanySettingsView />}
          {active === 'owner-settings' && <OwnerSettingsView />}
          {active === 'autoreply-settings' && <AutoReplySettingsView />}
          {active === 'logs' && <LogsView />}
          {active === 'system' && <SystemView />}
        </PageTransition>
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={setActive}
        onOpenContact={() => setActive('chats')}
      />
    </AppShell>
  )
}

'use client'

import * as React from 'react'
import { AnimatePresence } from 'framer-motion'
import { AppShell } from '@/components/app-shell'
import { CommandPalette } from '@/components/command-palette'
import { PageTransition } from '@/components/ui/page-transition'
import { PermissionDenied } from '@/components/permission-denied'
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
import { SearchView } from '@/components/views/search-view'
import { WebhooksView } from '@/components/views/webhooks-view'
import { DataManagementView } from '@/components/views/data-management-view'
import { UsersView } from '@/components/views/users-view'
import { KnowledgeBaseView } from '@/components/views/knowledge-base-view'
import { apiGet, apiPost } from '@/lib/api-client'
import { OnboardingTour } from '@/components/onboarding-tour'
import { CurrentUserProvider } from '@/hooks/use-current-user'
import { canView } from '@/lib/permissions'
import type { AuthUser, DashboardStats, ViewKey } from '@/lib/types'

export default function Home() {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = React.useState(false)
  const [active, setActive] = React.useState<ViewKey>('dashboard')
  const [stats, setStats] = React.useState<DashboardStats | null>(null)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [profileContactId, setProfileContactId] = React.useState<string | null>(null)
  const [showTour, setShowTour] = React.useState(false)

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

  // After auth check, fetch onboarding state. If the tour hasn't been
  // completed or skipped yet, auto-start it for first-time users.
  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    apiGet<{ completed: boolean; skipped: boolean; steps: string[] }>('/api/onboarding')
      .then((d) => {
        if (cancelled) return
        if (!d.completed && !d.skipped) {
          // Small delay so the app shell finishes its first paint
          // before we mount the tour overlay.
          setTimeout(() => setShowTour(true), 400)
        }
      })
      .catch(() => {
        /* ignore — tour is non-blocking */
      })
    return () => {
      cancelled = true
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
    <CurrentUserProvider user={user}>
      <AppShell
        user={user}
        stats={stats}
        active={active}
        onNavigate={setActive}
        onLogout={handleLogout}
        onOpenPalette={() => setPaletteOpen(true)}
        onStartTour={() => setShowTour(true)}
      >
        <AnimatePresence mode="wait">
          <PageTransition viewKey={active}>
            {/* View-level permission gate. If the user lacks the
                permission required for the active view, render the
                PermissionDenied card instead of the view body. The
                API also enforces permissions server-side, so a user
                can't bypass this by crafting requests directly. */}
            {!canView(user, active) ? (
              <PermissionDenied
                view={active}
                role={user.role}
                onBack={() => setActive('dashboard')}
              />
            ) : (
              <>
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
                {active === 'search' && <SearchView onNavigate={setActive} />}
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
                {active === 'webhooks' && <WebhooksView />}
                {active === 'data-management' && <DataManagementView />}
                {active === 'users' && <UsersView />}
                {active === 'knowledge-base' && <KnowledgeBaseView />}
              </>
            )}
          </PageTransition>
        </AnimatePresence>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onNavigate={setActive}
          onOpenContact={() => setActive('chats')}
        />

        <OnboardingTour
          open={showTour}
          onOpenChange={setShowTour}
          onNavigate={setActive}
        />
      </AppShell>
    </CurrentUserProvider>
  )
}

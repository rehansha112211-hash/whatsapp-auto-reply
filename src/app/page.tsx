'use client'

import * as React from 'react'
import { AppShell } from '@/components/app-shell'
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
import { apiGet, apiPost } from '@/lib/api-client'
import type { AuthUser, DashboardStats, ViewKey } from '@/lib/types'

export default function Home() {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = React.useState(false)
  const [active, setActive] = React.useState<ViewKey>('dashboard')
  const [stats, setStats] = React.useState<DashboardStats | null>(null)

  // Check auth on mount
  React.useEffect(() => {
    let active = true
    apiGet<{ user: AuthUser | null }>('/api/auth/me')
      .then((d) => {
        if (active) setUser(d.user)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setAuthChecked(true)
      })
    return () => {
      active = false
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
    >
      {active === 'dashboard' && <DashboardView onNavigate={setActive} />}
      {active === 'whatsapp' && <WhatsAppView />}
      {active === 'chats' && <ChatsView />}
      {active === 'leads' && <LeadsView onNavigate={setActive} />}
      {active === 'simulator' && <SimulatorView onNavigate={setActive} />}
      {active === 'ai-settings' && <AISettingsView />}
      {active === 'company-settings' && <CompanySettingsView />}
      {active === 'owner-settings' && <OwnerSettingsView />}
      {active === 'autoreply-settings' && <AutoReplySettingsView />}
      {active === 'logs' && <LogsView />}
      {active === 'system' && <SystemView />}
    </AppShell>
  )
}

// ============================================================
// useCurrentUser — React context for the logged-in user.
//
// page.tsx already fetches /api/auth/me and stores the user. Rather
// than prop-drilling `user` into every view (or re-fetching /me on
// every view mount), we expose it via context so any client view
// can ask "can the current user do X?" via the `useCan` helper.
// ============================================================
'use client'

import * as React from 'react'
import type { AuthUser } from '@/lib/types'
import { can, type Permission } from '@/lib/permissions'

const CurrentUserContext = React.createContext<AuthUser | null>(null)

interface ProviderProps {
  user: AuthUser
  children: React.ReactNode
}

export function CurrentUserProvider({ user, children }: ProviderProps) {
  // Memoise so consumers don't re-render on parent re-renders unless
  // the user reference actually changes (login / logout).
  const value = React.useMemo(() => user, [user])
  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser(): AuthUser | null {
  return React.useContext(CurrentUserContext)
}

export function useCan(action: keyof Permission): boolean {
  const user = React.useContext(CurrentUserContext)
  return can(user, action)
}

// ============================================================
// Role-based permission system
//
// Three roles: admin (full), operator (operate, no settings/admin),
// viewer (read-only). The `can()` helper is the single entry point
// used by both server routes and client views to decide if an action
// is allowed.
// ============================================================
import type { AuthUser, ViewKey } from '@/lib/types'

export type Role = 'admin' | 'operator' | 'viewer'

export interface Permission {
  canViewDashboard: boolean
  canViewWhatsApp: boolean
  canViewChats: boolean
  canSendMessages: boolean // reply in chats, send broadcasts
  canViewLeads: boolean
  canViewAnalytics: boolean
  canViewLogs: boolean
  canViewSystem: boolean
  canManageSettings: boolean // AI, Company, Owner, AutoReply
  canManageUsers: boolean // create/edit/delete users
  canManageWebhooks: boolean
  canManageData: boolean // export/import, backup/restore
  canScheduleMessages: boolean
  canUseSimulator: boolean
}

export const ROLE_PERMISSIONS: Record<Role, Permission> = {
  admin: {
    canViewDashboard: true,
    canViewWhatsApp: true,
    canViewChats: true,
    canSendMessages: true,
    canViewLeads: true,
    canViewAnalytics: true,
    canViewLogs: true,
    canViewSystem: true,
    canManageSettings: true,
    canManageUsers: true,
    canManageWebhooks: true,
    canManageData: true,
    canScheduleMessages: true,
    canUseSimulator: true,
  },
  operator: {
    canViewDashboard: true,
    canViewWhatsApp: true,
    canViewChats: true,
    canSendMessages: true,
    canViewLeads: true,
    canViewAnalytics: true,
    canViewLogs: true,
    canViewSystem: true,
    canManageSettings: false,
    canManageUsers: false,
    canManageWebhooks: false,
    canManageData: false,
    canScheduleMessages: true,
    canUseSimulator: true,
  },
  viewer: {
    canViewDashboard: true,
    canViewWhatsApp: false,
    canViewChats: true,
    canSendMessages: false,
    canViewLeads: true,
    canViewAnalytics: true,
    canViewLogs: false,
    canViewSystem: false,
    canManageSettings: false,
    canManageUsers: false,
    canManageWebhooks: false,
    canManageData: false,
    canScheduleMessages: false,
    canUseSimulator: false,
  },
}

const ALL_VIEWS: ViewKey[] = [
  'dashboard',
  'whatsapp',
  'chats',
  'leads',
  'simulator',
  'broadcast',
  'scheduled',
  'search',
  'ai-settings',
  'company-settings',
  'owner-settings',
  'autoreply-settings',
  'analytics',
  'logs',
  'webhooks',
  'system',
  'data-management',
  'users',
  'contact-profile',
]

const OPERATOR_VIEWS: ViewKey[] = [
  'dashboard',
  'whatsapp',
  'chats',
  'leads',
  'simulator',
  'broadcast',
  'scheduled',
  'search',
  'analytics',
  'logs',
  'contact-profile',
]

const VIEWER_VIEWS: ViewKey[] = [
  'dashboard',
  'chats',
  'leads',
  'search',
  'analytics',
  'contact-profile',
]

// Which nav items are visible per role. Includes `contact-profile` so the
// "open profile" navigation keeps working when permission checks run.
export function getVisibleNavItems(role: Role): ViewKey[] {
  if (role === 'admin') return ALL_VIEWS
  if (role === 'operator') return OPERATOR_VIEWS
  return VIEWER_VIEWS
}

function normalizeRole(role: string): Role {
  if (role === 'admin' || role === 'operator' || role === 'viewer') return role
  return 'viewer'
}

export function can(user: AuthUser | null, action: keyof Permission): boolean {
  if (!user) return false
  const r = normalizeRole(user.role)
  return ROLE_PERMISSIONS[r][action] ?? false
}

export function roleOf(user: AuthUser | null): Role | null {
  if (!user) return null
  return normalizeRole(user.role)
}

// Map a ViewKey to the permission required to view it. Returns null if
// the view is always accessible (e.g. contact-profile is gated separately
// by the parent views that link to it).
export function permissionForView(view: ViewKey): keyof Permission | null {
  switch (view) {
    case 'dashboard':
      return 'canViewDashboard'
    case 'whatsapp':
      return 'canViewWhatsApp'
    case 'chats':
      return 'canViewChats'
    case 'leads':
      return 'canViewLeads'
    case 'simulator':
      return 'canUseSimulator'
    case 'broadcast':
      return 'canSendMessages'
    case 'scheduled':
      return 'canScheduleMessages'
    case 'search':
      return null // search is read-only, allowed for everyone authed
    case 'ai-settings':
    case 'company-settings':
    case 'owner-settings':
    case 'autoreply-settings':
      return 'canManageSettings'
    case 'analytics':
      return 'canViewAnalytics'
    case 'logs':
      return 'canViewLogs'
    case 'webhooks':
      return 'canManageWebhooks'
    case 'system':
      return 'canViewSystem'
    case 'data-management':
      return 'canManageData'
    case 'users':
      return 'canManageUsers'
    case 'contact-profile':
      return null // gated by parent chat list / leads (uses canViewChats)
    default:
      return null
  }
}

export function canView(user: AuthUser | null, view: ViewKey): boolean {
  const perm = permissionForView(view)
  if (perm === null) return true
  return can(user, perm)
}

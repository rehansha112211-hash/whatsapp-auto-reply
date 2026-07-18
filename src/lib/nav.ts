import {
  LayoutDashboard,
  QrCode,
  MessagesSquare,
  Flame,
  Bot,
  Building2,
  UserCog,
  Reply,
  ScrollText,
  Activity,
  FlaskConical,
  Megaphone,
  Clock,
  BarChart3,
  Search,
  Database,
  Webhook,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ViewKey } from '@/lib/types'

export interface NavItem {
  key: ViewKey
  label: string
  icon: LucideIcon
  description: string
  group: 'main' | 'settings' | 'system'
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Live overview', group: 'main' },
  { key: 'whatsapp', label: 'WhatsApp', icon: QrCode, description: 'QR login & session', group: 'main' },
  { key: 'chats', label: 'Chats', icon: MessagesSquare, description: 'Live conversations', group: 'main' },
  { key: 'leads', label: 'Leads', icon: Flame, description: 'Lead pipeline', group: 'main' },
  { key: 'simulator', label: 'Simulator', icon: FlaskConical, description: 'Test AI replies', group: 'main' },
  { key: 'broadcast', label: 'Broadcast', icon: Megaphone, description: 'Mass messages & templates', group: 'main' },
  { key: 'scheduled', label: 'Scheduled', icon: Clock, description: 'Scheduled messages', group: 'main' },
  { key: 'search', label: 'Search', icon: Search, description: 'Global message search', group: 'main' },
  { key: 'ai-settings', label: 'AI Settings', icon: Bot, description: 'Provider & model', group: 'settings' },
  { key: 'company-settings', label: 'Company', icon: Building2, description: 'Company profile', group: 'settings' },
  { key: 'owner-settings', label: 'Owner', icon: UserCog, description: 'Owner & takeover', group: 'settings' },
  { key: 'autoreply-settings', label: 'Auto Reply', icon: Reply, description: 'Reply rules', group: 'settings' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Insights & metrics', group: 'system' },
  { key: 'logs', label: 'Logs', icon: ScrollText, description: 'System logs', group: 'system' },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook, description: 'API integrations', group: 'system' },
  { key: 'system', label: 'System', icon: Activity, description: 'Health & status', group: 'system' },
  { key: 'data-management', label: 'Data', icon: Database, description: 'Export & import', group: 'system' },
  { key: 'users', label: 'Users', icon: Users, description: 'Manage team', group: 'system' },
]

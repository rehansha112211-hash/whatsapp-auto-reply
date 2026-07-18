// ============================================================
// Shared types for the WhatsApp AI Auto Reply Platform
// ============================================================

export type WhatsAppState =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'logged_out'

export type MessageDirection = 'incoming' | 'outgoing'
export type MessageSource = 'ai' | 'owner' | 'system' | 'customer'
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending'

export type ContactStatus =
  | 'new'
  | 'active'
  | 'lead'
  | 'customer'
  | 'blocked'

export type LeadCategory =
  | 'website'
  | 'app'
  | 'crm'
  | 'software'
  | 'ai_automation'
  | 'maintenance'
  | 'general'
  | 'support'
  | 'high_priority'

export type LogCategory =
  | 'startup'
  | 'backend'
  | 'whatsapp'
  | 'ai'
  | 'database'
  | 'errors'
  | 'security'
  | 'owner_notify'
  | 'lead'
  | 'frontend'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type NotificationType =
  | 'owner_request'
  | 'new_lead'
  | 'wa_connected'
  | 'wa_disconnected'
  | 'ai_error'
  | 'db_error'
  | 'new_customer'

export type ViewKey =
  | 'dashboard'
  | 'whatsapp'
  | 'chats'
  | 'leads'
  | 'ai-settings'
  | 'company-settings'
  | 'owner-settings'
  | 'autoreply-settings'
  | 'logs'
  | 'system'
  | 'simulator'
  | 'broadcast'
  | 'analytics'
  | 'contact-profile'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: string
}

export interface DashboardStats {
  whatsappState: WhatsAppState
  connectedNumber: string
  connectedName: string
  connectedAt: string | null
  todayMessages: number
  totalContacts: number
  aiReplies: number
  ownerReplies: number
  hotLeads: number
  uptimeSec: number
  dbStatus: 'ok' | 'error'
  aiProvider: string
  aiModel: string
  aiStatus: 'ok' | 'error' | 'untested'
  newCustomersToday: number
  unreadNotifications: number
  systemStartedAt: string
}

export interface ChatListItem {
  contactId: string
  name: string
  phone: string
  lastMessage: string
  lastMessageAt: string | null
  lastDirection: string
  unread: number
  leadScore: number
  detectedService: string
  pinned: boolean
  humanMode: boolean
  status: string
}

export interface ChatMessage {
  id: string
  contactId: string
  direction: MessageDirection
  source: MessageSource
  text: string
  status: MessageStatus
  read: boolean
  timestamp: string
}

export interface ContactDetail {
  id: string
  name: string
  phone: string
  countryCode: string
  language: string
  status: ContactStatus
  leadScore: number
  detectedService: string
  notes: string
  humanMode: boolean
  firstSeen: string
  lastSeen: string
  lastMessageAt: string | null
  memories: { key: string; value: string }[]
  summary: string
}

export interface LeadRow {
  id: string
  name: string
  phone: string
  detectedService: string
  leadScore: number
  status: string
  lastMessage: string
  lastMessageAt: string | null
  category: string
  notified: boolean
}

export interface LogRow {
  id: string
  category: LogCategory
  level: LogLevel
  message: string
  meta: string
  contactId: string | null
  createdAt: string
}

export interface SystemHealth {
  backend: 'ok' | 'error'
  frontend: 'ok' | 'error'
  whatsapp: WhatsAppState
  database: 'ok' | 'error'
  aiProvider: 'ok' | 'error' | 'untested'
  session: 'ok' | 'expired' | 'none'
  cpu: number
  ram: number
  disk: number
  uptimeSec: number
}

export const LEAD_CATEGORIES: { value: LeadCategory; label: string; icon: string }[] = [
  { value: 'website', label: 'Website Lead', icon: 'globe' },
  { value: 'app', label: 'Android App Lead', icon: 'smartphone' },
  { value: 'crm', label: 'CRM Lead', icon: 'database' },
  { value: 'software', label: 'Business Software', icon: 'code' },
  { value: 'ai_automation', label: 'AI Automation', icon: 'bot' },
  { value: 'maintenance', label: 'Maintenance', icon: 'wrench' },
  { value: 'general', label: 'General Question', icon: 'help-circle' },
  { value: 'support', label: 'Support Request', icon: 'life-buoy' },
  { value: 'high_priority', label: 'High Priority Client', icon: 'flame' },
]

export const QORVIX_SERVICES = [
  'Custom Website Development',
  'Android App Development',
  'AI Automation',
  'Business Software',
  'CRM Development',
  'E-Commerce Website',
  'Portfolio Website',
  'Landing Pages',
  'Dashboard Development',
  'UI/UX Design',
  'API Integration',
  'Hosting',
  'Deployment',
  'Maintenance',
]

export const QORVIX_COMPANY = {
  name: 'QorvixNode Technologies',
  website: 'https://qorvixnodetechnologies.indevs.in',
  description:
    'QorvixNode Technologies is a software development company delivering custom websites, Android apps, AI automation, CRMs, business software and end-to-end digital solutions for modern businesses.',
}

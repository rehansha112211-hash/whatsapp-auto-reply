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
  | 'scheduled'
  | 'analytics'
  | 'contact-profile'
  | 'search'
  | 'data-management'
  | 'webhooks'
  | 'users'
  | 'knowledge-base'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: string // 'admin' | 'operator' | 'viewer' — narrowed via permissions.ts
}

// User list row returned by /api/users — never includes passwordHash.
export interface UserListRow {
  id: string
  username: string
  displayName: string
  role: string
  lastLoginAt: string | null
  createdAt: string
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
  tags: TagItem[]
}

// A conversation tag/label (color is one of TAG_COLORS keys in src/lib/format.ts)
export interface TagItem {
  id: string
  name: string
  color: string
}

// Tag with a count of contacts using it (used in tag management UI)
export interface TagWithCount extends TagItem {
  contactCount: number
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
  // Auto-translation fields (only meaningful for incoming messages,
  // but present on all rows for type consistency).
  detectedLanguage?: string
  translatedText?: string
  isTranslated?: boolean
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
  tags: TagItem[]
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
  tags: TagItem[]
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

export interface ScheduledMessageRow {
  id: string
  contactId: string
  contactName: string
  contactPhone: string
  text: string
  scheduledAt: string
  status: 'pending' | 'sent' | 'cancelled' | 'failed'
  sentAt: string | null
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

// ---------------- Quick Replies (composer snippets) ----------------
export type QuickReplyCategory =
  | 'greeting'
  | 'pricing'
  | 'support'
  | 'hours'
  | 'general'

export interface QuickReplyRow {
  id: string
  shortcut: string
  title: string
  body: string
  category: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

// ---------------- Global message search ----------------
export interface SearchMessageItem {
  messageId: string
  contactId: string
  contactName: string
  contactPhone: string
  text: string
  direction: MessageDirection
  source: MessageSource
  timestamp: string
  leadScore: number
  // ~120 char window around the first match (lowercased query position preserved).
  matchedSnippet: string
  // Index in matchedSnippet where the query starts (for client-side highlight).
  matchStart: number
  // Length of the matched query portion within matchedSnippet.
  matchLength: number
}

export interface ContactFacetItem {
  contactId: string
  contactName: string
  count: number
}

export interface SearchResponse {
  items: SearchMessageItem[]
  total: number
  limit: number
  q: string
  contactsFacet: ContactFacetItem[]
}

// ---------------- Webhooks ----------------
export type WebhookEventCategory =
  | 'message'
  | 'lead'
  | 'owner'
  | 'ai'
  | 'whatsapp'
  | 'contact'

export interface WebhookEventDef {
  value: string
  label: string
  description: string
  category: WebhookEventCategory
}

export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  { value: 'message.received', label: 'Message Received', description: 'A new incoming WhatsApp message from a contact', category: 'message' },
  { value: 'message.sent', label: 'Message Sent', description: 'A reply was sent (AI or owner) to a contact', category: 'message' },
  { value: 'lead.created', label: 'Lead Created', description: 'A contact was first tagged as a lead', category: 'lead' },
  { value: 'lead.hot', label: 'Hot Lead Detected', description: 'A contact crossed the lead score threshold', category: 'lead' },
  { value: 'owner.requested', label: 'Owner Requested', description: 'A contact asked to speak to a human', category: 'owner' },
  { value: 'ai.error', label: 'AI Error', description: 'The AI engine failed to produce a reply', category: 'ai' },
  { value: 'contact.created', label: 'Contact Created', description: 'A new contact was added to the database', category: 'contact' },
  { value: 'whatsapp.connected', label: 'WhatsApp Connected', description: 'The WhatsApp session was connected', category: 'whatsapp' },
  { value: 'whatsapp.disconnected', label: 'WhatsApp Disconnected', description: 'The WhatsApp session was disconnected', category: 'whatsapp' },
]

export interface WebhookDeliveryStat {
  total: number
  delivered: number
  failed: number
  lastDeliveryAt: string | null
}

export interface WebhookListItem {
  id: string
  name: string
  url: string
  secret: string // masked
  events: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  deliveries: WebhookDeliveryStat
}

export interface WebhookDeliveryRow {
  id: string
  event: string
  payload: string
  status: string
  statusCode: number
  response: string
  attempts: number
  createdAt: string
  deliveredAt: string | null
}

// ---------------- Knowledge Base ----------------
export type KnowledgeCategory =
  | 'pricing'
  | 'services'
  | 'policies'
  | 'faq'
  | 'general'

export interface KnowledgeArticleItem {
  id: string
  title: string
  content: string
  category: string // KnowledgeCategory (kept as string for API flexibility)
  tags: string[]
  isActive: boolean
  priority: number
  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeSearchHit {
  id: string
  title: string
  content: string
  category: string
  relevance: number
}

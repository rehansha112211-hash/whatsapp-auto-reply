// ============================================================
// Template variables — single source of truth for `{variable}`
// placeholders used in quick replies, broadcast templates and
// scheduled messages.
//
// `substituteVariables(text, contact)` replaces every recognised
// `{token}` with the contact's actual data. Unknown tokens (or
// tokens whose backing data is missing) are left untouched so the
// operator can spot a typo.
//
// `AVAILABLE_VARIABLES` is consumed by <VariableHelper /> to render
// the chip row + reference list and by the variable-picker tooltip.
// ============================================================
import { QORVIX_COMPANY } from './types'

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/**
 * Shape of the contact data we need for substitution. Every field
 * is optional — `substituteVariables` will simply leave the
 * matching `{token}` in place when a field is missing. This lets
 * the same function work on the client (where the chat list row
 * only carries a handful of fields) and on the server (where the
 * full Prisma contact is available).
 */
export interface ContactVariableData {
  name?: string | null
  phone?: string | null
  leadScore?: number | null
  detectedService?: string | null
  language?: string | null
  status?: string | null
  firstSeen?: Date | string | null
  lastSeen?: Date | string | null
  notes?: string | null
}

export interface VariableDef {
  /** The literal placeholder to type into a message, e.g. `{name}`. */
  key: string
  /** Short human-readable label, e.g. "Contact name". */
  label: string
  /** One-line explanation shown in the reference list. */
  description: string
  /** Example value used in the no-contact preview. */
  example: string
}

// ------------------------------------------------------------
// Available variables (order = display order)
// ------------------------------------------------------------

export const AVAILABLE_VARIABLES: readonly VariableDef[] = [
  {
    key: '{name}',
    label: 'Contact name',
    description: "Contact's full name as saved in the database.",
    example: 'Rahul Sharma',
  },
  {
    key: '{first_name}',
    label: 'First name',
    description: 'First word of the contact name — friendly salutation.',
    example: 'Rahul',
  },
  {
    key: '{phone}',
    label: 'Phone',
    description: "Contact's WhatsApp phone number (with country code).",
    example: '+91 98765 43210',
  },
  {
    key: '{lead_score}',
    label: 'Lead score',
    description: 'Current lead score (0–100).',
    example: '78',
  },
  {
    key: '{service}',
    label: 'Service',
    description: 'Detected service interest (website, app, crm, …).',
    example: 'website',
  },
  {
    key: '{language}',
    label: 'Language',
    description: 'Preferred language code (en, hi, …).',
    example: 'en',
  },
  {
    key: '{status}',
    label: 'Status',
    description: 'Contact status: new, active, lead or customer.',
    example: 'lead',
  },
  {
    key: '{company}',
    label: 'Company',
    description: 'Your company name (from company settings).',
    example: QORVIX_COMPANY.name,
  },
  {
    key: '{website}',
    label: 'Website',
    description: 'Company website URL.',
    example: QORVIX_COMPANY.website,
  },
  {
    key: '{date}',
    label: 'Date',
    description: "Today's date (YYYY-MM-DD, evaluated at send time).",
    example: '2025-01-15',
  },
  {
    key: '{time}',
    label: 'Time',
    description: 'Current time (HH:MM, 24h, evaluated at send time).',
    example: '14:30',
  },
  {
    key: '{day}',
    label: 'Day',
    description: 'Current day of the week (evaluated at send time).',
    example: 'Monday',
  },
] as const

// ------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------

const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'long' })

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** YYYY-MM-DD using the *local* clock so it matches what the user sees. */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** HH:MM (24h, local time). */
function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatDay(d: Date): string {
  return DAY_FORMATTER.format(d)
}

/** First non-empty token after whitespace-splitting the name. */
function firstName(name: string | null | undefined): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

/**
 * Coerce a possibly-null/undefined value to a string. Returns `null`
 * when the value is empty/unknown — the caller treats `null` as
 * "leave the placeholder alone".
 */
function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

// ------------------------------------------------------------
// Core substitution
// ------------------------------------------------------------

/**
 * Replace every recognised `{variable}` placeholder in `text` with
 * the corresponding value from `contact`. Unknown tokens — and
 * recognised tokens whose backing data is missing — are left
 * untouched so the operator can spot a typo or a missing field.
 *
 * Date / time / day tokens are evaluated against the current
 * process clock (i.e. at send time on the server, at render time
 * on the client). This is intentional: a scheduled message sent
 * three days from now should show "Friday" on Friday, not on the
 * day it was authored.
 */
export function substituteVariables(
  text: string,
  contact: ContactVariableData,
): string {
  if (!text) return text

  const now = new Date()
  const map: Record<string, string | null> = {
    '{name}': stringify(contact.name),
    '{first_name}': stringify(firstName(contact.name)),
    '{phone}': stringify(contact.phone),
    '{lead_score}': stringify(contact.leadScore),
    '{service}': stringify(contact.detectedService),
    '{language}': stringify(contact.language),
    '{status}': stringify(contact.status),
    '{company}': QORVIX_COMPANY.name,
    '{website}': QORVIX_COMPANY.website,
    '{date}': formatDate(now),
    '{time}': formatTime(now),
    '{day}': formatDay(now),
  }

  // Match `{word}` style placeholders. We allow letters, digits and
  // underscores inside the braces — anything else (e.g. JSON in
  // braces) is left alone.
  return text.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (full) => {
    const value = map[full]
    if (value === null || value === undefined) return full
    return value
  })
}

/**
 * Cheap test used by UI affordances (toast hint, "has variables"
 * badge) to check whether a body would benefit from substitution.
 * Returns true if the text contains at least one `{token}`-shaped
 * placeholder — recognised or not.
 */
export function hasVariables(text: string): boolean {
  return /\{[a-z_][a-z0-9_]*\}/i.test(text)
}

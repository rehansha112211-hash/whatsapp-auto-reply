// ============================================================
// Contacts API — per-contact detail + patch
//
// GET   /api/contacts/[id]
//   → ContactDetail  (all contact fields + memories + a generated summary)
//
// PATCH /api/contacts/[id]   body: { notes?, pinned?, status? }
//   → updated contact (full ContactDetail shape)
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import type { ContactDetail, ContactStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: readonly ContactStatus[] = [
  'new',
  'active',
  'lead',
  'customer',
  'blocked',
] as const

function isContactStatus(v: string): v is ContactStatus {
  return (VALID_STATUSES as readonly string[]).includes(v)
}

function categoryLabel(svc: string): string {
  const map: Record<string, string> = {
    website: 'Website Development',
    app: 'Android App Development',
    crm: 'CRM Development',
    software: 'Business Software',
    ai_automation: 'AI Automation',
    maintenance: 'Maintenance',
    general: 'General Inquiry',
    support: 'Support Request',
    high_priority: 'High Priority',
  }
  return map[svc] ?? (svc ? svc : 'Not detected yet')
}

// Build a short human-readable summary from the contact's memory + recent
// messages + lead info. Shown at the top of the details panel.
function buildSummary(opts: {
  name: string
  detectedService: string
  language: string
  leadScore: number
  status: string
  humanMode: boolean
  firstSeen: Date
  memories: { key: string; value: string }[]
  recentMessages: { source: string; text: string }[]
}): string {
  const parts: string[] = []
  const memMap = new Map<string, string>()
  for (const m of opts.memories) memMap.set(m.key, m.value)

  const business = memMap.get('business')
  const requirements = memMap.get('requirements')
  const intent = memMap.get('last_intent') ?? memMap.get('intent')

  if (requirements) {
    parts.push(`Interested in: ${requirements}.`)
  } else if (opts.detectedService) {
    parts.push(`Interested in ${categoryLabel(opts.detectedService)}.`)
  }
  if (business) parts.push(`Business: ${business}.`)
  if (opts.language) parts.push(`Language: ${opts.language}.`)
  if (intent) parts.push(`Last intent: ${intent}.`)
  parts.push(`Lead score: ${opts.leadScore}.`)
  parts.push(`Status: ${opts.status}.`)
  if (opts.humanMode) parts.push('Currently in human mode (AI paused).')
  parts.push(`First seen: ${opts.firstSeen.toLocaleDateString()}.`)

  // Add the last customer message verbatim if we have one
  const lastCustomer = opts.recentMessages.find((m) => m.source === 'customer')
  if (lastCustomer) {
    const snip = lastCustomer.text.slice(0, 120)
    parts.push(`Last message: "${snip}${lastCustomer.text.length > 120 ? '…' : ''}"`)
  }

  return parts.join(' ')
}

// ------------------------------------------------------------
// GET — full contact detail
// ------------------------------------------------------------
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      memories: { select: { key: true, value: true } },
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: { source: true, text: true },
      },
    },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  const summary = buildSummary({
    name: contact.name,
    detectedService: contact.detectedService,
    language: contact.language,
    leadScore: contact.leadScore,
    status: contact.status,
    humanMode: contact.humanMode,
    firstSeen: contact.firstSeen,
    memories: contact.memories,
    recentMessages: contact.messages,
  })

  const detail: ContactDetail = {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    countryCode: contact.countryCode,
    language: contact.language,
    status: contact.status as ContactStatus,
    leadScore: contact.leadScore,
    detectedService: contact.detectedService,
    notes: contact.notes,
    humanMode: contact.humanMode,
    firstSeen: contact.firstSeen.toISOString(),
    lastSeen: contact.lastSeen.toISOString(),
    lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
    memories: contact.memories.map((m) => ({ key: m.key, value: m.value })),
    summary,
  }

  return NextResponse.json(detail)
}

// ------------------------------------------------------------
// PATCH — update notes / pinned / status
// ------------------------------------------------------------
interface PatchBody {
  notes?: unknown
  pinned?: unknown
  status?: unknown
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Build the patch incrementally — only fields actually present get updated.
  const data: { notes?: string; pinned?: boolean; status?: ContactStatus } = {}

  if (typeof body.notes === 'string') {
    data.notes = body.notes.slice(0, 4000)
  }
  if (typeof body.pinned === 'boolean') {
    data.pinned = body.pinned
  }
  if (typeof body.status === 'string' && isContactStatus(body.status)) {
    data.status = body.status
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update (notes, pinned, status)' },
      { status: 400 },
    )
  }

  try {
    const updated = await db.contact.update({
      where: { id },
      data,
      include: {
        memories: { select: { key: true, value: true } },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 5,
          select: { source: true, text: true },
        },
      },
    })

    const summary = buildSummary({
      name: updated.name,
      detectedService: updated.detectedService,
      language: updated.language,
      leadScore: updated.leadScore,
      status: updated.status,
      humanMode: updated.humanMode,
      firstSeen: updated.firstSeen,
      memories: updated.memories,
      recentMessages: updated.messages,
    })

    const detail: ContactDetail = {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      countryCode: updated.countryCode,
      language: updated.language,
      status: updated.status as ContactStatus,
      leadScore: updated.leadScore,
      detectedService: updated.detectedService,
      notes: updated.notes,
      humanMode: updated.humanMode,
      firstSeen: updated.firstSeen.toISOString(),
      lastSeen: updated.lastSeen.toISOString(),
      lastMessageAt: updated.lastMessageAt?.toISOString() ?? null,
      memories: updated.memories.map((m) => ({ key: m.key, value: m.value })),
      summary,
    }

    return NextResponse.json(detail)
  } catch (err) {
    // Prisma throws P2025 when the record doesn't exist
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('P2025') || message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

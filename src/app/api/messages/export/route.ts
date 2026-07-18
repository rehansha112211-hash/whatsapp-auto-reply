// ============================================================
// Messages export API
//
// GET /api/messages/export?contactId=<id>&format=csv|json
//   → returns the full conversation as a downloadable file.
//
//   · CSV  → columns: timestamp, direction, source, status, text
//   · JSON → { contact: {...}, messages: [...] }
//
// Headers:
//   Content-Type:        text/csv | application/json
//   Content-Disposition: attachment; filename="chat-{contactName}.{ext}"
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { toCsv } from '@/lib/format'

export const dynamic = 'force-dynamic'

type ExportFormat = 'csv' | 'json'

const VALID_FORMATS: readonly ExportFormat[] = ['csv', 'json'] as const

function isFormat(v: string | null): v is ExportFormat {
  return v !== null && (VALID_FORMATS as readonly string[]).includes(v)
}

// Replace characters that are unsafe in filenames (across OSes).
function safeName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned.length > 0 ? cleaned : 'conversation'
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const contactId = (searchParams.get('contactId') ?? '').trim()
  const format = isFormat(searchParams.get('format'))
    ? (searchParams.get('format') as ExportFormat)
    : 'csv'

  if (!contactId) {
    return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
  }

  // Fetch contact details (used for both filename and the JSON envelope).
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      name: true,
      phone: true,
      countryCode: true,
      language: true,
      status: true,
      leadScore: true,
      detectedService: true,
      notes: true,
      humanMode: true,
      pinned: true,
      firstSeen: true,
      lastSeen: true,
      lastMessageAt: true,
    },
  })
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Fetch ALL messages ordered ASC (oldest → newest) so the exported file
  // reads naturally as a transcript.
  const messages = await db.message.findMany({
    where: { contactId },
    orderBy: { timestamp: 'asc' },
    select: {
      id: true,
      direction: true,
      source: true,
      text: true,
      status: true,
      read: true,
      timestamp: true,
    },
  })

  const fileBase = safeName(contact.name || contact.phone)

  if (format === 'json') {
    const payload = {
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        countryCode: contact.countryCode,
        language: contact.language,
        status: contact.status,
        leadScore: contact.leadScore,
        detectedService: contact.detectedService,
        notes: contact.notes,
        humanMode: contact.humanMode,
        pinned: contact.pinned,
        firstSeen: contact.firstSeen.toISOString(),
        lastSeen: contact.lastSeen.toISOString(),
        lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      },
      messages: messages.map((m) => ({
        id: m.id,
        timestamp: m.timestamp.toISOString(),
        direction: m.direction,
        source: m.source,
        status: m.status,
        read: m.read,
        text: m.text,
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: user.username,
    }
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="chat-${fileBase}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // CSV
  const rows = messages.map((m) => ({
    timestamp: m.timestamp.toISOString(),
    direction: m.direction,
    source: m.source,
    status: m.status,
    text: m.text,
  }))
  const csv = rows.length > 0 ? toCsv(rows) : 'timestamp,direction,source,status,text\n'

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="chat-${fileBase}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}

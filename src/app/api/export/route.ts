// ============================================================
// Export API — backup Quick Replies, Tags, Templates as JSON.
//
// GET /api/export?type=<quick-replies|tags|templates|all>
//   Auth-gated via getCurrentUser() → 401 when unauthenticated.
//   Returns a JSON envelope with `Content-Disposition: attachment`
//   so browsers offer to download the file.
//
// Envelope shape (v1.0):
//   {
//     exportedAt: string (ISO),
//     version: '1.0',
//     quickReplies?: [{ shortcut, title, body, category }],
//     tags?:        [{ name, color }],
//     templates?:   [{ name, body, category }],
//   }
// ============================================================
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type ExportType = 'quick-replies' | 'tags' | 'templates' | 'all'

const VALID_TYPES: readonly ExportType[] = [
  'quick-replies',
  'tags',
  'templates',
  'all',
] as const

function isExportType(v: string | null): v is ExportType {
  return v !== null && (VALID_TYPES as readonly string[]).includes(v)
}

interface QuickReplyExport {
  shortcut: string
  title: string
  body: string
  category: string
}

interface TagExport {
  name: string
  color: string
}

interface TemplateExport {
  name: string
  body: string
  category: string
}

interface ExportEnvelope {
  exportedAt: string
  version: '1.0'
  quickReplies?: QuickReplyExport[]
  tags?: TagExport[]
  templates?: TemplateExport[]
}

function timestampForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const typeParam = req.nextUrl.searchParams.get('type') ?? 'all'
  const type: ExportType = isExportType(typeParam) ? typeParam : 'all'

  const includeQuickReplies = type === 'all' || type === 'quick-replies'
  const includeTags = type === 'all' || type === 'tags'
  const includeTemplates = type === 'all' || type === 'templates'

  const envelope: ExportEnvelope = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
  }

  // Run all requested queries in parallel for snappy exports.
  const tasks: Promise<void>[] = []

  if (includeQuickReplies) {
    tasks.push(
      db.quickReply
        .findMany({
          orderBy: [{ category: 'asc' }, { shortcut: 'asc' }],
          select: { shortcut: true, title: true, body: true, category: true },
        })
        .then((rows) => {
          envelope.quickReplies = rows as QuickReplyExport[]
        }),
    )
  }

  if (includeTags) {
    tasks.push(
      db.tag
        .findMany({
          orderBy: [{ name: 'asc' }],
          select: { name: true, color: true },
        })
        .then((rows) => {
          envelope.tags = rows as TagExport[]
        }),
    )
  }

  if (includeTemplates) {
    tasks.push(
      db.template
        .findMany({
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          select: { name: true, body: true, category: true },
        })
        .then((rows) => {
          envelope.templates = rows as TemplateExport[]
        }),
    )
  }

  await Promise.all(tasks)

  const json = JSON.stringify(envelope, null, 2)
  const filename = `qorvixnode-export-${type}-${timestampForFilename(new Date())}.json`

  // Return as an attachment so browsers prompt to download the JSON file.
  // Body remains valid JSON for clients that prefer to parse it directly.
  return new Response(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ============================================================
// Import API — restore Quick Replies, Tags, Templates from a
// JSON export envelope (v1.0).
//
// POST /api/import
//   body: { data: { quickReplies?, tags?, templates? }, mode: 'merge' | 'replace' }
//
//   · merge   → add new items, skip existing (by shortcut/name). Existing rows are NOT deleted.
//   · replace → delete all existing items of that type, then import the new ones. DANGEROUS.
//
// Quick Replies: upsert by `shortcut`. Tag upsert by `name`. Template
// upsert by `name`; if a template with the same name already exists
// (or was already imported in this batch) a numeric suffix is appended.
//
// Returns: { ok, imported: {quickReplies, tags, templates}, skipped: {…} }
// A Log entry (category='security', level='info') records the action.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type ImportMode = 'merge' | 'replace'

// ---------------- Validation helpers ----------------
const VALID_QUICK_REPLY_CATEGORIES = new Set([
  'greeting',
  'pricing',
  'support',
  'hours',
  'general',
])

const VALID_TEMPLATE_CATEGORIES = new Set([
  'greeting',
  'promotion',
  'followup',
  'support',
  'general',
])

const VALID_TAG_COLORS = new Set([
  'emerald',
  'amber',
  'rose',
  'sky',
  'violet',
  'zinc',
  'orange',
  'teal',
])

const SHORTCUT_RE = /^[a-zA-Z0-9_]+$/

interface QuickReplyInput {
  shortcut?: unknown
  title?: unknown
  body?: unknown
  category?: unknown
}

interface TagInput {
  name?: unknown
  color?: unknown
}

interface TemplateInput {
  name?: unknown
  body?: unknown
  category?: unknown
}

interface ImportPayload {
  quickReplies?: unknown
  tags?: unknown
  templates?: unknown
}

interface ImportBody {
  data?: unknown
  mode?: unknown
}

interface Counts {
  quickReplies: number
  tags: number
  templates: number
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function asString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s.length === 0 || s.length > max) return null
  return s
}

// Parse + validate the incoming quick-reply list. Invalid rows are
// silently dropped (they count toward `skipped.quickReplies`).
function parseQuickReplies(rows: unknown[]): {
  valid: { shortcut: string; title: string; body: string; category: string }[]
  skipped: number
} {
  const valid: {
    shortcut: string
    title: string
    body: string
    category: string
  }[] = []
  let skipped = 0
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      skipped++
      continue
    }
    const r = raw as QuickReplyInput
    const shortcut = asString(r.shortcut, 40)
    const title = asString(r.title, 120)
    const body = asString(r.body, 4000)
    const category =
      typeof r.category === 'string' &&
      VALID_QUICK_REPLY_CATEGORIES.has(r.category)
        ? r.category
        : 'general'
    if (!shortcut || !title || !body || !SHORTCUT_RE.test(shortcut)) {
      skipped++
      continue
    }
    valid.push({ shortcut, title, body, category })
  }
  return { valid, skipped }
}

function parseTags(rows: unknown[]): {
  valid: { name: string; color: string }[]
  skipped: number
} {
  const valid: { name: string; color: string }[] = []
  let skipped = 0
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      skipped++
      continue
    }
    const r = raw as TagInput
    const name = asString(r.name, 40)
    const color =
      typeof r.color === 'string' && VALID_TAG_COLORS.has(r.color)
        ? r.color
        : 'emerald'
    if (!name) {
      skipped++
      continue
    }
    valid.push({ name, color })
  }
  return { valid, skipped }
}

function parseTemplates(rows: unknown[]): {
  valid: { name: string; body: string; category: string }[]
  skipped: number
} {
  const valid: {
    name: string
    body: string
    category: string
  }[] = []
  let skipped = 0
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      skipped++
      continue
    }
    const r = raw as TemplateInput
    const name = asString(r.name, 120)
    const body = asString(r.body, 4000)
    const category =
      typeof r.category === 'string' &&
      VALID_TEMPLATE_CATEGORIES.has(r.category)
        ? r.category
        : 'general'
    if (!name || !body) {
      skipped++
      continue
    }
    valid.push({ name, body, category })
  }
  return { valid, skipped }
}

// Ensure a template name is unique. If a template already exists with
// the given name (in DB or in the current batch), append " (2)", " (3)", …
async function uniqueTemplateName(
  base: string,
  taken: Set<string>,
): Promise<string> {
  if (!taken.has(base)) {
    const clash = await db.template.findFirst({
      where: { name: base },
      select: { id: true },
    })
    if (!clash) {
      taken.add(base)
      return base
    }
  }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`
    if (taken.has(candidate)) continue
    const clash = await db.template.findFirst({
      where: { name: candidate },
      select: { id: true },
    })
    if (!clash) {
      taken.add(candidate)
      return candidate
    }
  }
  // Extremely unlikely fallback — append a timestamp.
  const candidate = `${base} (${Date.now()})`
  taken.add(candidate)
  return candidate
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canManageData')) {
    return NextResponse.json(
      { error: 'You need admin role to import data' },
      { status: 403 },
    )
  }

  let body: ImportBody
  try {
    body = (await req.json()) as ImportBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const mode: ImportMode = body.mode === 'replace' ? 'replace' : 'merge'

  const payload = body.data
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'Missing `data` field in request body' },
      { status: 400 },
    )
  }
  const p = payload as ImportPayload

  // Parse + validate each section up-front so we never half-import.
  const qrParsed = parseQuickReplies(asArray(p.quickReplies))
  const tagParsed = parseTags(asArray(p.tags))
  const tplParsed = parseTemplates(asArray(p.templates))

  if (
    qrParsed.valid.length === 0 &&
    tagParsed.valid.length === 0 &&
    tplParsed.valid.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          'No valid rows to import. Check the file format (expected v1.0 export envelope).',
      },
      { status: 400 },
    )
  }

  const imported: Counts = { quickReplies: 0, tags: 0, templates: 0 }
  const skipped: Counts = {
    quickReplies: qrParsed.skipped,
    tags: tagParsed.skipped,
    templates: tplParsed.skipped,
  }

  // Everything below is wrapped in a transaction so a partial failure
  // (e.g. a unique constraint race) doesn't leave the DB in a half-state.
  await db.$transaction(async (tx) => {
    // -------- Quick Replies --------
    if (qrParsed.valid.length > 0) {
      if (mode === 'replace') {
        await tx.quickReply.deleteMany({})
      }
      for (const r of qrParsed.valid) {
        const exists =
          mode === 'merge'
            ? await tx.quickReply.findUnique({
                where: { shortcut: r.shortcut },
                select: { id: true },
              })
            : null
        if (exists) {
          skipped.quickReplies++
          continue
        }
        await tx.quickReply.create({
          data: {
            shortcut: r.shortcut,
            title: r.title,
            body: r.body,
            category: r.category,
          },
        })
        imported.quickReplies++
      }
    }

    // -------- Tags --------
    if (tagParsed.valid.length > 0) {
      if (mode === 'replace') {
        // ContactTag rows cascade-delete on Tag delete (per schema).
        await tx.tag.deleteMany({})
      }
      for (const t of tagParsed.valid) {
        const exists =
          mode === 'merge'
            ? await tx.tag.findFirst({
                where: { name: t.name },
                select: { id: true },
              })
            : null
        if (exists) {
          skipped.tags++
          continue
        }
        try {
          await tx.tag.create({ data: { name: t.name, color: t.color } })
          imported.tags++
        } catch (err) {
          // Race / constraint violation → count as skipped, keep going.
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('Unique constraint')) {
            skipped.tags++
          } else {
            throw err
          }
        }
      }
    }

    // -------- Templates --------
    if (tplParsed.valid.length > 0) {
      if (mode === 'replace') {
        await tx.template.deleteMany({})
      }
      const taken = new Set<string>()
      for (const t of tplParsed.valid) {
        // In merge mode: skip existing names. In replace mode: also dedupe
        // within the incoming batch by appending a numeric suffix.
        if (mode === 'merge') {
          const exists = await tx.template.findFirst({
            where: { name: t.name },
            select: { id: true },
          })
          if (exists) {
            skipped.templates++
            continue
          }
        }
        const name = await uniqueTemplateName(t.name, taken)
        await tx.template.create({
          data: { name, body: t.body, category: t.category },
        })
        imported.templates++
      }
    }
  })

  // -------- Audit log --------
  const summary = `Imported ${imported.quickReplies} quick replies, ${imported.tags} tags, ${imported.templates} templates (mode: ${mode})`
  try {
    await db.log.create({
      data: {
        category: 'security',
        level: 'info',
        message: summary,
        meta: JSON.stringify({
          mode,
          imported,
          skipped,
          userId: user.id,
          username: user.username,
        }),
      },
    })
  } catch {
    // Logging is best-effort; never fail the import because of it.
  }

  return NextResponse.json({ ok: true, imported, skipped })
}

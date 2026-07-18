// ============================================================
// Contacts API — conversation memory CRUD
//
// POST   /api/contacts/[id]/memory   body: { key: string, value: string }
//   → upserts a ConversationMemory for this contact
//   → { ok: true }
//
// DELETE /api/contacts/[id]/memory?key=X
//   → removes the memory with that key for this contact
//   → { ok: true }
// ============================================================
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface PostBody {
  key?: unknown
  value?: unknown
}

function cleanKey(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const k = v.trim().toLowerCase().replace(/\s+/g, '_')
  if (!k) return null
  if (k.length > 64) return k.slice(0, 64)
  return k
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const key = cleanKey(body.key)
  if (!key) {
    return NextResponse.json({ error: 'key (non-empty string) is required' }, { status: 400 })
  }
  const value = typeof body.value === 'string' ? body.value.slice(0, 4000) : ''

  // Verify the contact exists so we can return a 404 instead of a 500.
  const exists = await db.contact.findUnique({ where: { id }, select: { id: true } })
  if (!exists) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  try {
    await db.conversationMemory.upsert({
      where: { contactId_key: { contactId: id, key } },
      create: { contactId: id, key, value },
      update: { value },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const key = cleanKey(req.nextUrl.searchParams.get('key'))
  if (!key) {
    return NextResponse.json({ error: 'key query parameter is required' }, { status: 400 })
  }

  try {
    await db.conversationMemory.deleteMany({
      where: { contactId: id, key },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

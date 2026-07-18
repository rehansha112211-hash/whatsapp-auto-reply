// ============================================================
// Users API — multi-user team management (admin only)
//
// GET   /api/users
//   Lists every user (without passwordHash). Returns
//   { items: UserListRow[] } sorted by createdAt ASC so the
//   seeded admin/operator/viewer appear in a predictable order.
//
// POST  /api/users   body: { username, password, displayName, role }
//   Creates a new user. Username must be unique. Password is hashed
//   with the same SHA-256 scheme used by auth.ts. Writes a security
//   audit log entry on success.
// ============================================================
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hashPassword } from '@/lib/auth'
import { can, type Role } from '@/lib/permissions'
import type { UserListRow } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_ROLES: readonly Role[] = ['admin', 'operator', 'viewer'] as const

function isValidRole(v: unknown): v is Role {
  return typeof v === 'string' && (VALID_ROLES as readonly string[]).includes(v)
}

function toRow(u: {
  id: string
  username: string
  displayName: string
  role: string
  lastLoginAt: Date | null
  createdAt: Date
}): UserListRow {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }
}

// ------------------------------------------------------------
// GET — list all users
// ------------------------------------------------------------
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(user, 'canManageUsers')) {
    return NextResponse.json(
      { error: 'You do not have permission to manage users' },
      { status: 403 },
    )
  }

  const rows = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ items: rows.map(toRow) })
}

// ------------------------------------------------------------
// POST — create a new user
// ------------------------------------------------------------
interface CreateBody {
  username?: unknown
  password?: unknown
  displayName?: unknown
  role?: unknown
}

export async function POST(req: Request) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!can(currentUser, 'canManageUsers')) {
    return NextResponse.json(
      { error: 'You do not have permission to manage users' },
      { status: 403 },
    )
  }

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const role: Role = isValidRole(body.role) ? body.role : 'viewer'

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return NextResponse.json(
      {
        error:
          'Username must be 3-32 chars and only contain letters, numbers, . _ or -',
      },
      { status: 400 },
    )
  }
  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters' },
      { status: 400 },
    )
  }
  if (password.length > 200) {
    return NextResponse.json(
      { error: 'Password too long (max 200 chars)' },
      { status: 400 },
    )
  }
  if (!displayName) {
    return NextResponse.json(
      { error: 'Display name is required' },
      { status: 400 },
    )
  }
  if (displayName.length > 80) {
    return NextResponse.json(
      { error: 'Display name too long (max 80 chars)' },
      { status: 400 },
    )
  }

  // Unique username check
  const existing = await db.user.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json(
      { error: `Username "${username}" is already taken` },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password)
  const created = await db.user.create({
    data: {
      username,
      passwordHash,
      displayName,
      role,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  await db.log.create({
    data: {
      category: 'security',
      level: 'info',
      message: `User "${username}" created with role "${role}"`,
      meta: JSON.stringify({
        newUserId: created.id,
        username,
        role,
        createdBy: currentUser.username,
      }),
    },
  })

  return NextResponse.json({ ok: true, user: toRow(created) })
}

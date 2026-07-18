// ============================================================
// Users [id] API — update / delete a single user (admin only)
//
// PATCH   /api/users/[id]   body: { displayName?, role?, password? }
//   Updates editable fields. Optional `password` (≥ 6 chars) replaces
//   the existing hash. Cannot change your own role (prevent self-
//   lockout) and cannot demote the last admin to a non-admin role.
//
// DELETE  /api/users/[id]
//   Removes a user. Cannot delete yourself. Cannot delete the last
//   admin (would leave the system unmanageable). Writes a security
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

interface PatchBody {
  displayName?: unknown
  role?: unknown
  password?: unknown
}

// ------------------------------------------------------------
// PATCH — update user fields
// ------------------------------------------------------------
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const data: {
    displayName?: string
    role?: string
    passwordHash?: string
  } = {}

  // displayName
  if (typeof body.displayName === 'string') {
    const displayName = body.displayName.trim()
    if (!displayName) {
      return NextResponse.json(
        { error: 'Display name cannot be empty' },
        { status: 400 },
      )
    }
    if (displayName.length > 80) {
      return NextResponse.json(
        { error: 'Display name too long (max 80 chars)' },
        { status: 400 },
      )
    }
    data.displayName = displayName
  }

  // role (with self-lockout + last-admin guards)
  if (body.role !== undefined) {
    if (!isValidRole(body.role)) {
      return NextResponse.json(
        { error: 'Role must be one of: admin, operator, viewer' },
        { status: 400 },
      )
    }
    const newRole: Role = body.role

    // Prevent changing your own role — would let an admin lock themselves
    // out of the only screen that can grant it back.
    if (target.id === currentUser.id && newRole !== 'admin') {
      return NextResponse.json(
        { error: 'You cannot change your own role' },
        { status: 400 },
      )
    }

    // Prevent demoting the last admin to a non-admin role.
    if (target.role === 'admin' && newRole !== 'admin') {
      const adminCount = await db.user.count({ where: { role: 'admin' } })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last remaining admin' },
          { status: 400 },
        )
      }
    }

    data.role = newRole
  }

  // password (optional reset)
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }
    if (body.password.length > 200) {
      return NextResponse.json(
        { error: 'Password too long (max 200 chars)' },
        { status: 400 },
      )
    }
    data.passwordHash = await hashPassword(body.password)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update (displayName, role, password)' },
      { status: 400 },
    )
  }

  const updated = await db.user.update({
    where: { id },
    data,
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
      message: `User "${updated.username}" updated`,
      meta: JSON.stringify({
        userId: updated.id,
        fields: Object.keys(data),
        updatedBy: currentUser.username,
      }),
    },
  })

  return NextResponse.json({ ok: true, user: toRow(updated) })
}

// ------------------------------------------------------------
// DELETE — remove a user
// ------------------------------------------------------------
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params

  const target = await db.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Cannot delete yourself
  if (target.id === currentUser.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account' },
      { status: 400 },
    )
  }

  // Cannot delete the last admin
  if (target.role === 'admin') {
    const adminCount = await db.user.count({ where: { role: 'admin' } })
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last remaining admin' },
        { status: 400 },
      )
    }
  }

  await db.user.delete({ where: { id } })

  await db.log.create({
    data: {
      category: 'security',
      level: 'warn',
      message: `User "${target.username}" deleted`,
      meta: JSON.stringify({
        userId: target.id,
        username: target.username,
        role: target.role,
        deletedBy: currentUser.username,
      }),
    },
  })

  return NextResponse.json({ ok: true })
}

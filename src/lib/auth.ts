// ============================================================
// Auth library - simple session-based auth (httpOnly cookie)
// Uses a default admin seeded on first run.
// ============================================================
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'war_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

// Lightweight password hashing (NOT bcrypt - keeps Termux/SQlite deps minimal)
// For production with real credentials, swap for argon2/bcrypt.
async function hashPassword(plain: string): Promise<string> {
  const enc = new TextEncoder()
  const data = enc.encode('war_salt_v1::' + plain)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return 'sha256$' + Buffer.from(new Uint8Array(buf)).toString('hex')
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(plain)
  return computed === hash
}

export async function ensureDefaultUser() {
  const existing = await db.user.count()
  if (existing > 0) return
  const passwordHash = await hashPassword('admin123')
  await db.user.create({
    data: {
      username: 'admin',
      passwordHash,
      displayName: 'QorvixNode Admin',
      role: 'admin',
    },
  })
}

export async function login(username: string, password: string, remember: boolean) {
  const user = await db.user.findUnique({ where: { username } })
  if (!user) return { ok: false, error: 'Invalid username or password' } as const
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return { ok: false, error: 'Invalid username or password' } as const

  const token = crypto.randomUUID() + '.' + crypto.randomUUID()
  const expiresAt = new Date(Date.now() + (remember ? SESSION_TTL_MS : SESSION_TTL_MS / 7))
  await db.user.update({
    where: { id: user.id },
    data: { rememberToken: token, lastLoginAt: new Date() },
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  } as const
}

export async function logout() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.user.updateMany({
      where: { rememberToken: token },
      data: { rememberToken: null },
    })
  }
  store.delete(SESSION_COOKIE)
}

export async function getCurrentUser() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const user = await db.user.findFirst({ where: { rememberToken: token } })
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }
}

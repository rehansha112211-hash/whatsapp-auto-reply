import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeed } from '@/lib/seed'
import { login } from '@/lib/auth'

export async function POST(req: Request) {
  await ensureSeed()
  let body: { username?: string; password?: string; remember?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const username = (body.username || '').trim()
  const password = body.password || ''
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
  }
  const result = await login(username, password, !!body.remember)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 })
  }
  return NextResponse.json({ user: result.user })
}

// Helpful when the browser refreshes the login page: ensure seed exists
export async function GET() {
  await ensureSeed()
  const userCount = await db.user.count()
  return NextResponse.json({ ready: true, seeded: userCount > 0 })
}

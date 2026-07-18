import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { ensureSeed } from '@/lib/seed'

export async function GET() {
  await ensureSeed()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user })
}

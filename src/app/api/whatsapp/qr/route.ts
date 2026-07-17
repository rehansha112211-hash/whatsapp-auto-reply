import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { requestWhatsAppQR } from '@/lib/wa-engine'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const qr = await requestWhatsAppQR()
  return NextResponse.json({ ok: true, qr })
}

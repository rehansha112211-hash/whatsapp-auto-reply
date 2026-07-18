import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getWhatsAppSession } from '@/lib/wa-engine'
import type { WhatsAppState } from '@/lib/types'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const session = await getWhatsAppSession()

  return NextResponse.json({
    state: (session.state as WhatsAppState) ?? 'disconnected',
    connectedNumber: session.connectedNumber ?? '',
    connectedName: session.connectedName ?? '',
    connectedAt: session.connectedAt?.toISOString() ?? null,
    deviceInfo: session.deviceInfo ?? '',
    qrCode: session.qrCode ?? '',
    lastSeen: session.lastSeen?.toISOString() ?? null,
  })
}

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { confirmWhatsAppLogin } from '@/lib/wa-engine'

// ============================================================
// Phone number pairing — Step 2: verify the pairing code and
// complete the connection.
// ============================================================
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { phone?: string; code?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const phone = (body.phone || '').trim()
  const code = (body.code || '').trim()
  const name = (body.name || '').trim()

  if (!phone || !code) {
    return NextResponse.json({ error: 'Phone number and code are required' }, { status: 400 })
  }

  // Read the stored pairing code from the Setting table
  const pairSetting = await db.setting.findUnique({ where: { key: 'wa_phone_pair' } })
  if (!pairSetting) {
    return NextResponse.json({ error: 'No active pairing request. Please request a new code.' }, { status: 400 })
  }

  let stored: { phone: string; code: string; createdAt: string }
  try {
    stored = JSON.parse(pairSetting.value)
  } catch {
    return NextResponse.json({ error: 'Invalid pairing data. Please request a new code.' }, { status: 400 })
  }

  // Check the code hasn't expired (10-minute window)
  const ageMin = (Date.now() - new Date(stored.createdAt).getTime()) / 60000
  if (ageMin > 10) {
    return NextResponse.json({ error: 'Pairing code expired. Please request a new code.' }, { status: 400 })
  }

  if (stored.phone !== phone || stored.code !== code) {
    return NextResponse.json({ error: 'Invalid pairing code. Please check and try again.' }, { status: 400 })
  }

  // Code matches — complete the connection
  const deviceName = name || `WhatsApp · ${phone}`
  await confirmWhatsAppLogin(phone, deviceName)

  // Clean up the pairing setting
  await db.setting.delete({ where: { key: 'wa_phone_pair' } })

  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `WhatsApp connected via phone number pairing: ${phone}`,
    },
  })

  return NextResponse.json({ ok: true, number: phone, name: deviceName })
}

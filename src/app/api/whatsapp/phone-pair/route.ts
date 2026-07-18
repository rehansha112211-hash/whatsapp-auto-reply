import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// Phone number pairing — Step 1: request a pairing code.
// Stores the code in the Setting table (NOT on the session)
// so the DisconnectedCard stays visible with the verify form.
// ============================================================
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const phone = (body.phone || '').trim()
  if (!phone || phone.length < 7) {
    return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 })
  }

  // Generate a 6-digit pairing code
  const code = String(Math.floor(100000 + Math.random() * 900000))

  // Store the pairing code + phone in the Setting table so the
  // verify step can check it. We do NOT change the session state —
  // the DisconnectedCard stays visible with the phone form.
  await db.setting.upsert({
    where: { key: 'wa_phone_pair' },
    update: { value: JSON.stringify({ phone, code, createdAt: new Date().toISOString() }) },
    create: { key: 'wa_phone_pair', value: JSON.stringify({ phone, code, createdAt: new Date().toISOString() }) },
  })

  await db.log.create({
    data: {
      category: 'whatsapp',
      level: 'info',
      message: `Phone pairing code requested for ${phone}`,
      meta: JSON.stringify({ phone }),
    },
  })

  // In production, this code would be sent via SMS. In this simulation
  // we return it so the UI can display it for the user to "enter".
  return NextResponse.json({ ok: true, code, phone })
}

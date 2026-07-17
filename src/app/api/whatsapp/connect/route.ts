import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { confirmWhatsAppLogin } from '@/lib/wa-engine'

// Realistic Indian mobile device names paired with browser (for simulator)
const DEVICE_POOL = [
  'Moto G45 5G',
  'Samsung Galaxy S24',
  'OnePlus 12R',
  'Xiaomi 14',
  'Realme GT 6',
  'Vivo X100',
  'Oppo Reno 12 Pro',
  'Nothing Phone (2a)',
  'iQOO Neo 9 Pro',
  'Pixel 8a',
]
const BROWSER_POOL = ['Chrome', 'Brave', 'Edge', 'Firefox', 'Opera Mini']

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generatePhoneNumber(): string {
  // +91 9 + 9 random digits, grouped like +91 98765 43210
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  // first of the 5-digit group can be anything 0-9, second group first digit too
  const part1 = `${9}${digits[0]}${digits[1]}${digits[2]}${digits[3]}${digits[4]}`
  const part2 = `${digits[5]}${digits[6]}${digits[7]}${digits[8]}${Math.floor(Math.random() * 10)}`
  return `+91 ${part1} ${part2}`
}

function generateDeviceName(): string {
  return `${randomItem(DEVICE_POOL)} · ${randomItem(BROWSER_POOL)}`
}

interface ConnectBody {
  number?: string
  name?: string
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ConnectBody = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text) as ConnectBody
  } catch {
    /* empty body is fine */
  }

  const number = body.number && body.number.trim() ? body.number.trim() : generatePhoneNumber()
  const name = body.name && body.name.trim() ? body.name.trim() : generateDeviceName()

  await confirmWhatsAppLogin(number, name)
  return NextResponse.json({ ok: true, number, name })
}

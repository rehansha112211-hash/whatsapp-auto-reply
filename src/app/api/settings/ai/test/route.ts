import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { testAIConnection } from '@/lib/ai-engine'
import { db } from '@/lib/db'

// ============================================================
// Test AI connection — calls the real OpenRouter API and
// returns the result. Updates the ApiSetting status.
// ============================================================
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await testAIConnection()

  // Update the API setting status
  try {
    await db.apiSetting.update({
      where: { id: 'api' },
      data: {
        status: result.ok ? 'ok' : 'error',
        lastTestedAt: new Date(),
      },
    })
  } catch {
    /* ignore */
  }

  // Log the test
  try {
    await db.log.create({
      data: {
        category: 'ai',
        level: result.ok ? 'info' : 'error',
        message: result.ok
          ? `AI connection test OK (${result.latencyMs}ms, ${result.model})`
          : `AI connection test failed: ${result.error}`,
      },
    })
  } catch {
    /* ignore */
  }

  return NextResponse.json(result)
}

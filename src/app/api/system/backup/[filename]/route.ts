import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// Delete API — DELETE /api/system/backup/{filename}
// Removes the named backup (.db + companion .json if present).
// ============================================================

const DB_URL = process.env.DATABASE_URL ?? 'file:/home/z/my-project/db/custom.db'
const DB_PATH = DB_URL.replace(/^file:/, '')
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups')

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/

interface DeleteResponse {
  ok: true
  filename: string
}

function isValidFilename(name: string): boolean {
  if (!name || name.length > 255) return false
  if (!SAFE_FILENAME.test(name)) return false
  if (name.includes('..')) return false
  if (name.includes('/') || name.includes('\\')) return false
  return true
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename } = await ctx.params
  if (!isValidFilename(filename)) {
    return NextResponse.json(
      { error: 'Invalid filename' },
      { status: 400 },
    )
  }

  const backupPath = path.join(BACKUP_DIR, filename)

  // Verify path stays inside BACKUP_DIR (no traversal).
  try {
    const realBackup = await fs.realpath(backupPath)
    const realDir = await fs.realpath(BACKUP_DIR)
    if (!realBackup.startsWith(realDir + path.sep)) {
      return NextResponse.json(
        { error: 'Invalid backup path' },
        { status: 400 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Backup file not found' },
      { status: 404 },
    )
  }

  try {
    // Delete the .db backup
    await fs.unlink(backupPath)

    // Best-effort: also remove the companion .json export if it exists.
    if (filename.endsWith('.db')) {
      const jsonCompanion = backupPath.slice(0, -3) + '.json'
      try {
        await fs.unlink(jsonCompanion)
      } catch {
        /* companion may not exist; ignore */
      }
    }

    // Log the delete event
    try {
      await db.log.create({
        data: {
          category: 'database',
          level: 'warn',
          message: `Backup deleted: ${filename}`,
          meta: JSON.stringify({ deletedBy: user.username }),
        },
      })
    } catch {
      /* logging is best-effort */
    }

    const res: DeleteResponse = { ok: true, filename }
    return NextResponse.json(res, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Delete failed: ${message}` },
      { status: 500 },
    )
  }
}

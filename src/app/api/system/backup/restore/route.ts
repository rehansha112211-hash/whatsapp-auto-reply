import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// Restore API — POST /api/system/backup/restore
// Body: { filename: string }
// Copies the named backup file back over the live SQLite DB.
// ============================================================

const DB_URL = process.env.DATABASE_URL ?? 'file:/home/z/my-project/db/custom.db'
const DB_PATH = DB_URL.replace(/^file:/, '')
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups')

// Only allow alphanumeric, dash, underscore, dot — blocks path traversal.
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/

interface RestoreBody {
  filename: string
}

interface RestoreResponse {
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

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: RestoreBody
  try {
    body = (await request.json()) as RestoreBody
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const filename = body?.filename
  if (!isValidFilename(filename ?? '')) {
    return NextResponse.json(
      { error: 'Invalid filename' },
      { status: 400 },
    )
  }

  const backupPath = path.join(BACKUP_DIR, filename as string)

  // Verify the backup file exists and is inside the backup dir (no traversal).
  try {
    const realBackup = await fs.realpath(backupPath)
    const realDir = await fs.realpath(BACKUP_DIR)
    if (!realBackup.startsWith(realDir + path.sep)) {
      return NextResponse.json(
        { error: 'Invalid backup path' },
        { status: 400 },
      )
    }
    const stat = await fs.stat(realBackup)
    if (!stat.isFile()) {
      return NextResponse.json(
        { error: 'Backup file not found' },
        { status: 404 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Backup file not found' },
      { status: 404 },
    )
  }

  try {
    // Checkpoint the WAL so any in-memory data is flushed before overwrite.
    // wal_checkpoint returns a result row, so use $queryRawUnsafe.
    try {
      await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      /* best-effort */
    }

    // Overwrite the live DB file with the backup contents.
    await fs.copyFile(backupPath, DB_PATH)

    // Log the restore event as a warning (data state changed).
    try {
      await db.log.create({
        data: {
          category: 'database',
          level: 'warn',
          message: `Database restored from ${filename as string}`,
          meta: JSON.stringify({
            restoredBy: user.username,
            source: filename,
          }),
        },
      })
    } catch {
      /* logging is best-effort */
    }

    const res: RestoreResponse = { ok: true, filename: filename as string }
    return NextResponse.json(res, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Restore failed: ${message}` },
      { status: 500 },
    )
  }
}

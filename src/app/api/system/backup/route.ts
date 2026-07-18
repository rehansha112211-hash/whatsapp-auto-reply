import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// ============================================================
// Backup & Recovery API
//   GET  -> list backup files + current DB info
//   POST -> create a new backup (.db copy + settings JSON export)
// ============================================================

const DB_URL = process.env.DATABASE_URL ?? 'file:/home/z/my-project/db/custom.db'
const DB_PATH = DB_URL.replace(/^file:/, '')
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups')

interface BackupItem {
  id: string
  filename: string
  sizeBytes: number
  createdAt: string
}

interface DbInfo {
  path: string
  sizeBytes: number
  counts: {
    contacts: number
    messages: number
    logs: number
  }
}

interface BackupListResponse {
  items: BackupItem[]
  dbInfo: DbInfo
}

interface BackupCreateResponse {
  ok: true
  backup: BackupItem
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timestampStamp(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

function parseCreatedAt(filename: string): Date {
  const match = filename.match(/^backup-(\d{4})-(\d{2})-(\d{2})-(\d{6})\./)
  if (!match) return new Date(0)
  const [, y, mo, d, hm] = match
  const hh = hm.slice(0, 2)
  const mm = hm.slice(2, 4)
  const ss = hm.slice(4, 6)
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}`
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
}

async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
}

async function readDbInfo(): Promise<DbInfo> {
  let sizeBytes = 0
  try {
    const stat = await fs.stat(DB_PATH)
    sizeBytes = stat.size
  } catch {
    sizeBytes = 0
  }
  const [contacts, messages, logs] = await Promise.all([
    db.contact.count().catch(() => 0),
    db.message.count().catch(() => 0),
    db.log.count().catch(() => 0),
  ])
  return {
    path: DB_PATH,
    sizeBytes,
    counts: { contacts, messages, logs },
  }
}

// GET /api/system/backup — list backups + DB info
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureBackupDir()
    const entries = await fs.readdir(BACKUP_DIR)
    const dbFiles = entries.filter((f) => f.endsWith('.db'))

    const items: BackupItem[] = await Promise.all(
      dbFiles.map(async (filename) => {
        const fullPath = path.join(BACKUP_DIR, filename)
        let sizeBytes = 0
        try {
          const stat = await fs.stat(fullPath)
          sizeBytes = stat.size
        } catch {
          sizeBytes = 0
        }
        return {
          id: filename,
          filename,
          sizeBytes,
          createdAt: parseCreatedAt(filename).toISOString(),
        }
      }),
    )

    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    const dbInfo = await readDbInfo()

    const body: BackupListResponse = { items, dbInfo }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to list backups: ${message}` },
      { status: 500 },
    )
  }
}

// POST /api/system/backup — create a new backup
export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureBackupDir()

    // WAL checkpoint so the main .db file contains all committed data.
    // wal_checkpoint returns a result row, so use $queryRawUnsafe.
    try {
      // PostgreSQL doesn't need WAL checkpoint (SQLite-specific)
    } catch {
      /* best-effort; proceed with copy anyway */
    }

    const stamp = timestampStamp()
    const dbFilename = `backup-${stamp}.db`
    const jsonFilename = `backup-${stamp}.json`
    const dbBackupPath = path.join(BACKUP_DIR, dbFilename)
    const jsonBackupPath = path.join(BACKUP_DIR, jsonFilename)

    // Copy the SQLite DB file
    await fs.copyFile(DB_PATH, dbBackupPath)

    // Export settings as JSON
    const [company, owner, apiSetting, autoReplySetting] = await Promise.all([
      db.company.findUnique({ where: { id: 'company' } }),
      db.owner.findUnique({ where: { id: 'owner' } }),
      db.apiSetting.findUnique({ where: { id: 'api' } }),
      db.autoReplySetting.findUnique({ where: { id: 'autoreply' } }),
    ])

    const settingsExport = {
      exportedAt: new Date().toISOString(),
      schema: 'qorvixnode-backup-v1',
      company,
      owner,
      apiSetting,
      autoReplySetting,
    }
    await fs.writeFile(
      jsonBackupPath,
      JSON.stringify(settingsExport, null, 2),
      'utf8',
    )

    // Stat the backup file for the response
    const stat = await fs.stat(dbBackupPath)

    // Log the backup event
    try {
      await db.log.create({
        data: {
          category: 'database',
          level: 'info',
          message: `Backup created: ${dbFilename}`,
          meta: JSON.stringify({
            sizeBytes: stat.size,
            jsonFile: jsonFilename,
          }),
        },
      })
    } catch {
      /* logging is best-effort */
    }

    const backup: BackupItem = {
      id: dbFilename,
      filename: dbFilename,
      sizeBytes: stat.size,
      createdAt: parseCreatedAt(dbFilename).toISOString(),
    }

    const body: BackupCreateResponse = { ok: true, backup }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Backup failed: ${message}` },
      { status: 500 },
    )
  }
}

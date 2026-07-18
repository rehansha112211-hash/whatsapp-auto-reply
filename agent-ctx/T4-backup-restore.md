# T4 — Backup/Restore Agent Work Record

**Agent:** full-stack-developer (Backup/Restore)
**Task:** Implement real SQLite backup/restore on the System Health page + backup history list. Replace the simulated "Restart Engine" button with a working backup/restore UI.

## Work Log

### 1. Context Gathering
- Read `/home/z/my-project/worklog.md` — reviewed prior tasks (foundation, analytics, command palette, styling).
- Read existing `src/components/views/system-view.tsx` — found the "Engine Controls" card with simulated restart button (the task calls this the "Backup & Recovery" card).
- Read `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/api-client.ts`, `src/lib/format.ts`, `src/lib/types.ts`, `prisma/schema.prisma`, `src/app/api/system/health/route.ts`, `src/app/api/dashboard/route.ts` — understood existing patterns.
- Verified DB path: `DATABASE_URL=file:/home/z/my-project/db/custom.db` → DB at `/home/z/my-project/db/custom.db`.
- shadcn/ui `alert-dialog` and `dialog` components confirmed available.

### 2. API Routes Created

**`src/app/api/system/backup/route.ts`** (GET + POST)
- Auth via `getCurrentUser()` → 401 if not authed.
- GET: lists `.db` files in `/home/z/my-project/db/backups/`, returns `{ items: [{ id, filename, sizeBytes, createdAt }], dbInfo: { path, sizeBytes, counts } }` sorted by createdAt desc. Creates the backups dir if missing. `dbInfo` includes live DB file size + contact/message/log counts (for the Database Info mini-section).
- POST: runs `PRAGMA wal_checkpoint(TRUNCATE)` (via `$queryRawUnsafe` — `$executeRawUnsafe` fails on SQLite because the pragma returns a row), copies the DB file to `backup-{YYYY-MM-DD-HHmmss}.db`, exports Company/Owner/ApiSetting/AutoReplySetting as a companion `backup-{ts}.json`, creates a `database`/`info` Log entry, returns `{ ok: true, backup: {...} }`.
- DB path derived from `DATABASE_URL` env var (strips `file:` prefix) for robustness.

**`src/app/api/system/backup/restore/route.ts`** (POST)
- Auth check. Body `{ filename }`.
- Filename validated with `/^[a-zA-Z0-9._-]+$/` regex + `..`/`/`/`\` rejection. Also uses `fs.realpath` to verify the resolved path stays inside the backup dir (defense-in-depth against traversal).
- Runs WAL checkpoint, then `fs.copyFile(backupPath, DB_PATH)` to overwrite the live DB.
- Creates a `database`/`warn` Log entry: `Database restored from {filename}`.
- Returns `{ ok: true, filename }`.

**`src/app/api/system/backup/[filename]/route.ts`** (DELETE)
- Auth check. Dynamic `[filename]` param.
- Same filename validation + realpath containment check.
- Deletes the `.db` backup + best-effort deletes the companion `.json`.
- Creates a `database`/`warn` Log entry: `Backup deleted: {filename}`.
- Returns `{ ok: true, filename }`.
- Note: Next.js 16 async params — uses `ctx: { params: Promise<{ filename: string }> }` and `await ctx.params`.

### 3. system-view.tsx Modified

- Updated imports: removed `Power` (no longer used), added `Archive, FileBox, RotateCcw, Trash2, Download` from lucide-react; added `apiPost, apiDelete` from api-client; added `timeAgo` from format; added `Separator` + `AlertDialog*` from shadcn/ui.
- Added `BackupRecoveryCard` component (before `SystemView`):
  - State: `backups`, `dbInfo`, `loading`, `creating`, `busyFilename`, `restoreTarget`, `deleteTarget`.
  - `fetchBackups()` on mount → GET `/api/system/backup`.
  - `handleCreate` → POST `/api/system/backup`, toast on success: "Backup created" with filename + size.
  - `handleRestore` → POST `/api/system/backup/restore` with `{ filename }`, toast on success.
  - `handleDelete` → DELETE `/api/system/backup/{filename}` (URL-encoded), toast on success.
  - UI: emerald-gradient "Create Backup" button with spinner; history list (`max-h-64 overflow-y-auto`) with each row showing a Database icon, mono filename, formatted size (KB/MB), `timeAgo` date, and Restore (amber outline) + Delete (ghost red) buttons; empty state "No backups yet. Create your first backup."; Database Info grid (DB path, file size, contacts, messages/logs counts).
  - Two AlertDialogs: restore confirmation (amber gradient action button, "Restore from {filename}? This will overwrite the current database."), delete confirmation (rose action button, "Delete {filename}? This action cannot be undone.").
- Restructured the "Uptime + restart" grid: Uptime & Availability card is now full-width (removed the `lg:col-span-2` / 3-col grid wrapper since the Engine Controls card was removed); the old Engine Controls card is replaced by `<BackupRecoveryCard />` rendered below.
- `formatBytes` helper added (B/KB/MB/GB/TB with 1 decimal under 10).

### 4. Bug Fix During Testing
- Initial WAL checkpoint used `db.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')` which produced Prisma errors: "Execute returned results, which is not allowed in SQLite." — `wal_checkpoint` returns a result row. Switched to `db.$queryRawUnsafe(...)` in both the backup POST and restore POST routes. Errors disappeared.

### 5. Quality Gates
- `bun run lint` → **0 errors, 0 warnings** (clean).
- `bunx tsc --noEmit` → no errors in any of the 4 touched files (remaining repo errors are pre-existing in `examples/`, `skills/`, `src/lib/ai-engine.ts` — all outside this task's scope).
- TypeScript strict throughout; no `any`; no `console.log`; no `TODO`.

### 6. End-to-End Test Results (curl against live dev server)
- `POST /api/auth/login` {admin/admin123} → 200, session cookie captured.
- `GET /api/system/backup` (authed) → 200, `{items:[], dbInfo:{path, sizeBytes:253952, counts:{contacts:7, messages:33, logs:39}}}`.
- `GET /api/system/backup` (unauthed) → 401.
- `POST /api/system/backup` → 200, creates `backup-2026-07-18-025020.db` (253952 bytes) + companion `.json` (2774 bytes with company/owner/api/autoreply settings).
- `POST /api/system/backup` (2nd) → 200, creates `backup-2026-07-18-025026.db`.
- `GET /api/system/backup` → 200, 2 items sorted desc by createdAt.
- `POST /api/system/backup/restore` with `../../../etc/passwd` → 400 "Invalid filename" (traversal blocked).
- `DELETE /api/system/backup/..%2F..%2F..%2Fetc%2Fpasswd` → 400 "Invalid filename".
- `POST /api/system/backup/restore` with nonexistent → 404 "Backup file not found".
- `POST /api/system/backup/restore` (unauthed) → 401.
- `POST /api/system/backup/restore` with valid `backup-2026-07-18-025020.db` → 200. DB logs went 41 → 40 (restored older state of 39 logs + 1 restore log entry) — confirms the overwrite worked.
- `DELETE /api/system/backup/backup-2026-07-18-025026.db` → 200, removed both `.db` and companion `.json`.
- Dev server log: all routes compile and return 200/400/401/404 as expected; no Prisma errors after the `$queryRawUnsafe` fix.
- Test backups cleaned up — final state: empty backups dir, ready for user.

## Stage Summary

### Files Created
- `src/app/api/system/backup/route.ts` — GET (list backups + dbInfo) + POST (create backup with WAL checkpoint, DB copy, JSON settings export, Log entry).
- `src/app/api/system/backup/restore/route.ts` — POST (validate filename, WAL checkpoint, overwrite DB, Log entry).
- `src/app/api/system/backup/[filename]/route.ts` — DELETE (validate filename, delete .db + companion .json, Log entry).

### Files Modified
- `src/components/views/system-view.tsx` — updated imports; added `BackupRecoveryCard` component (Create Backup button + history list + Database Info + restore/delete confirmation dialogs); replaced the Engine Controls card with the new Backup & Recovery card; restructured the Uptime row to full-width.

### Key Design Decisions
- DB path derived from `DATABASE_URL` env var (not hardcoded) for portability.
- WAL checkpoint before every copy/overwrite so the `.db` file contains all committed data.
- Companion JSON export of all 4 settings tables alongside each `.db` backup (schema-tagged `qorvixnode-backup-v1`).
- Defense-in-depth filename validation: regex allowlist + `..`/slash rejection + `fs.realpath` containment check.
- `dbInfo` (path, sizeBytes, counts) returned from GET `/api/system/backup` so the frontend Database Info mini-section has everything in one fetch — no extra endpoint needed.
- Delete also removes the companion `.json` (best-effort) so the backups dir stays tidy.
- Restore uses `fs.copyFile` (overwrite) per the task spec; Prisma client reconnects on next request cycle. Toast informs the user to reload.

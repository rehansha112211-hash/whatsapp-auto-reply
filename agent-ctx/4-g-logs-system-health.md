# Task 4-g — Logs + System Health views & APIs

## What was built
4 files for the Logs viewer and System Health pages:

1. **`src/app/api/logs/route.ts`** (GET)
   - Auth-gated via `getCurrentUser()`
   - Query params: `category` (LogCategory | 'all'), `level` (LogLevel | 'all'), `search`, `limit` (default 200, max 1000), `before` (ISO cursor)
   - Returns `{ items: LogRow[], hasMore: boolean }` ordered createdAt desc (fetches limit+1 to detect hasMore)
   - `?export=csv` → CSV with Content-Disposition (uses `toCsv`)
   - `?export=json` → JSON with Content-Disposition

2. **`src/app/api/system/health/route.ts`** (GET)
   - Returns `SystemHealth`: `{ backend, frontend, whatsapp, database, aiProvider, session, cpu, ram, disk, uptimeSec }`
   - backend/frontend = 'ok'; whatsapp from session state; database via `SELECT 1`; aiProvider from ApiSetting.status; session from getCurrentUser (ok/none)
   - CPU = `clamp(20 + 15*sin(now/30000), 5, 60)`; RAM via `process.memoryUsage().rss / rssLimit` (fallback to ~512MB headroom); disk = 40
   - uptimeSec from SYSTEM_START
   - Best-effort `db.metric.createMany` for cpu/ram/disk time-series

3. **`src/components/views/logs-view.tsx`** — `LogsView`
   - Tabs across top for each LogCategory + 'All'
   - Toolbar: level Select, debounced search (300ms), auto-refresh Switch (default on, 5s poll), manual refresh, Export CSV/JSON, Clear filters
   - Stats strip: visible count, errors 24h, warnings 24h
   - Scrollable log list (`max-h-[calc(100vh-320px)] scrollbar-thin`) with colored level dot, level badge, monospace timestamp, category badge (per-category colors), monospace message, collapsible `<details>` meta, "→ contact" link
   - New logs appear at top with `fadeHighlight` animation (bg-primary/5 fading)
   - Uses `seenIdsRef` for diff to avoid stale-closure render loops
   - Empty state with Inbox icon

4. **`src/components/views/system-view.tsx`** — `SystemView`
   - Polls `/api/system/health` every 5s
   - Big "System Status" banner with pulsing green/red dot (operational/degraded) + uptime
   - Responsive status grid (2/3/4 cols) with left-border accent: Backend, Frontend, WhatsApp (WhatsAppStatusBadge), Database, AI Provider (with model name), Session
   - Resource cards: CPU/RAM/Disk with animated Progress bars colored green/amber/rose by load band
   - Uptime card with started-at timestamp
   - Engine Controls: "Restart Engine (simulated)" button → toast
   - Recent Errors (red-accented) + Recent System Events cards (fetches `/api/logs?category=errors&limit=5` and `?category=startup&limit=10`)

## Quality gates
- `bun run lint`: 0 errors in created files (only pre-existing warning in `src/hooks/use-realtime.ts`)
- `bunx tsc --noEmit`: 0 errors in created files (remaining errors are in other agents' files — leads, ai-engine, examples, skills)

## Conventions
- WhatsApp-green theme, glass cards `rounded-xl border bg-card/60 backdrop-blur p-4`
- All icons from lucide-react
- No console.log, no TODO, no `any`
- 'use client' on view components
- Did NOT modify any files outside the 4 listed

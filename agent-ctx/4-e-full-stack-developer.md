# Task 4-e — full-stack-developer (Leads view + API)

## Task
Build the Leads pipeline page (search / filter / sort / export CSV + JSON table with summary cards and 15s polling) plus its two API routes (`/api/leads` and `/api/leads/export`), all gated by `getCurrentUser()`. Part of the WhatsApp AI Auto Reply Platform by QorvixNode Technologies.

## Files Created (only these 3)
- `src/app/api/leads/route.ts` — GET, auth-gated. `?summary=1` returns `{ total, hot, warm, cold }`. Otherwise returns `{ items: LeadRow[] }` filtered by `search`, `category`, `minScore`, `sort`, `status`. Default sort `score_desc`.
- `src/app/api/leads/export/route.ts` — GET, auth-gated, same filters, returns CSV with `Content-Type: text/csv` + `Content-Disposition: attachment; filename="leads.csv"`. Uses isomorphic `toCsv` from `@/lib/format`.
- `src/components/views/leads-view.tsx` — `'use client'`, named `LeadsView`, signature `({ onNavigate }: { onNavigate?: (v: ViewKey) => void })`. 4 summary cards, filter toolbar (search + category/status/sort selects + min-score slider), responsive table with avatar/service/score/status/last-message/actions columns, empty state, CSV + JSON export dropdown, 15s polling, hot-lead pulse on rows with score ≥ 90.

## Key Implementation Notes
- **LeadScore has no Prisma relation back to Contact** (only `messages`, `memories`, `notifications`, `logs` are exposed on Contact). So fetching latest LeadScore per contact requires a separate `db.leadScore.findMany({ where: { contactId: { in: [...] } }, orderBy: [{contactId asc}, {createdAt desc}] })` query, then dedupe in JS to build a `Map<contactId, {category, notified}>`.
- **All filter params validated** against typed const arrays + a type guard (`isSortKey`). No `any` anywhere.
- **Search post-filter** (name / phone / lastMessage, case-insensitive) — Prisma where clause only handles `leadScore >= minScore` and optional `status`. Category is also post-filtered (latest LeadScore category).
- **Polling preserves filters** — they live in React state, not URL, so the 15s `setInterval` re-fetch uses the current params via a `useCallback` dependency.
- **Export CSV** fetches `/api/leads/export?...` as text and uses `downloadFile` from `@/lib/format`. **Export JSON** serializes current `items` directly (no extra round-trip).
- **Hot-lead pulse** on rows with `score >= 90`: rose-tinted row background + a `Flame`-style pulsing rose dot (`animate-ping`) next to the LeadBadge.
- **WhatsApp-green theme** throughout — emerald/teal/amber/zinc accents only (no indigo, no blue). Cards use `rounded-xl border bg-card/60 backdrop-blur p-4` per spec.

## Quality Gates
- `bun run lint` on the 3 files → **0 errors, 0 warnings**.
- `bunx tsc --noEmit` on the 3 files → **0 type errors**.
- End-to-end smoke test with seeded admin/admin123 session:
  - `GET /api/leads` → 200, returns 5 demo LeadRows with all 10 required fields.
  - `GET /api/leads?summary=1` → `{ total: 4, hot: 3, warm: 0, cold: 2 }`.
  - `GET /api/leads/export` → 200 with correct CSV header + escaped per-row values.

## Dependencies on Other Agents' Work
- Reuses `db`, `getCurrentUser`, `LeadRow`/`LeadCategory`/`LEAD_CATEGORIES`/`ViewKey` types, `apiGet`, `timeAgo`/`downloadFile`/`toCsv`/`colorFromString`/`initials`/`leadBadge`, `LeadBadge` component, and shadcn/ui primitives (button, input, badge, table, select, dropdown-menu, slider, progress, separator) — all pre-existing.
- The LeadsView's "View chat" button calls `onNavigate?.('chats')` — depends on the chats view being implemented by another agent (Task 4-d).
- The notification dot on customer avatars reflects `LeadScore.notified` from the seed data; the notifications API is owned by another agent but isn't called by this view.

## Routes
- `GET /api/leads`
- `GET /api/leads?summary=1`
- `GET /api/leads/export`
- Mount point for the view: `LeadsView` is exported from `src/components/views/leads-view.tsx` and expects to be rendered by the app shell under the `'leads'` ViewKey (already wired in `src/lib/nav.ts`).

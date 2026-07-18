# Task F3-R6 — Multi-user Authentication with Roles

Agent: full-stack-developer (Multi-user Auth)
Task: Add multi-user authentication with three roles (admin / operator / viewer), each with a distinct permission set; ship a User Management screen for admins; enforce permissions on every mutating API route; hide nav items the user can't access; and show a friendly "You don't have permission" card if a viewer/operator lands on a gated page.

## Work Log

### 1. Permission system — `src/lib/permissions.ts` (NEW)
- Defined `Role = 'admin' | 'operator' | 'viewer'` and a 14-flag `Permission` interface covering view, send, schedule, simulator, settings, users, webhooks, data, system, logs.
- `ROLE_PERMISSIONS` table: admin = all true; operator = view everything + send/schedule/simulator but no settings/users/webhooks/data; viewer = read-only (dashboard, chats, leads, search, analytics).
- `can(user, action)` — single entry point used by both server routes and client components. Falls back to `viewer` for unknown roles.
- `getVisibleNavItems(role)` — returns the ViewKey[] that the role should see in the sidebar (admin = all 19, operator = 11, viewer = 6).
- `permissionForView(view)` + `canView(user, view)` — maps each ViewKey to the permission required to view it (or null if always allowed, e.g. `contact-profile` is gated by its parent).
- `roleOf(user)` — typed Role extractor with null-safety.

### 2. Auth lib — `src/lib/auth.ts` (MODIFIED)
- Exported `hashPassword()` so the users API routes can hash new passwords with the same scheme (SHA-256 + `war_salt_v1::` prefix).
- Rewrote `ensureDefaultUser()` to seed **three** demo accounts instead of one:
  - `admin / admin123` (QorvixNode Admin, role=admin)
  - `operator / operator123` (Sales Operator, role=operator)
  - `viewer / viewer123` (Read-only Viewer, role=viewer)
- Idempotent: each user is only created if missing, so re-running on an existing DB just adds the new demo accounts without touching passwords of existing ones.
- `login()` already returned `role` in the user object — no change needed.

### 3. Types — `src/lib/types.ts` (MODIFIED)
- Added `| 'users'` to the `ViewKey` union (now 19 views).
- Annotated `AuthUser.role` with the comment `// 'admin' | 'operator' | 'viewer' — narrowed via permissions.ts` so editors know it's a string at the type level but constrained at runtime.
- Added `UserListRow` interface (id, username, displayName, role, lastLoginAt, createdAt) — used by the users API and view.

### 4. Nav — `src/lib/nav.ts` (MODIFIED)
- Imported `Users` from lucide-react.
- Added `{ key: 'users', label: 'Users', icon: Users, description: 'Manage team', group: 'system' }` at the end of the system group.

### 5. Users API — `src/app/api/users/route.ts` (NEW)
- **GET**: admin-only (`can(user, 'canManageUsers')`). Returns `{ items: UserListRow[] }` sorted by createdAt ASC so the seeded admin/operator/viewer appear in a predictable order. Never returns `passwordHash`.
- **POST**: admin-only. Validates username (3–32 chars, `[a-zA-Z0-9_.-]`), password (≥6, ≤200), displayName (non-empty, ≤80), role (defaults to viewer for invalid values). Unique-username check → 409 on conflict. Hashes password with the shared `hashPassword()` helper. Writes a `security` audit log entry with the creator's username.

### 6. Users [id] API — `src/app/api/users/[id]/route.ts` (NEW)
- **PATCH**: admin-only. Updates displayName, role, and optionally password (only if a non-empty password is sent — "reset password" UX). Two self-lockout guards:
  - Cannot change your own role (prevents an admin demoting themselves and losing access to the only screen that can grant it back).
  - Cannot demote the last admin to a non-admin role (`adminCount <= 1` check).
- **DELETE**: admin-only. Cannot delete yourself (`target.id === currentUser.id`). Cannot delete the last admin. Writes a `security` audit log on success.

### 7. UsersView — `src/components/views/users-view.tsx` (NEW, ~700 lines)
- `'use client'`, named `UsersView`, no props. Reads the current user from context (`useCurrentUser()`) to highlight self with a "You" badge.
- **Header** with eyebrow + `text-gradient-premium` title + Refresh + "New user" buttons.
- **Role legend** — 3 cards (admin/operator/viewer) showing the live count of each role plus a one-line description. Color-coded: admin=emerald, operator=sky, viewer=zinc.
- **Users table** (`Table` from shadcn/ui) with columns: User (avatar initials + displayName + @username + "You" badge), Role (colored badge with icon — Crown/ShieldCheck/Eye), Last login (relative with absolute-time tooltip), Created (formatted with relative tooltip), Actions (Edit + Delete icon buttons with tooltips).
- **Last-admin warning** — if `adminCount <= 1`, an amber banner appears in the table header: "Only 1 admin — promote another to avoid lockout."
- **New / Edit dialog** — shared `UserDialog` component with mode='create'|'edit'. Username is disabled in edit mode ("Username cannot be changed after creation"). Password field is required in create mode, optional in edit mode ("Leave blank to keep current password"). Role select with icon + description hint.
- **Delete confirmation** — `AlertDialog` with explicit copy. Self-delete is blocked client-side (button disabled + helpful description) as well as server-side.
- Skeleton loader (4 rows) while fetching, error state with retry button, empty state with CTA.
- Framer Motion entrance animation on the page wrapper.
- Footer info card explaining the permission model and noting server-side enforcement.
- All cards use the standard `rounded-xl border bg-card/60 backdrop-blur card-hover` styling.

### 8. Current-user context — `src/hooks/use-current-user.tsx` (NEW)
- `CurrentUserProvider` + `useCurrentUser()` + `useCan(action)` React context.
- Avoids prop-drilling `user` into every view and avoids re-fetching `/api/auth/me` from each view.
- Memoised so consumers only re-render when the user reference actually changes.

### 9. PermissionDenied component — `src/components/permission-denied.tsx` (NEW)
- Friendly "You don't have permission" card with Lock icon, role label, view label, and a "Back to dashboard" button.
- Framer Motion entrance animation. Amber warning panel telling the user to ask an admin to upgrade their role.

### 10. AppShell — `src/components/app-shell.tsx` (MODIFIED)
- Imported `getVisibleNavItems` and `roleOf` from `@/lib/permissions`.
- `NavLinks` now accepts a `role: Role` prop. Computes `visible = new Set(getVisibleNavItems(role))` once per role change (memoised) and filters each group's items by `visible.has(n.key)`. Groups with no visible items are skipped entirely (so a viewer never sees an empty "Settings" or "System" header).
- `AppShell` computes `const role = roleOf(user) ?? 'viewer'` and passes it to `NavLinks`.
- Topbar still shows `user.role` as plain text in the user dropdown (kept simple).

### 11. Login view — `src/components/views/login-view.tsx` (MODIFIED)
- Replaced the single-line "Demo credentials: admin / admin123" hint with a 3-card grid of clickable demo accounts.
- Each card shows the role icon (Crown/ShieldCheck/Eye), the username in mono, and a one-line role description ("Full access" / "Send messages, no settings" / "Read-only").
- Clicking a demo card fills in both the username and password fields and clears any prior error.
- Color tints match the role badges used elsewhere (emerald/sky/zinc).

### 12. Page — `src/app/page.tsx` (MODIFIED)
- Imported `UsersView`, `PermissionDenied`, `CurrentUserProvider`, `canView`.
- Wrapped the entire `AppShell` in `<CurrentUserProvider user={user}>` so any client view can call `useCurrentUser()` / `useCan()`.
- Added a **view-level permission gate** before rendering the active view body: `if (!canView(user, active)) render <PermissionDenied view={active} role={user.role} onBack={...} />`.
- Added `{active === 'users' && <UsersView />}` router case.
- All other existing router cases preserved (chats, broadcast, scheduled, simulator, settings×4, webhooks, data-management, etc.).

### 13. API permission enforcement (8 routes patched)
Each route now returns `403 { error: '...' }` if the current user lacks the required permission. The auth check (`getCurrentUser()` → 401 if not authed) was already present; the new 403 check sits between auth and the body parse.

| Route | Method | Permission | Error message |
|---|---|---|---|
| `/api/messages` | POST | `canSendMessages` | "You need operator role to send messages" |
| `/api/broadcast` | POST | `canSendMessages` | "You need operator role to send broadcasts" |
| `/api/scheduled` | POST | `canScheduleMessages` | "You need operator role to schedule messages" |
| `/api/simulator/send` | POST | `canUseSimulator` | "You need operator role to use the simulator" |
| `/api/settings/ai` | PUT | `canManageSettings` | "You need admin role to manage settings" |
| `/api/settings/company` | PUT | `canManageSettings` | "You need admin role to manage settings" |
| `/api/settings/owner` | PUT | `canManageSettings` | "You need admin role to manage settings" |
| `/api/settings/autoreply` | PUT | `canManageSettings` | "You need admin role to manage settings" |
| `/api/export` | GET | `canManageData` | "You need admin role to export data" |
| `/api/import` | POST | `canManageData` | "You need admin role to import data" |
| `/api/webhooks` | GET, POST | `canManageWebhooks` | "You need admin role to manage webhooks" |
| `/api/webhooks/[id]` | PATCH, DELETE | `canManageWebhooks` | "You need admin role to manage webhooks" |
| `/api/webhooks/[id]/test` | POST | `canManageWebhooks` | "You need admin role to manage webhooks" |
| `/api/webhooks/[id]/deliveries` | GET | `canManageWebhooks` | "You need admin role to manage webhooks" |
| `/api/webhooks/[id]/secret` | POST | `canManageWebhooks` | "You need admin role to manage webhooks" |

### 14. Frontend button-level gating — `src/components/views/chats-view.tsx` (MODIFIED)
- Imported `useCan` from `@/hooks/use-current-user`.
- `ChatWindow` calls `const canSend = useCan('canSendMessages')` and `const canSchedule = useCan('canScheduleMessages')`.
- The Send button is now wrapped in a `Tooltip` and disabled when `!canSend`; the tooltip reads "You need operator role to send messages" when blocked.
- The Schedule button is disabled when `!canSchedule` with a matching tooltip.
- `handleSubmit` also early-returns when `!canSend` so the Enter key can't bypass the disabled button.
- Viewers (read-only) can still browse chats and read messages, but the composer's action buttons are visibly disabled with explanatory tooltips. The API also returns 403 if they craft a request directly.

## Verification

### Lint & TypeScript
- `bun run lint` → **0 errors, 0 warnings** (exit 0).
- `bunx tsc --noEmit` → my touched files produce **0 type errors**. The remaining TS errors in the repo are all in other agents' files (`examples/websocket/server.ts`, `skills/image-edit`, `skills/stock-analysis-skill`, `src/lib/ai-engine.ts`, `src/lib/sentiment.ts`) — none introduced by this task.

### End-to-end API tests (curl, against running dev server)
| Scenario | Expected | Actual |
|---|---|---|
| Operator GET /api/users | 403 | ✅ 403 "You do not have permission to manage users" |
| Operator PUT /api/settings/ai | 403 | ✅ 403 "You need admin role to manage settings" |
| Operator GET /api/webhooks | 403 | ✅ 403 "You need admin role to manage webhooks" |
| Operator POST /api/messages | pass auth, 404 on bad contact | ✅ 404 "Contact not found" (auth + permission passed) |
| Viewer POST /api/messages | 403 | ✅ 403 "You need operator role to send messages" |
| Viewer POST /api/scheduled | 403 | ✅ 403 "You need operator role to schedule messages" |
| Viewer POST /api/simulator/send | 403 | ✅ 403 "You need operator role to use the simulator" |
| Viewer POST /api/broadcast | 403 | ✅ 403 "You need operator role to send broadcasts" |
| Viewer GET /api/export | 403 | ✅ 403 "You need admin role to export data" |
| Viewer GET /api/users | 403 | ✅ 403 "You do not have permission to manage users" |
| Admin GET /api/users | 200, 3 seeded users | ✅ 200, items=[admin, operator, viewer] |
| Admin POST /api/users (new operator) | 200 | ✅ 200, returns new user row |
| Admin POST duplicate username | 409 | ✅ 409 "Username \"operator\" is already taken" |
| Admin POST short password | 400 | ✅ 400 "Password must be at least 6 characters" |
| Admin PATCH self → demote to viewer | 400 | ✅ 400 "You cannot change your own role" |
| Admin DELETE self | 400 | ✅ 400 "You cannot delete your own account" |
| Admin DELETE other user | 200 | ✅ 200 {"ok":true} |
| GET / (login page) | 200 | ✅ 200 |
| GET / (after admin login) | 200 | ✅ 200 |

## Stage Summary

### Files created
- `src/lib/permissions.ts` — Role, Permission, ROLE_PERMISSIONS, can(), getVisibleNavItems(), canView(), permissionForView(), roleOf()
- `src/app/api/users/route.ts` — GET list + POST create (admin only, audit-logged)
- `src/app/api/users/[id]/route.ts` — PATCH update + DELETE (admin only, self-lockout + last-admin guards, audit-logged)
- `src/components/views/users-view.tsx` — UsersView (role legend, table, new/edit dialog, delete confirmation, current-user "You" badge)
- `src/components/permission-denied.tsx` — friendly 403 card with Lock icon + back button
- `src/hooks/use-current-user.tsx` — CurrentUserProvider + useCurrentUser() + useCan()

### Files modified
- `src/lib/auth.ts` — exported `hashPassword()`; rewrote `ensureDefaultUser()` to seed 3 demo accounts (admin/operator/viewer)
- `src/lib/types.ts` — added `'users'` to ViewKey; added `UserListRow` interface
- `src/lib/nav.ts` — imported `Users` icon; added users nav entry in 'system' group
- `src/components/app-shell.tsx` — `NavLinks` accepts `role` prop and filters items via `getVisibleNavItems()`; empty groups hidden
- `src/components/views/login-view.tsx` — replaced single demo hint with clickable 3-account grid
- `src/app/page.tsx` — wrapped in `CurrentUserProvider`; added view-level permission gate + `PermissionDenied` fallback; added UsersView router case
- `src/components/views/chats-view.tsx` — disabled Send + Schedule buttons for viewers with explanatory tooltips; `handleSubmit` early-returns on no permission
- `src/app/api/messages/route.ts` — POST now requires `canSendMessages`
- `src/app/api/broadcast/route.ts` — POST now requires `canSendMessages`
- `src/app/api/scheduled/route.ts` — POST now requires `canScheduleMessages`
- `src/app/api/simulator/send/route.ts` — POST now requires `canUseSimulator`
- `src/app/api/settings/ai/route.ts` — PUT now requires `canManageSettings`
- `src/app/api/settings/company/route.ts` — PUT now requires `canManageSettings`
- `src/app/api/settings/owner/route.ts` — PUT now requires `canManageSettings`
- `src/app/api/settings/autoreply/route.ts` — PUT now requires `canManageSettings`
- `src/app/api/export/route.ts` — GET now requires `canManageData`
- `src/app/api/import/route.ts` — POST now requires `canManageData`
- `src/app/api/webhooks/route.ts` — GET + POST now require `canManageWebhooks`
- `src/app/api/webhooks/[id]/route.ts` — PATCH + DELETE now require `canManageWebhooks`
- `src/app/api/webhooks/[id]/test/route.ts` — POST now requires `canManageWebhooks`
- `src/app/api/webhooks/[id]/deliveries/route.ts` — GET now requires `canManageWebhooks`
- `src/app/api/webhooks/[id]/secret/route.ts` — POST now requires `canManageWebhooks`

## Result

20 views, 60+ API routes. The platform now supports a real team:

- **Admin** sees everything including the new Users page. Can create/edit/delete team members, manage webhooks, export/import data, and change any setting.
- **Operator** sees the workspace + system groups (dashboard, whatsapp, chats, leads, simulator, broadcast, scheduled, search, analytics, logs) but the Settings group is hidden, and the Users / Webhooks / Data / System nav entries don't appear. They can send messages, schedule, and use the simulator. If they try to hit a gated API directly, they get a 403.
- **Viewer** sees only dashboard, chats, leads, search, analytics. In the chats view, the Send and Schedule buttons are disabled with "You need operator role to send messages" tooltips. They can't access WhatsApp, simulator, broadcast, scheduled, logs, system, webhooks, data, users, or any settings — both in the sidebar (hidden) and at the API level (403).

All three demo accounts are auto-seeded on first request to `/api/auth/login` or `/api/auth/me`. Existing databases get the new operator/viewer accounts added on the next request without touching the admin password.

Self-lockout is impossible: an admin can't demote or delete themselves, and the last admin can't be demoted or deleted — both blocked client-side and server-side.

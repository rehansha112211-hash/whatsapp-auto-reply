# F3 — Scheduled Messages

Task: Build a "Scheduled Messages" feature — owner composes a message
to a contact, picks a future time, and a background checker sends due
messages via `wa-engine.sendOwnerMessage`.

## What I delivered

### DB
- `prisma/schema.prisma`: added `ScheduledMessage` model
  (id, contactId, text, scheduledAt, status, sentAt, createdAt) +
  `scheduledMessages ScheduledMessage[]` relation on Contact.
  Composite index on (status, scheduledAt) for fast due-lookups.
- Ran `bun run db:push` — schema in sync, Prisma client regenerated.

### Types & Nav
- `src/lib/types.ts`: added `'scheduled'` to `ViewKey`; also added a
  `ScheduledMessageRow` interface for the API shape.
- `src/lib/nav.ts`: imported `Clock`, added a new NAV_ITEMS entry
  `{ key: 'scheduled', label: 'Scheduled', icon: Clock, group: 'main' }`
  right after `broadcast`.

### API
- `src/app/api/scheduled/route.ts` — GET (lists pending-first then
  recent, includes contact name+phone), POST (validates contact
  exists, text non-empty, future time; creates with status='pending';
  writes a Log entry).
- `src/app/api/scheduled/[id]/route.ts` — PATCH (only while pending;
  updates text and/or scheduledAt with re-validation), DELETE
  (cancels a pending one → status='cancelled'; terminal records are
  a no-op returning their current status).
- `src/app/api/scheduled/process/route.ts` — POST finds every
  pending row with scheduledAt ≤ now (capped at 100/tick), calls
  `sendOwnerMessage` for each, marks status='sent' + sentAt=now,
  logs per-contact, returns `{ ok, processed, failed }`.

### View
- `src/components/views/scheduled-view.tsx` — full UI:
  header + "New Scheduled Message" button, 3 stat cards (Pending /
  Sent today / Cancelled) using `AnimatedCounter`, "Auto-processing
  ON/PAUSED" indicator, Tabs (Pending | Sent | All).
  - New/Edit dialog: searchable ContactPicker (Popover combobox
    fetching `/api/chats?limit=100`), Textarea with char-count,
    `<input type="datetime-local">` with quick-pick chips ("In 1
    hour", "In 3 hours", "Tomorrow 9 AM", "Next Monday 9 AM").
  - Rows show contact avatar + name + phone, message preview
    (line-clamp-2), scheduledAt (absolute + relative time-until
    badge: emerald/amber/rose), Edit/Cancel buttons.
  - Polls POST /api/scheduled/process every 30s (paused while
    document is hidden) and silently refreshes the list.
- `src/app/page.tsx`: imported `ScheduledView`, added router case
  `{active === 'scheduled' && <ScheduledView onNavigate={setActive} />}`.

### Chats composer integration
- `src/components/views/chats-view.tsx`: added a small Clock icon
  button (with Tooltip) between the textarea and the Send button.
  Opens a "Schedule message" dialog pre-filled with the current
  composer text + the active contact. On submit POSTs to
  `/api/scheduled` and toasts success. Imports for Dialog + Label
  added.

## Quality gates
- `bun run lint` → clean (exit 0).
- TypeScript strict, no `any`.
- End-to-end verified:
  1. POST /api/scheduled (1 min in future) → status='pending'.
  2. POST /api/scheduled/process before due → `processed: 0`.
  3. Wait 70s, POST /process again → `processed: 1`.
  4. GET /api/scheduled → status='sent', sentAt populated.
  5. GET /api/messages?contactId=… → the new owner-source outgoing
     message is in the chat.
  6. PATCH and DELETE both verified.

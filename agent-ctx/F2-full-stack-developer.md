# Task F2 — Conversation Tags / Labels

**Agent:** full-stack-developer (Conversation Tags)
**Project:** WhatsApp AI Auto Reply Platform (QorvixNode Technologies)
**Date:** 2026-07-18

## Task
Build a Conversation Tags / Labels feature — lets the owner tag conversations with labels like "urgent", "follow-up", "vip", "closed", "Hot Lead" for organization and filtering across Chats + Leads views.

## Scope of work
1. **DB schema** — add `Tag` + `ContactTag` models, add a `tags` relation to the existing `Contact`.
2. **API routes** — `/api/tags` (GET+POST), `/api/tags/[id]` (PUT+DELETE), `/api/contacts/[id]/tags` (GET+POST+DELETE). Modify `/api/chats` GET to support `?tag=` filter and include tags in response. Modify `/api/leads` GET + export to include tags + tag filter.
3. **Shared helpers** — `TAG_COLORS` palette + `tagColor()` helper in `src/lib/format.ts`.
4. **Types** — `TagItem`, `TagWithCount` in `src/lib/types.ts`; extend `ChatListItem`, `ContactDetail`, `LeadRow` with a `tags: TagItem[]` field.
5. **ChatsView UI** — tag badges in conversation list (up to 2 + "+N"), tag filter popover with active-filter banner, tags in chat window header, Tags section in customer details panel (removable badges + Add-tag picker with create-if-not-exists).
6. **LeadsView UI** — Tags column (up to 2 + "+N"), tag filter popover in the toolbar.

## Files

### Created
- `src/app/api/tags/route.ts` — GET (auto-seeds 5 defaults) + POST (create with name + color, validates uniqueness).
- `src/app/api/tags/[id]/route.ts` — PUT (rename/recolor) + DELETE (cascades to ContactTag).
- `src/app/api/contacts/[id]/tags/route.ts` — GET (list contact's tags) + POST (add by tagId OR by name with create-if-not-exists) + DELETE (remove by ?tagId).

### Modified
- `prisma/schema.prisma` — added `Tag` model (id, unique name, color default "emerald", createdAt, contacts relation) and `ContactTag` join model (composite PK [contactId, tagId], @@index([tagId]), Cascade on both relations). Added `tags ContactTag[]` to Contact.
- `src/lib/format.ts` — added `TAG_COLORS` (8 colors: emerald, amber, rose, sky, violet, zinc, orange, teal) and `tagColor()` helper that falls back to emerald.
- `src/lib/types.ts` — added `TagItem` + `TagWithCount`; added `tags: TagItem[]` to `ChatListItem`, `ContactDetail`, `LeadRow`.
- `src/app/api/chats/route.ts` — added `?tag=X` query support (filters contacts via `tags: { some: { tag: { name } } }`); includes tags in each ChatListItem response. Backwards-compatible.
- `src/app/api/contacts/[id]/route.ts` — GET + PATCH now include `tags` in the ContactDetail response.
- `src/app/api/leads/route.ts` — added `?tag=` filter + tags in each LeadRow response.
- `src/app/api/leads/export/route.ts` — added `?tag=` filter + a `Tags` column to the CSV output.
- `src/components/views/chats-view.tsx` — added 3 reusable components (`TagPill`, `TagBadgeCluster`, `TagPicker`); ConversationList now has a tag-filter popover + active-filter banner + tag badges in each row; ChatWindow header shows tags; DetailsPanel has a new Tags section with removable badges + Add-tag picker; main ChatsView wires `tagFilter` + `allTags` state and `handleAddTag` / `handleCreateTag` / `handleRemoveTag` handlers with optimistic updates.
- `src/components/views/leads-view.tsx` — added `LeadTagBadges` component, a new Tags column in the table, and a tag-filter popover in the toolbar.

## API behavior summary

### `GET /api/tags`
- Auth required.
- Auto-seeds 5 default tags on first call if none exist: Urgent (rose), Follow-up (amber), VIP (violet), Closed (zinc), Hot Lead (emerald).
- Returns `{ items: [{ id, name, color, contactCount }] }`.

### `POST /api/tags`
- Body: `{ name, color }`.
- Validates name (required, max 40 chars) and color (must be one of the 8 valid keys, defaults to emerald).
- 409 on duplicate name; 201 on success.

### `PUT /api/tags/[id]`
- Body: `{ name?, color? }`.
- 404 if tag doesn't exist; 409 if a different tag already has the same name.

### `DELETE /api/tags/[id]`
- Cascades to ContactTag automatically (onDelete: Cascade in schema).

### `GET /api/contacts/[id]/tags`
- Returns `{ items: [{ id, name, color }] }` sorted by name.

### `POST /api/contacts/[id]/tags`
- Body: `{ tagId }` OR `{ name, color? }`.
- When `name` is provided, the tag is upserted (create-if-not-exists).
- Returns the full updated tag set with status 201.

### `DELETE /api/contacts/[id]/tags?tagId=X`
- Removes the join row; idempotent (200 even if already gone).

### `GET /api/chats?tag=X`
- Filters contacts carrying the tag named X. Composes with `search`, `filter`, `phone`, `sort`.
- Each ChatListItem now includes `tags: [{ id, name, color }]`.

### `GET /api/leads?tag=X`
- Same tag filter behavior for the leads table.
- Each LeadRow now includes `tags`.

## UI behavior summary

### Conversation list (left pane)
- Each row shows up to 2 tag pills below the phone/lead-score row, with "+N" overflow chip + tooltip.
- A Tag-icon button next to the filter Select opens a popover listing all tags (color dots + contact counts + active checkmark). When active, the button turns emerald-gradient.
- An "Active tag filter" banner appears above the list showing the active tag pill + X to clear.
- Empty state adapts: "No conversations tagged 'X'" when a tag filter is active.

### Chat window (center pane)
- Header row uses `flex-wrap` and appends the tag cluster after the LeadBadge/Human badges, so the contact's tags are visible in the chat header.

### Customer details panel (right pane)
- A new "Tags" section at the top shows current tags as removable TagPills (X on hover, per-tag loading state).
- An "Add tag" button opens the `TagPicker` Popover: search input + scrollable list of all tags (color dots, contact counts, checkmark on already-applied tags) + "Create tag '…'" option when the typed query doesn't match an existing tag exactly.

### Leads table
- A new Tags column (between Status and Last Message) shows up to 2 tag pills + "+N" with tooltip.
- A tag-filter Popover button sits in the toolbar (between Sort and Min-score slider); turns emerald-gradient when active, with a separate X button next to it for clearing.

## Tag color mapping
Defined in `src/lib/format.ts`:

```ts
export const TAG_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-500/15',   text: 'text-amber-300',   dot: 'bg-amber-500' },
  rose:    { bg: 'bg-rose-500/15',    text: 'text-rose-300',    dot: 'bg-rose-500' },
  sky:     { bg: 'bg-sky-500/15',     text: 'text-sky-300',     dot: 'bg-sky-500' },
  violet:  { bg: 'bg-violet-500/15',  text: 'text-violet-300',  dot: 'bg-violet-500' },
  zinc:    { bg: 'bg-zinc-500/15',    text: 'text-zinc-300',    dot: 'bg-zinc-500' },
  orange:  { bg: 'bg-orange-500/15',  text: 'text-orange-300',  dot: 'bg-orange-500' },
  teal:    { bg: 'bg-teal-500/15',    text: 'text-teal-300',    dot: 'bg-teal-500' },
}

export function tagColor(color: string) {
  return TAG_COLORS[color] ?? TAG_COLORS.emerald
}
```

## Verification

- `bun run db:push` → succeeded; Tag + ContactTag tables created.
- `bun run lint` → 0 errors, 0 warnings.
- End-to-end API tests (curl as admin):
  - GET /api/tags → 200, returns 5 seeded defaults.
  - POST /api/contacts/[id]/tags `{tagId}` → 201, returns updated set.
  - POST /api/contacts/[id]/tags `{name, color}` → 201, creates tag via upsert.
  - DELETE /api/contacts/[id]/tags?tagId=X → 200.
  - PUT /api/tags/[id] → 200.
  - DELETE /api/tags/[id] → 200, cascades to ContactTag (verified).
  - GET /api/chats?tag=Urgent → returns only Urgent-tagged conversations.
  - GET /api/leads?tag=Urgent → returns only Urgent-tagged leads.
  - GET /api/leads/export?limit=3 → CSV includes Tags column.
  - GET / → 200, page renders without errors.
- Pre-applied demo tags so the feature is visible on first preview: Vikram Singh → Hot Lead + VIP, Rahul Sharma → Follow-up, Priya Patel → Urgent.

## Notes
- SQLite's Prisma adapter doesn't support `skipDuplicates` on `createMany`, so the default-tag seed uses a plain `createMany` guarded by a `count > 0` short-circuit. Safe because the guard runs before every seed.
- The `ContactTag` join uses a composite PK `[contactId, tagId]`, so upserting the join is idempotent — adding the same tag twice is a no-op.
- All tag mutations trigger three parallel refreshes: chats list (so list badges update), contact detail (so the right panel updates), and the global allTags list (so contact counts in the picker stay fresh).
- Optimistic UI: when adding/removing a tag, the detail + chats list are updated from the API response (or by filtering the removed tag locally) before the refresh kicks in, so the UI feels instant.

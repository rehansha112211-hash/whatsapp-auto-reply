# Task F1-R7 — Knowledge Base / FAQ

**Agent:** full-stack-developer (Knowledge Base)
**Date:** 2026-07-18
**Project:** WhatsApp AI Auto Reply Platform (QorvixNode Technologies)

## Summary

Built a Knowledge Base / FAQ feature that lets the owner create articles
(pricing, services, policies, FAQs) which the AI references when generating
replies. The AI engine searches the KB on every incoming message and injects
relevant article content into the system prompt so replies reference real
company knowledge instead of inventing answers.

## What I built

### Database
- Added `KnowledgeArticle` Prisma model (id, title, content, category, tags,
  isActive, priority, viewCount, timestamps) with indexes on
  `[category, isActive]` and `[priority]`. Ran `bun run db:push` — schema
  synced (24 models total).

### Library / shared code
- `src/lib/types.ts` — added `'knowledge-base'` to `ViewKey` (21 views total)
  + `KnowledgeCategory`, `KnowledgeArticleItem`, `KnowledgeSearchHit` types.
- `src/lib/nav.ts` — added `BookOpen` import + nav entry in 'settings' group.
- `src/lib/permissions.ts` — added `canManageKnowledgeBase` flag
  (admin=true, operator=false, viewer=false). Added 'knowledge-base' to
  `ALL_VIEWS` (admin-only nav) and to `permissionForView()` so the view-level
  gate works for non-admins who craft the URL.
- `src/lib/ai-engine.ts` — added `searchKnowledgeBase()` (token-based
  relevance search, returns top 5 active articles truncated to 500 chars),
  `knowledgeBlock()` (renders articles into a prompt section), and wired
  both into `generateReply()`. Updated rule #4 in the system prompt to
  direct the LLM to use the KB context and not invent numbers.

### API routes
- `GET/POST /api/knowledge-base` — list (with category/search/activeOnly
  filters) + create. GET auto-seeds 5 default articles on first access when
  the table is empty (Pricing Guidelines, Our Services, Refund Policy,
  Project Timeline, Support Hours & Response SLA).
- `GET/PATCH/DELETE /api/knowledge-base/[id]` — single article (increments
  viewCount on GET), update (admin), delete (admin).
- `GET /api/knowledge-base/search?q=` — token-based relevance search
  used by the AI engine. Returns top 5 active articles with normalised
  0..1 relevance scores.

### View
- `src/components/views/knowledge-base-view.tsx` (~700 lines) — header,
  info banner, debounced search bar + category filter chips with counts,
  responsive 1/2/3 card grid (category badge colors: pricing=amber,
  services=emerald, policies=rose, faq=sky, general=zinc), new/edit
  dialog with side-by-side live markdown preview, detail dialog,
  delete confirmation. Framer-motion staggered entrance. Permission-aware
  (admin-only create/edit/delete UI; API enforces the same gate).

### Wiring
- `src/app/page.tsx` — imported `KnowledgeBaseView`, added router case.

## Pre-existing bugs fixed (to unblock testing)

These were not caused by my code but were blocking the entire dev server,
so I fixed them as part of the F1-R7 quality gates:

1. `src/lib/translate.ts:48` — array literal `SCRIPT_RULES` was closed with
   `}` instead of `]` (syntax error breaking every API route that imports
   `wa-engine.ts`, which transitively imports `translate.ts`).
2. `src/components/views/chats-view.tsx` and
   `src/components/views/contact-profile-view.tsx` — both imported a
   non-existent `Translate` icon from lucide-react. Replaced with
   `Languages` (existing import already had `Languages`, so the swap was
   trivial). Without this fix, the Next.js page returned HTTP 500 for every
   route.

## Verification

### Lint
`bun run lint` → **0 errors, 0 warnings** (exit 0).

### End-to-end API tests (curl + cookie auth)
- Login (admin) → 200 ✓
- GET `/api/knowledge-base` (fresh DB) → auto-seeded 5 default articles ✓
- GET `/api/knowledge-base?category=pricing` → 1 article ✓
- GET `/api/knowledge-base/search?q=what is the cost of a website`
  → top hit: Pricing Guidelines (relevance 1.0) ✓
- GET `/api/knowledge-base/search?q=can i get a refund for my project`
  → top hit: Refund Policy (relevance 1.0) ✓
- GET `/api/knowledge-base/[id]` → returns article ✓
  Three successive reads incremented viewCount 1 → 2 → 3 ✓
- PATCH `/api/knowledge-base/[id]` (admin) → priority updated to 95 ✓
- GET unknown id → 404 ✓
- POST (admin) → article created ✓
- DELETE (admin) → article removed ✓
- Login (viewer) → POST returns 403, PATCH returns 403, GET returns 200 ✓
- Unauth GET → 401 ✓

### AI integration test (the headline quality gate)
Sent two messages via the simulator with phone `+919876543210`, name
"KB Test Customer":

1. First message: "Hi, I want to know the cost of building a website.
   What are your pricing options?" — AI gave the welcome intro (correct
   per rule #2 for first messages).
2. Second message: "Yes please tell me the pricing for a custom business
   website. What will it cost?" — AI replied with the exact pricing range
   from the KB:
   > "For a custom business website, pricing typically ranges from ₹25,000
   > to ₹50,000 depending on your specific requirements. To give you an
   > accurate quote, could you share details about how many pages you need
   > and any special features?"

   This matches the `Pricing Guidelines` article's
   "Custom business website (multi-page): ₹25,000 – ₹50,000" line —
   confirming KB content was successfully injected into the system prompt
   and used by the LLM. The AI did NOT invent numbers; it referenced the
   actual KB content. ✓

### Dev server
GET `/` returns 200 ✓

## Files touched

### Created
- `src/app/api/knowledge-base/route.ts`
- `src/app/api/knowledge-base/[id]/route.ts`
- `src/app/api/knowledge-base/search/route.ts`
- `src/components/views/knowledge-base-view.tsx`

### Modified
- `prisma/schema.prisma`
- `src/lib/types.ts`
- `src/lib/nav.ts`
- `src/lib/permissions.ts`
- `src/lib/ai-engine.ts`
- `src/app/page.tsx`

### Pre-existing bug fixes
- `src/lib/translate.ts` (one-char syntax fix: `}` → `]`)
- `src/components/views/chats-view.tsx` (Translate → Languages)
- `src/components/views/contact-profile-view.tsx` (Translate → Languages)

## Result

21 views, 64 API routes, 24 Prisma models. The AI auto-reply engine now
grounds its answers in real company knowledge — when a customer asks about
pricing/services/refunds/timelines, the engine finds matching KB articles
and injects them into the system prompt, so the LLM's reply references
actual project cost ranges instead of inventing numbers. The Knowledge
Base auto-seeds 5 default articles on first access so the AI has useful
context out of the box. Admins can create/edit/delete articles through a
polished UI with a live markdown preview; operators/viewers can read but
not modify. Every mutating API route enforces `canManageKnowledgeBase`
server-side, so a crafted request from a non-admin returns 403.

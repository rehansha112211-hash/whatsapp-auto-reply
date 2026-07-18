# F1-R6 — AI Sentiment Analysis

## Task
Add AI-powered sentiment & intent detection to every incoming WhatsApp customer message. Each message is classified as positive / neutral / negative / urgent with a -1..1 score and a short intent label, then surfaced on the dashboard + per-contact profile.

## Files touched
- Created `src/lib/sentiment.ts` — `analyzeSentiment(text)` using z-ai-web-dev-sdk LLM (glm-4.5) with a 5-second timeout and a heuristic keyword fallback. Never throws.
- Created `src/app/api/sentiment/route.ts` — GET endpoint returning overview / 7-day trend / recent negative list / top intents.
- Modified `prisma/schema.prisma` — added `sentiment` / `sentimentScore` / `intent` fields to `Message`, added the new `SentimentAnalysis` model.
- Modified `src/lib/wa-engine.ts` — calls `analyzeSentiment` after saving the incoming message; updates the Message row; creates a SentimentAnalysis record; raises an owner_request Notification on urgent/negative sentiment; never blocks the AI reply pipeline.
- Modified `src/app/api/contacts/[id]/profile/route.ts` — returns the sentiment fields on each message.
- Modified `src/components/views/dashboard-view.tsx` — added a `SentimentSection` (donut + trend + alert list + intent bar) below the Live Activity Feed.
- Modified `src/components/views/contact-profile-view.tsx` — added `SentimentBadge` on each incoming message bubble + a `SentimentSummaryCard` mini-card at the top of the Statistics tab.

## Quality gates
- `bun run db:push` ✅
- `bun run lint` ✅ (no errors / warnings)
- TypeScript strict, no `any`, no `console.log`, no TODO.

## Key design choices
- Sentiment analysis runs on every incoming message but is wrapped in try/catch so the pipeline always continues.
- LLM call is raced against a 5-second timeout; on timeout / parse failure / error, a heuristic keyword scan produces a deterministic fallback.
- SentimentAnalysis is a separate model (in addition to the Message fields) so we keep a long history of every analysis with the AI-generated summary line.
- Sentiment colors: positive=emerald, neutral=zinc, negative=rose, urgent=amber. Emojis (😊 😐 😟 ⚠️) used in badges + alert list.

# Task 4-f — Settings views + APIs

Agent: full-stack-developer (Settings views + APIs)

## Files created

### API routes (all auth-gated with getCurrentUser, 401 if unauthed)
- `src/app/api/settings/ai/route.ts` — GET (returns ApiSetting with apiKey masked as `••••••••` + last 4 chars; returns defaults if row missing) + PUT (upsert; if incoming apiKey starts with `•`, keeps existing key; sets status='untested'; security log).
- `src/app/api/settings/ai/test/route.ts` — POST runs `testAIConnection()` from `src/lib/ai-engine.ts`, updates ApiSetting.status to 'ok'/'error' and lastTestedAt=now, ai log.
- `src/app/api/settings/company/route.ts` — GET (Company row, services/businessHours JSON-decoded) + PUT (services & businessHours stored as JSON strings, upsert).
- `src/app/api/settings/owner/route.ts` — GET + PUT (upsert + security log "Owner settings updated").
- `src/app/api/settings/owner/test-notify/route.ts` — POST creates Notification { type:'owner_request', title:'Test Notification', body:`Test notification from ${ownerName} at ${time}`, severity:'info' } and an owner_notify log.
- `src/app/api/settings/autoreply/route.ts` — GET + PUT (upsert + frontend log).

### View components ('use client', named exports + default)
- `src/components/views/ai-settings-view.tsx` → `AISettingsView`
- `src/components/views/company-settings-view.tsx` → `CompanySettingsView`
- `src/components/views/owner-settings-view.tsx` → `OwnerSettingsView`
- `src/components/views/autoreply-settings-view.tsx` → `AutoReplySettingsView`

## Design conventions used
- Cards: `rounded-xl border bg-card/60 backdrop-blur`
- WhatsApp-green primary, no indigo/blue
- Loading state via `Skeleton`, saving state via Spinner (`Loader2 animate-spin`) on buttons
- Sonner toasts (`toast.success` / `toast.error`) with descriptions
- Sliders show current value next to the label (font-mono)
- Responsive: 1 column mobile, 2-3 columns on `md`/`lg` where appropriate
- Icons from lucide-react: Bot, Building2, UserCog, Reply, Save, RotateCcw, Plug, Eye, EyeOff, Check, AlertTriangle, Clock, Globe, Sparkles, Loader2, Flame, Zap, ShieldAlert, Bell

## Key API behaviors
- AI key masking: `maskApiKey(key)` returns `''` if empty, `MASK_PREFIX + key.slice(-4)` otherwise. PUT detects placeholder via `value.startsWith('•')` and preserves existing key.
- All PUTs validate/normalize types (clamp numbers to safe ranges, normalize enum strings like availability/language).
- All PUTs write a log entry (security for AI/Owner, frontend for Company/AutoReply).

## Lint / Type status
- `bun run lint`: 0 errors in my files (only pre-existing warning in `src/hooks/use-realtime.ts`).
- `bunx tsc --noEmit`: 0 errors in any created file.
EOF
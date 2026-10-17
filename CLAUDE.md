# CLAUDE.md

Jam is a native **Expo SDK 57 + Expo Router** app that runs in **Expo Go**. Friends travelling together share live location in a private "Jam", and the app escalates calmly (check-in → group alert → AI support call → trusted contacts) if someone may need support. The backend is Supabase (Auth, Postgres + RLS, Realtime Broadcast, Storage, Edge Functions on Deno). The demo is the "Campus Walk" (UofT St. George → St. George Station). It's a 36-hour hackathon project built by 5 people (P1–P5), so keep changes small and mergeable.

## Commands

```bash
npm install                 # re-run after EVERY pull/merge: branches add packages (e.g. expo-clipboard)
npm start                   # Expo dev server; scan the QR in Expo Go (SDK 57). -c clears the Metro cache
npm run start:tunnel        # when the phone can't reach the laptop on Wi-Fi
npm run check               # typecheck + lint + vitest. Must pass before any commit/PR
npm run doctor              # expo-doctor
npx vitest run path/to/file.test.ts                     # a single test file
npx expo export --platform ios --platform android --output-dir <tmp>   # proves the bundle resolves
deno test --allow-env supabase/functions/_shared/<file>.test.ts       # Edge Function tests (NOT in npm run check)
npm run publish:demo        # EAS Update to the "demo" branch (demo day)
```

Install native modules only with `npx expo install <pkg>`, and only modules that ship in Expo Go.

## Layout

```
src/app/                 Expo Router routes. Keep them THIN: they render a screen from src/features
  (auth)/                welcome, profile, consent, baseline
  jam/[jamId]/(tabs)/    map, group, signals, settings (+ JamOverlayHost, keep-awake in _layout)
  jam/[jamId]/lobby, support-call · incident/[token] · contacts · demo-control · data-sources · dev
src/features/<area>/     screens + logic per owner; each has a README.md with the details
  auth, jams (P2) · map, location (P3) · health, ai (P4) · alerts, contacts (P5) · demo (shared registry)
src/components/          JamMapView (react-native-maps base), JamOverlayHost, ui/ (Button, Card, Badge, Screen, States…)
src/lib/types/           SHARED CONTRACTS: domain.ts, events.ts (realtime payloads), database.ts (rows), services.ts
src/lib/constants/       thresholds, timings, scripts, ntfy copy
src/lib/validation/      Zod schemas; inbound realtime payloads are validated and malformed ones dropped
src/lib/supabase/        client (singleton, null when unconfigured), auth helpers, Edge Function wrappers
src/lib/demo/            campus-walk.json + typed `campusWalk` (seed ids, routes, members)
src/services/<name>/     interface → index.ts picks real vs mock (see "Services")
src/theme/               design tokens (P2 owns values; names are stable)
supabase/migrations/     schema + RLS + RPCs   · supabase/seed.sql: demo accounts + Campus Walk
supabase/functions/      Edge Functions + _shared/ (Deno; can't import from src/)
```

## Architecture essentials

- **Realtime:** one Broadcast channel per Jam, `jam:{jamId}`. Use `const ch = useJamChannel(jamId); useJamEvent(ch, "location_update", fn)`. Events: `location_update`, `member_status`, `health_update`, `alert_created`, `alert_updated`, `checkin_requested`, `ai_call_state`, `incident_created`. Delivery includes your own messages (`self: true`), so filter by `userId`. Channels are public-but-unguessable, so broadcasts carry **ids and states only**: no phone numbers, health history, recordings, or alert reasons. Re-read those through RLS.
- **`postgres_changes` covers only `jams`, `jam_members`, `alerts`, `alert_responses`** (the `supabase_realtime` publication). `live_locations` and `health_signals` are NOT published. For live location use the `location_update` / `member_status` broadcasts, plus a periodic re-read (see `src/features/jams/useLiveLocations.ts`).
- **Location (P3):** `useLocationSharing` (mounted by the Map tab) starts only with `location_consent` + Jam `active` + member active + app foreground + OS permission. It broadcasts every ~4s and upserts `live_locations` at most every 10s or after a 10m move. Presence: 30s without an update → stale, 60s → offline. Use receive time, not sender clocks. Staleness never means danger.
- **Escalation (P4):** the pure `transition()` in `src/features/health/escalation.ts`. Alerts move only through `alertActions.ts` (compare-and-set). Timers survive closed phones: any member calls the `advance-alert` Edge Function when `next_deadline_at` passes. There is one open alert per user (DB-enforced; a duplicate insert gives `23505`, which counts as a no-op).
- **Demo actions:** register with `demoActions.register({ id: DEMO_ACTION_IDS.x, label, owner, run })` in a `useEffect`. Never build another demo panel; P5's `/demo-control` is the only one. Read targets at run time with `getDemoContext()` (`{ jamId, affectedUserId }`) and never hardcode seeded ids. Actions run on the tapping phone, so they must **broadcast** to affect other phones.
- **Civic data:** Toronto Open Data + OSM, preprocessed into `src/features/map/data/*.json` and imported statically (no runtime fetching). To regenerate, run `node src/features/map/data/extract/extract-toronto.mjs <cache-dir-outside-repo>`, then `server-support-points.mjs` (writes `supabase/functions/_shared/support-points.json`).

## Services

`@/services` exports one instance per service. `mockServicesEnabled` (Supabase unconfigured, or `EXPO_PUBLIC_USE_MOCK_SERVICES=true`) switches realtime to an in-memory loopback (single device only), and also switches incident, notification and AI to their mocks. Always real: location (`expo-location`; the mock is the per-user *simulated* source for Demo Mode), routing (OSRM with Campus Walk demo-route fallback), risk (the pure engine), health (simulated wearable). Services never throw for expected failures; they fall back (scripted AI line, demo route, in-app alert).

## Rules

- **Contracts are frozen:** `src/lib/types`, migrations, event payloads, and service interfaces. Adding optional fields or new types is fine. Renames, removals, and schema changes need a small team-tagged PR. A schema change means a new migration **and** updating `src/lib/types/database.ts`.
- **Ownership:** edit only your area (table in README.md). Cross-owner screens are mounted stubs: replace the body and keep the export and props.
- **Secrets:** the app only sees `EXPO_PUBLIC_*` (public, bundled). Gemini, ntfy, Twilio, the service role, and `AI_CALL_SIGNING_SECRET` live in Edge Function secrets (`supabase/functions/.env.example`). Edge Functions verify the caller (`requireUser`) and check access with the user client before using `adminClient()`.
- **App ↔ Edge Function copies must stay identical:**
  - The escalation block between `BEGIN/END SHARED` in `src/features/health/escalation.ts` and `supabase/functions/_shared/escalation.ts`. `escalation.test.ts` fails on drift.
  - `src/lib/constants` ↔ `supabase/functions/_shared/constants.ts` (no automated check).
  - `src/lib/ai/supportCallLine.ts` ↔ `supabase/functions/_shared/supportCallLine.ts` (no automated check).
- **Tone and privacy:** calm copy. Never say "safe"/"unsafe"/"danger" about places or people, never diagnose, and use red (`colors.escalation`) only for confirmed escalation. All consents default to off, and the emergency preference must be actively chosen. Nothing records, notifies contacts, or shares location without its consent.
- **Accessibility:** `accessibilityRole`/`accessibilityLabel` on controls, touch targets of at least `TAP_TARGET` (48), never `allowFontScaling={false}` (use `maxFontSizeMultiplier`).

## Code conventions

- TypeScript strict with `noUncheckedIndexedAccess`; import via `@/…`. Use theme tokens (`colors`, `space()`, `radius`, `type`), never ad-hoc colours.
- **Unit tests are pure TS:** `src/**/*.test.ts` run in Node, with **no `react-native` imports** in anything they load (`@/lib/supabase/client` pulls in RN). Put logic in pure modules (e.g. `liveLocationMerge.ts`, `memberStore.ts`, `recommendation.ts`) and keep hooks thin.
- The lint config is eslint-config-expo with the React Compiler rules. `react-hooks/set-state-in-effect` is an error: set state in callbacks/promise handlers, or adjust state during render. Escape `'` in JSX text (use `’`). Hook-like names (`useX`) on returned objects trip rules-of-hooks.
- `useSyncExternalStore` stores keep map markers cheap (one subscription per member). Markers use `tracksViewChanges={false}` after first render.
- Match the existing comment style: a short doc comment saying *why*, not narration.

## Gotchas

- **"Unable to resolve <module>" on `expo start`:** run `npm install` (someone added a dependency), then `npx expo start -c`.
- `npm install` may rewrite `package-lock.json`. Don't commit that unless dependencies actually changed.
- `.eslintrc.cjs` is a leftover from the old monorepo scaffold and causes the "legacy ESLint config" warning; `eslint.config.js` is the real config.
- On Windows, git warns "LF will be replaced by CRLF". That's harmless.
- Supabase `channel(topic)` returns the same object for a repeated topic, and calling `.on()` on a subscribed channel throws. Give per-instance channel names (see `src/features/jams/realtimeTable.ts`).
- Expo Go only: no custom native modules, no background location (tracking is foreground-only by design).
- Downloaded datasets go in a temp/cache dir outside the repo, never in `src/`.

## Docs

`README.md` (setup, ownership, team rules) · `docs/architecture.md` (every flow) · `docs/data-model.md` (tables, RPCs, RLS) · `docs/environment.md` (Supabase, sign-in, env, phones, EAS) · `docs/demo.md` + `DEMO_CHECKLIST.md` (the 3–4 phone demo) · `docs/prompts/` (each owner's brief) · `src/features/*/README.md` (per-area APIs, e.g. `getRouteRecommendation`, `getSpokenGuidance`, `dispatchAlertEvent`).

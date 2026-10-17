# CLAUDE.md

## What Jam is

Jam is a native mobile app (**Expo SDK 57 + Expo Router**, run in **Expo Go**) for students, tourists, and friends travelling together. A group creates or joins a private **Jam**, shares live location while it's active, and sets a destination. If someone may need support, Jam responds calmly and in steps: it checks in with them, then tells the group, then calls them, and only then reaches their trusted contacts.

The core promise is **consent-first, calm support**. Nothing is shared, recorded, or sent to a contact without that person's consent. Jam never diagnoses, never labels places as safe or unsafe, and never pretends to be emergency services. The backend is Supabase (Auth, Postgres + RLS, Realtime Broadcast, Storage, Edge Functions on Deno). The demo scenario is the **Campus Walk** (UofT Bahen Centre → St. George Station). It's a 36-hour hackathon build by five people (P1–P5), so keep changes small and mergeable.

The product is built around three core features. Everything else (onboarding, Jams, the map) supports them.

| Feature | One line | Owner |
|---|---|---|
| **Lifeline** | Automatic AI support call that talks the person toward their destination | P4 (+ P5 for Twilio) |
| **Safety Circle** | Check-ins, group alerts, escalation, trusted contacts, incident packages | P4 (engine) + P5 (alerts, contacts) |
| **Pulse** | Simulated wearable + explainable risk scoring that decides when to check in | P4 |

---

## Lifeline: automatic AI support

**Purpose:** when a member may need support and their group hasn't answered, Jam calls them by itself. The call keeps them company, tells them how to get to their destination or the nearest public place, and listens for any sign they're okay. If they stay silent, it brings in their trusted contacts.

**Use cases**
- *Unresponsive after a group alert:* Alex's heart rate spiked and he drifted 400 m off route. He didn't answer the check-in and nobody in the group acknowledged, so Jam rings his phone.
- *Lost:* the person answers "I'm lost" or "where am I?". Lifeline gives the next walking direction ("Head east for about 400 metres to Robarts Library") and names nearby public places.
- *Twilio phone call vs. in-app call:* with Twilio configured and a phone number on their profile, Jam places a **real phone call**. Otherwise (no number, Twilio unset, or the call fails) the person's app runs the **in-app spoken call**, with the same script and guidance read aloud and shown on screen.
- *Contact-only preference:* people who chose `contact_only_alert`, or didn't give `ai_call_consent`, never get the call. The escalation goes straight to their contacts.

**How it works**
1. The escalation reaches `AI_CALL_STARTING` (see Safety Circle). The phone or server that made that move calls `startAiPhoneCall` (app: `src/lib/supabase/functions.ts` → `ai-phone-call`; server: `advance-alert`). It is **idempotent: one call per alert**. It always rings the *affected* person's own `profiles.phone_number`.
2. **Phone mode** (`supabase/functions/ai-call-webhook`, logic in `_shared/aiPhoneCall.ts`). Twilio fetches each turn. The webhook:
   - hears the person (speech-to-text or keypad) and re-reads their latest `live_locations` row;
   - gets real walking directions (OSRM) and nearby public places (OpenStreetMap), then asks Gemini what to say;
   - speaks with the `Polly.Joanna-Neural` voice and listens `LISTEN_S` = 5 s per turn.

   How the call ends:
   - Any speech or keypress counts as a response → `AI_CALL_USER_RESPONDED`.
   - **Two silent turns (~10 s)**, no answer, or hanging up before responding → `AI_CALL_USER_UNRESPONSIVE` → `CONTACTS_NOTIFIED`.
   - "I need help" alerts the contacts **while staying on the line**. "I arrived", "I'm fine", and goodbye end the call.

   Limits and security: there's a hard cap of `MAX_TURNS` = 40. Every webhook request carries a per-alert HMAC `sig` (`AI_CALL_SIGNING_SECRET`; the function is deployed with `verify_jwt = false`).
3. **In-app mode** (`src/features/ai/SupportCallScreen.tsx`, route `/jam/[jamId]/support-call`):
   - Each turn comes from `aiService.getSupportCallTurn(context, step)` → the `ai-support-call` Edge Function, which uses Gemini (`GEMINI_MODEL`) with a 4 s timeout and a rate limit of 8 calls/min/user. It **always** returns a turn and falls back to the scripted line (`supportCallLine.ts`) on any failure.
   - Each turn is spoken with `expo-speech` and shown in large text. The person taps "I can hear you" to respond.
   - It checks in every `AI_CALL_CHECKIN_INTERVAL_MS` (5 s). After `AI_CALL_SILENCE_TIMEOUT_MS` (10 s) of silence, the contacts are called.
4. **What the AI may know** is limited to `AiCallContext` (`src/features/ai/callContext.ts`): display name, a location *summary*, deviation level, a heart-rate summary, activity, nearest support point, whether the group responded, destination name, and the next spoken direction from P3's `getSpokenGuidance` (`src/features/map/guidance.ts`). It **never** gets raw coordinates or location history.
5. **Recording**, only with `recording_consent`: `src/features/ai/useCallRecording.ts` (`expo-audio`) uploads to the private `recordings` bucket at `{userId}/{alertId}.m4a`. It's always visible with a timer and a stop control. If permission is denied it records nothing (a `simulated://` reference is used instead).

**Invariants:** it never claims to be emergency services or medical. It never says a place is safe. It always has a turn to say (scripted fallback). The final line is always the scripted "I have not received a response. Your authorized contacts may be notified…". It never logs phone numbers or what the person said.

**Key files:** `src/features/ai/*`, `src/services/ai/`, `src/lib/ai/supportCallLine.ts`, `supabase/functions/{ai-phone-call,ai-call-webhook,ai-support-call}/`, `supabase/functions/_shared/{aiPhoneCall,supportCallLine,twilio}.ts`, `src/features/map/guidance.ts`.

---

## Safety Circle: check-ins, group alerts, trusted contacts

**Purpose:** a fair, step-by-step escalation that gives the person, then their group, then their contacts a chance to respond. Each step uses the least intrusive option first. It keeps running even if every phone is closed.

**Use cases**
- *Drifting or a health change:* Pulse's score reaches the check-in threshold, and the affected person sees **"Are you okay?"** (`CheckInOverlay.tsx`, with haptics). The options are *I'm okay*, *I changed my destination*, *I'm lost*, *I need help*, and *I cannot respond*. "I'm okay" and "I changed my destination" end it; any other answer alerts the group straight away.
- *Manual check-in:* anyone taps **Check in with group** on the Group tab, which broadcasts `checkin_requested` with reason `group_manual`.
- *No answer:* every other member gets an in-app card, **"Alex may need support."**, with reasons, last known location, and buttons: *I'm going to help*, *Open map*, *Join call*, *View incident*, *Mark safe*. The Jam's ntfy topic gets a fixed push message.
- *Nobody acknowledges:* Lifeline calls the person. If they stay silent, their **trusted contacts are phoned and texted** and an **incident package** is created.
- *Every phone closed:* deadlines live in the database, and the `advance-alert` Edge Function plus `escalateToContacts` finish the job on the server.
- *Contact-only preference:* the AI call is skipped and the escalation goes group → contacts.
- *False alarm:* "I'm safe" / "Cancel escalation" resolves it everywhere. "Call emergency services" is a **placeholder** that shows a confirmation and never dials.

**The state machine** (pure `transition()` in `src/features/health/escalation.ts`, copied verbatim to `supabase/functions/_shared/escalation.ts`):

```
MONITORING → CHECK_IN_SENT ──check-in timeout──► GROUP_ALERT_SENT ──group timeout──► AI_CALL_STARTING → AI_CALL_ACTIVE ──10s silence──► AI_CALL_USER_UNRESPONSIVE → CONTACTS_NOTIFIED
                 ↓ "I'm okay"                         ↓ a member acknowledges    (contact_only_alert / no ai_call_consent skips the AI call)  ↓ answers
            USER_RESPONDED                  GROUP_MEMBER_ACKNOWLEDGED                                                          AI_CALL_USER_RESPONDED
                                                                       any state → RESOLVED / CANCELLED (sets resolved_at)
```

**Timers**
- **Check-in timeout:** the Jam's `checkin_delay_seconds`.
- **Group timeout:** the Jam's `group_response_timeout_seconds`.
- **AI call silence:** `AI_CALL_SILENCE_TIMEOUT_MS` = 10 s.
- **Demo Mode check-in:** `DEMO_CHECKIN_TIMEOUT_MS` = 12 s.
- **Known gap:** people also pick a personal `profiles.checkin_buffer_seconds` (30–1800 s, default 120) at sign-up and in Settings, and the docs say it drives the check-in timeout. The escalation code doesn't read it yet; it uses the Jam's `checkin_delay_seconds`.

**What runs where**
- **On the affected phone:** `useSafetyEngine` (mounted by `CheckInOverlay` on every Jam tab) scores risk and opens the alert with `createCheckInAlert`. Only **one open alert per member per Jam** is allowed; a duplicate insert returns `23505`, which counts as a no-op.
- **Changing an alert:** every change goes through `alertActions.ts` (`dispatchAlertEvent`, compare-and-set on `escalation_state`). The phone that wins broadcasts `alert_updated` and runs that step's side effects (`notifyGroup`, `startAiPhoneCall`, `notifyContacts`). P5 acknowledges with `dispatchAlertEvent(alert, { type: "GROUP_ACK" })`.
- **Timers:** any member's phone calls `advance-alert` when `alerts.next_deadline_at` passes. It's idempotent: it only advances when the deadline is due, and only once.
- **Group alert cards:** `src/features/alerts/AlertOverlay.tsx`. Statuses go New → Seen → Acknowledged → Responding → Resolved, backed by `alert_responses` (unique per user/kind). The cards re-read open alerts on load, so a reloaded app recovers. Broadcasts carry ids and states only (`reasons: []`); reasons are re-read through RLS.
- **ntfy** (`notify-ntfy`): only the fixed `NTFY_MESSAGE` ("A Jam member may need support…") goes to the Jam's random `ntfy_topic`. Every attempt is logged in `notification_events`, and the in-app alert is the fallback.

**Trusted contacts** (`src/features/contacts/`, route `/contacts`)
- **Fields:** name, relationship, phone (E.164), optional email, `confirmation_status` (pending / confirmed / declined), and three toggles, **all off by default**: `receive_location`, `receive_health_summary`, `receive_recording`.
- **Privacy:** phone numbers are visible only to the owner (enforced by RLS).
- **Test call:** **Test call** (`test-call`) rings your own contact with a short message that mentions no alert, location, or health data.

**The last step, `CONTACTS_NOTIFIED`** (`call-contacts`, or `escalateToContacts` in `_shared/contactEscalation.ts` when the server makes the move). It needs the person's `contact_notify_consent`, and skips contacts who `declined` or have no valid number. Per contact:
- **Phone call:** the spoken message includes the place name only if `receive_location` and the reasons only if `receive_health_summary`.
- **Text:** a Google Maps link only if `receive_location`, reasons only if `receive_health_summary`, and a 24-hour signed recording link only if `receive_recording` *and* recording consent.
- **Group:** gets an ntfy ping (fixed text).

It's idempotent: a contact already called or texted for an alert is skipped. Phone numbers are never logged.

**Incident packages:** one per alert, holding the last-seen location and place name, health summary, reasons, route/destination, recording path, and recipients (active members plus consented contacts). Retention is `DEFAULT_INCIDENT_RETENTION_HOURS` = 24.
- **Members** read it in-app through RLS.
- **Contacts** use the `/incident/[token]` screen via `incident-access`: by token (only its SHA-256 is stored) or by their sign-in email, and they see only the fields their toggles allow.
- **Deleting** uses `rpc("delete_incident_package", { p_id })`, which returns the recording path to remove from Storage.

**Key files:** `src/features/health/{escalation,alertActions,alertRepository,useSafetyEngine,CheckInOverlay,SafetyControls}.ts(x)`, `src/features/alerts/*`, `src/features/contacts/*`, `src/features/ai/incidents.ts`, `src/services/{notification,incident}/`, `supabase/functions/{advance-alert,notify-ntfy,call-contacts,test-call,incident-access,incident-token,demo-reset}/`.

---

## Pulse: health signals and risk

**Purpose:** decide *when* Jam should check in, from a combination of signals, with reasons a person can read. Pulse is a **simulated wearable** plus a **deterministic, explainable points system**. It flags a *possible* need for support. It is **not machine learning**, and it never diagnoses illness, intoxication, assault, or danger. The UI always says "Simulated wearable data."

**Use cases**
- *Heart-rate spike:* 145 BPM against a 75 BPM baseline → "Heart rate is 93% above personal baseline."
- *Unexpected running* or a *sudden stop after rapid movement*, for example someone ran and then stopped.
- *Simulated fall*, or *no response* to a check-in.
- *Combined with the map:* being more than 200 m off the planned route adds a point (P3's `RouteStatus`).

**Baseline:** the onboarding screen runs `healthService.measureBaseline()`, which returns a random resting value in `BASELINE_RANGE` (65–90 BPM). The demo uses `campusWalk.health.baselineHeartRate` = 75.

**Simulated scenarios** (`SCENARIO_SHAPE` in `src/services/health/simulated.ts`; a signal is emitted every `HEALTH_STREAM_INTERVAL_MS` = 3 s):

| Scenario | HR above baseline | Activity | Movement |
|---|---|---|---|
| `normal_walking` | +8% | walking | normal |
| `heart_rate_spike` | +93% | walking | normal |
| `unexpected_running` | +93% | running | rapid |
| `sudden_stop` | +72% | stationary | stopped |
| `fall_simulated` | +60% | fall_simulated | stopped |
| `no_response` | +50% | stationary | stopped |
| `safe_again` | +4% | walking | normal |

**Scoring** (`RISK_POINTS` in `src/services/risk/engine.ts`; points add up):

| Signal | Points |
|---|---|
| HR ≥ 40% above baseline | +2 |
| HR ≥ 70% above baseline | +1 more (+3 total) |
| Unexpected running (or rapid movement) | +2 |
| Route deviation > 200 m | +1 |
| Sudden stop after rapid movement (60 s look-back) | +2 |
| Simulated fall | +3 |
| No response to the check-in | +3 |
| Separated from the group | +1 (**not wired yet**: `useSafetyEngine` passes `separatedFromGroup: false`) |

**Thresholds** (`RISK_THRESHOLDS`): 0–2 monitor (low), **3** check-in, **5** group alert, **7+** escalate (high). Worked example, asserted in tests: 145 vs 75 BPM (+3) + running (+2) + deviation (+1) = **6** (group-alert range). The unanswered check-in (+3) makes it **9**, which escalates. After an alert closes, a new one isn't opened for 60 s unless the score rises.

**Consent:** health signals are streamed, broadcast (`health_update`), stored (`health_signals`, at most every 10 s), and scored **only with `health_consent`**. RLS also rejects inserts without it.

**Demo:** presenter actions (`useHealthDemoActions.ts`, owner `"health"`) broadcast a scenario for the affected user. The affected phone adopts it, so its own engine scores it and runs the check-in and the call.

**Key files:** `src/services/health/simulated.ts`, `src/services/risk/engine.ts`, `src/features/health/{useSafetyEngine,safetyStore,useHealthDemoActions}.ts`, `src/features/jams/SignalsScreen.tsx`, `src/features/auth/BaselineScreen.tsx`.

---

## Supporting systems (brief)

- **Onboarding and Jams (P2):** welcome / email-code / demo-account sign-in → profile → consent (all five consents off by default, emergency preference actively chosen) → baseline. Then create a Jam (the Campus Walk preset), join by code or QR (`join_jam`; running Jams can still be joined, ended ones can't), lobby, and the active-Jam tabs **Map / Group / Signals / Settings**. Group and the lobby show the invite card (code, QR, Share). See `src/features/{auth,jams}/`.
- **Map, live location, Toronto data (P3):** `JamMapScreen` shows members live over `jam:{jamId}`, routes (OSRM with a demo-route fallback), route deviation (100 / 200 / 350 m), Toronto Open Data support points, `getRouteRecommendation()`, and `getSpokenGuidance()` for Lifeline. `useLocationSharing` broadcasts every ~4 s and upserts `live_locations` at most every 10 s or after a 10 m move. Presence goes stale at 30 s and offline at 60 s, and staleness never means danger. See `src/features/{map,location}/README.md`.
- **Demo Mode:** `/demo-control` is the **only** demo panel (P5). Actions register in `src/features/demo/demoActions.ts` and read `getDemoContext()` (`{ jamId, affectedUserId }`) at run time. They run on the tapping phone, so they must **broadcast** to affect other phones. **Reset demo** (`demo-reset`, host only) clears one Jam's alerts, incidents, notifications, health signals, and live locations.

## Design system (use this for every new screen)

Jam should feel **safe, confident, sophisticated, approachable**: Apple Find My / Apple Health / Linear, not a hospital dashboard, a dispatch console, or a soft wellness app. Tokens live in `src/theme/index.ts`; components in `src/components/ui/` (import from `@/components/ui`). Never hardcode a hex in a screen; add a token instead.

**Palette** (~70% neutrals, ~20% burgundy, ~10% pastels/status):

| Token | Value | Use |
|---|---|---|
| `colors.brand` (legacy `navy`) | `#7D1725` burgundy | primary buttons, selected states, graphs, wordmark. **Brand, not alarm** |
| `colors.brandDark` | `#4A1018` | strong surfaces, text on pastel buttons |
| `colors.warmWhite` | `#F8F4F1` ivory | screen background |
| `colors.surface` | `#FFFFFF` | cards |
| `colors.blush` (legacy `sky`) / `blushSoft` | `#F1D8D9` / `#F8ECEC` | secondary buttons, avatars, soft cards |
| `colors.lavender` / `sage` | `#E3E0ED` / `#DCE8E2` | supporting info cards (reasons, activity) / ok states |
| `colors.ink` / `inkMuted` / `inkFaint` | `#25272C` / `#77747A` / `#ABA6AB` | text |
| `colors.amber` / `amberSoft` / `amberInk` | `#D99A36` … | attention, check-in range, recording dot |
| `colors.escalation` / `escalationSoft` | `#DC4545` | **only** confirmed escalation (contacts notified), "I need help", irreversible deletes |
| `colors.call*` | `callBg #4A1018`, `callSurface`, `callAccent`, `callInk` | the AI support call (dark) screen only |

`tones` gives bg/fg pairs (`neutral`, `brand`, `lavender`, `sage`, `ok`, `amber`, `escalation`) for `Badge`, `Card tone`, `IconBadge`.

**Shape and type:** `radius.md` 14 (buttons), `radius.card` 16, `radius.lg` 18 (hero cards, sheets), `radius.pill`. Cards: white, hairline `colors.border`, `shadow.card`; `shadow.raised` for overlays and hero cards. Spacing `space(n)` = 4n, screen padding `space(5)`. Type: `type.title` 24, `heading` 17, `body` 16, `caption` 13, `overline` (12 uppercase section labels), `metric` (40, tabular numbers for BPM and timers). Headings are charcoal; burgundy is for brand and actions.

**Icons:** `lucide-react-native` only (works in Expo Go), stroke 1.75–2.25. Use `<Icon icon={X} />` or `<IconBadge icon={X} tone="sage" />`. Icons are decorative; the text label carries meaning. Note that `Map` must be imported as `Map as MapIcon`.

**Components:**
- `Button`: `variant` primary (one per view) / secondary (blush) / outline / ghost / destructive; also `icon`, `size="lg"`, and `tint` (text colour on dark surfaces).
- `Card`: `tone` makes a flat pastel card; `padded={false}` for lists.
- `Badge` (`tone`, `icon`), `Avatar` (`ring`), `SectionHeader`, `ListRow` (icon + label + chevron, stacked inside `Card padded={false}`), `StatusDot`.
- `Sparkline` (line chart with a dashed `reference`), `Chip`, `OptionCard`, `Toggle`, `TextField`, and the `Loading`/`Empty`/`ErrorState` states.
- Domain: `EscalationTimeline` (`src/features/health/`, view model in `escalationStages.ts`), `SafetyControls` (`dark` for the call screen).

**Patterns:**
- Screen = `<Screen scroll>` → title row → white hero card → `SectionHeader` + cards. Pastel cards are for secondary info.
- Bottom sheets: ivory, `radius.lg + 6` top corners, a grab handle, `colors.overlay` backdrop, large 54pt options.
- Alerts: a white card with a 4px left accent (amber; red only once escalated), an `IconBadge`, a step bar, and burgundy primary action. Never fill the screen with red.
- Safety actions: "I'm safe" is primary burgundy. "Cancel escalation" confirms first. "Call emergency services" is a red-text ghost button whose placeholder dialog never dials.
- Motion: restrained `Animated` (springs, soft pulses, `useNativeDriver`) and a light haptic on primary taps (built into `Button`).
- Simulated health data always shows a "Simulated wearable data" badge and never reads as a diagnosis.

## Commands

```bash
npm install                 # re-run after EVERY pull/merge: branches add packages
npm start                   # Expo dev server; scan the QR in Expo Go (SDK 57). -c clears the Metro cache
npm run start:tunnel        # when the phone can't reach the laptop on Wi-Fi
npm run check               # typecheck + lint + vitest. Must pass before any commit/PR
npm run doctor              # expo-doctor
npx vitest run path/to/file.test.ts                            # one test file
npx expo export --platform ios --platform android --output-dir <tmp>   # proves the bundle resolves
npx -y deno test --allow-env supabase/functions/_shared/      # Edge Function tests (NOT in npm run check)
npx -y deno check supabase/functions/*/index.ts               # typecheck every Edge Function
npm run publish:demo        # EAS Update to the "demo" branch (needs the Expo project owner's account)
```

Install native modules only with `npx expo install <pkg>`, and only modules that ship in Expo Go.

**Live smoke tests** against the shared Supabase project: use the seeded demo accounts (`host@`, `member@`, `affected@`, `contact@jam.demo`, password `jam-demo-1234`, see `supabase/seed.sql`) in a **throwaway Jam**, never the seeded Campus Walk Jam, and clean up with `demo-reset`. **Never** call `ai-phone-call`, `call-contacts`, or `test-call`, and never let an alert advance past `GROUP_ALERT_SENT`: those steps ring and text real phones through Twilio.

## Layout

```
src/app/                 Expo Router routes. Keep them THIN: they render a screen from src/features
  (auth)/                welcome, profile, consent, baseline
  jam/[jamId]/(tabs)/    map, group, signals, settings (+ JamOverlayHost, keep-awake in _layout)
  jam/[jamId]/lobby, support-call · incident/[token] · incidents · contacts · notifications · demo-control · data-sources · dev
src/features/<area>/     screens + logic per owner; each has a README.md with the details
  auth, jams (P2) · map, location (P3) · health, ai (P4) · alerts, contacts (P5) · demo (shared registry)
src/components/          JamMapView, JamOverlayHost (P4/P5 overlays), ui/ (Button, Card, Badge, Screen, States…)
src/lib/types/           SHARED CONTRACTS: domain.ts, events.ts (realtime payloads), database.ts (rows), services.ts
src/lib/constants/       thresholds, timings, scripts, ntfy copy
src/lib/validation/      Zod schemas; inbound realtime payloads are validated and malformed ones dropped
src/lib/supabase/        client (singleton, null when unconfigured), auth helpers, Edge Function wrappers
src/lib/ai/              the scripted support-call line (mirrored in supabase/functions/_shared)
src/lib/demo/            campus-walk.json + typed `campusWalk` (seed ids, routes, members)
src/services/<name>/     interface → index.ts picks real vs mock (see "Services")
src/theme/               design tokens (P2 owns values; names are stable)
supabase/migrations/     schema + RLS + RPCs   · supabase/seed.sql: demo accounts + Campus Walk
supabase/functions/      Edge Functions + _shared/ (Deno; can't import from src/)
```

## Architecture essentials

- **Realtime:** one Broadcast channel per Jam, `jam:{jamId}`. Use `const ch = useJamChannel(jamId); useJamEvent(ch, "location_update", fn)`. Events: `location_update`, `member_status`, `health_update`, `alert_created`, `alert_updated`, `checkin_requested`, `ai_call_state`, `incident_created`. Delivery includes your own messages (`self: true`), so filter by `userId`. Channels are public-but-unguessable, so broadcasts carry **ids and states only**: no phone numbers, health history, recordings, or alert reasons.
- **`postgres_changes` covers only `jams`, `jam_members`, `alerts`, `alert_responses`** (the `supabase_realtime` publication). `live_locations` and `health_signals` are NOT published. Use the broadcasts plus a periodic re-read (see `src/features/jams/useLiveLocations.ts`).
- **Timers survive closed phones:** there's no server scheduler. Deadlines live in `alerts.next_deadline_at`, and any member's open app calls `advance-alert` when one passes.
- **Civic data:** Toronto Open Data + OSM, preprocessed into `src/features/map/data/*.json` and imported statically. To regenerate, run `node src/features/map/data/extract/extract-toronto.mjs <cache-dir-outside-repo>`, then `server-support-points.mjs` (writes `supabase/functions/_shared/support-points.json`, used by the Lifeline phone call).

## Services

`@/services` exports one instance per service. `mockServicesEnabled` (Supabase unconfigured, or `EXPO_PUBLIC_USE_MOCK_SERVICES=true`) switches realtime to an in-memory loopback (single device only), and also switches incident, notification and AI to their mocks. Always real: location (`expo-location`; the mock is the per-user *simulated* source for Demo Mode), routing (OSRM with the Campus Walk fallback), risk (the pure engine), health (the simulated wearable). Services never throw for expected failures; they fall back (scripted AI line, demo route, in-app alert).

## Rules

- **Contracts are frozen:** `src/lib/types`, migrations, event payloads, and service interfaces. Adding optional fields or new types is fine. Renames, removals, and schema changes need a small team-tagged PR. A schema change means a new migration **and** updating `src/lib/types/database.ts`.
- **Ownership:** edit only your area (table in README.md). Cross-owner screens are mounted stubs: replace the body and keep the export and props.
- **Secrets:** the app only sees `EXPO_PUBLIC_*` (public, bundled). Gemini, ntfy, Twilio, the service role, and `AI_CALL_SIGNING_SECRET` live in Edge Function secrets (`supabase/functions/.env.example`). Edge Functions verify the caller (`requireUser`) and check access with the user client before using `adminClient()`.
- **App ↔ Edge Function copies must stay identical:**
  - The escalation block between `BEGIN/END SHARED` in `src/features/health/escalation.ts` and `_shared/escalation.ts`. `escalation.test.ts` fails on drift.
  - `src/lib/constants` ↔ `_shared/constants.ts` (no automated check).
  - `src/lib/ai/supportCallLine.ts` ↔ `_shared/supportCallLine.ts` (no automated check).
- **Tone and privacy:** calm copy. Never say "safe"/"unsafe"/"danger" about places or people, never diagnose, and use red (`colors.escalation`) only for confirmed escalation. All consents default to off, and the emergency preference must be actively chosen. Nothing records, notifies contacts, or shares location without its consent.
- **Accessibility:** `accessibilityRole`/`accessibilityLabel` on controls, touch targets of at least `TAP_TARGET` (48), never `allowFontScaling={false}` (use `maxFontSizeMultiplier`).

## Code conventions

- TypeScript strict with `noUncheckedIndexedAccess`; import via `@/…`. Use theme tokens (`colors`, `space()`, `radius`, `type`), never ad-hoc colours.
- **Unit tests are pure TS:** `src/**/*.test.ts` run in Node, with **no `react-native` imports** in anything they load (`@/lib/supabase/client` pulls in RN). Put logic in pure modules (e.g. `escalation.ts`, `engine.ts`, `liveLocationMerge.ts`, `recommendation.ts`) and keep hooks thin.
- The lint config is eslint-config-expo with the React Compiler rules. `react-hooks/set-state-in-effect` is an error: set state in callbacks/promise handlers, or adjust state during render. Escape `'` in JSX text (use `’`). Hook-like names (`useX`) on returned objects trip rules-of-hooks.
- Match the existing comment style: a short doc comment saying *why*, not narration.

## Gotchas

- **"Unable to resolve <module>" on `expo start`:** run `npm install` (someone added a dependency), then `npx expo start -c`.
- `npm install` may rewrite `package-lock.json`. Don't commit that unless dependencies actually changed.
- `.eslintrc.cjs` is a leftover from the old monorepo scaffold and causes the "legacy ESLint config" warning; `eslint.config.js` is the real config.
- On Windows, git warns "LF will be replaced by CRLF". That's harmless, but scripted find-and-replace must handle CRLF files.
- iOS labels the back button with the **previous screen's `title`**, so header-less screens still need one (see `src/app/_layout.tsx`).
- Supabase `channel(topic)` returns the same object for a repeated topic, and calling `.on()` on a subscribed channel throws. Give per-instance channel names (see `src/features/jams/realtimeTable.ts`).
- Expo Go only: no custom native modules, no background location (tracking is foreground-only by design).
- Downloaded datasets go in a temp/cache dir outside the repo, never in `src/`.

## Docs

`README.md` (setup, ownership, team rules) · `docs/architecture.md` (every flow) · `docs/data-model.md` (tables, RPCs, RLS) · `docs/environment.md` (Supabase, sign-in, env, phones, EAS) · `docs/demo.md` + `DEMO_CHECKLIST.md` (the 3–4 phone demo) · `docs/prompts/` (each owner's brief) · `src/features/*/README.md` and `supabase/functions/README.md` (per-area APIs).

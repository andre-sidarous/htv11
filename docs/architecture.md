# Architecture

Jam is a **native mobile app built with Expo** (React Native + Expo Router). During the hackathon, every phone runs it inside **Expo Go**. Supabase provides auth, Postgres, Realtime, and Storage. Supabase **Edge Functions** handle everything that needs a secret. Location is tracked in the foreground only, while a Jam is active.

```
Phone (Expo Go)                                         Supabase
 ├─ src/app/*        Expo Router screens                 ├─ Auth (email code, demo accounts, Google)
 ├─ src/features/*   feature logic per owner             ├─ Postgres + RLS      (supabase/migrations)
 ├─ src/services/*   interfaces → mock | real            ├─ Realtime Broadcast  jam:{jamId}
 │    realtimeService ── Supabase Broadcast ────────────►├─ Storage: recordings (private)
 │                   └─ in-memory loopback (mock)        └─ Edge Functions      (supabase/functions)
 ├─ lib/supabase/client   anon key, RLS applies               advance-alert    escalation tick
 ├─ lib/supabase/functions → supabase.functions.invoke ─────► ai-support-call  Gemini + scripted fallback
 └─ expo-location · react-native-maps · expo-speech           notify-ntfy      ntfy publish
    expo-audio · expo-camera · expo-haptics                   (secrets: GEMINI_API_KEY, NTFY_TOKEN, service role)
```

## App (Expo)

- **Routes** live in `src/app` (Expo Router: file = screen, `_layout.tsx` = navigator, `(tabs)` = tab bar). Screens import logic from `src/features/<area>`, owned per [the ownership table](../README.md#ownership).
- **Shared contracts:** `src/lib/types` is the **only** place shared types are defined. Import from `@/lib/types` and never redefine them.
- **Services:** `src/services/<name>/index.ts` exports one instance per service. Each starts as a mock. Owners swap in the real implementation in their own folder, which avoids merge conflicts.
- **Mocks** are used automatically when the Supabase env vars are blank, or when `EXPO_PUBLIC_USE_MOCK_SERVICES=true`. The app always boots. Mock realtime is in-memory, so it only works on one device. Cross-phone demos need Supabase.
- **Map:** `JamMapView` (`src/components/map`) wraps react-native-maps. iOS uses Apple Maps and Android uses Google Maps, and both work in Expo Go with no key. Add `Marker`, `Polyline`, and `Circle` from `react-native-maps` as children.
- **Design tokens:** `src/theme` holds `colors.navy`, `colors.amber`, `colors.escalation`, `space(n)`, `radius.card`, `type.title`, `TAP_TARGET`. P2 owns the values. Use `escalation` red only for confirmed escalation.
- **Env:** only `EXPO_PUBLIC_*` vars reach the app (`src/lib/env.ts`), and they're all public. **No secrets in the app.**

## Supabase

- **App client** (`getSupabaseClient`): anon key, session stored in AsyncStorage, PKCE auth flow. RLS applies to every query.
- **Edge Functions** (`supabase/functions`, Deno): the replacement for web "server routes". The app calls them through `src/lib/supabase/functions.ts`, which sends the user's JWT automatically. Each function checks the caller with `requireUser()`, checks access with the **user** client (RLS), and only then uses `adminClient()` (service role, injected by Supabase).
- Function secrets are set with `npx supabase secrets set`. They never live in the app or in git.

## Realtime

- One channel per Jam: **`jam:{jamId}`**, using Supabase **Broadcast**.
- Events and payload types are in `src/lib/types/events.ts`: `location_update`, `member_status`, `health_update`, `alert_created`, `alert_updated`, `checkin_requested`, `ai_call_state`, `incident_created`.
- Use `useJamChannel(jamId)` and `useJamEvent(channel, "event", handler)` from `@/hooks/useJamChannel`.
- Inbound payloads are validated with Zod (`lib/validation/events.ts`). Malformed messages are dropped, not thrown.
- Delivery includes your own messages (`self: true`). Filter by `userId` if you need to.
- **Known POC limitation:** channels are public but unguessable (the `jamId` is a UUID). So broadcasts must **never** carry phone numbers, health history, or recordings. Send ids and re-read details through RLS-protected tables. Upgrade path: private channels with RLS on `realtime.messages`.
- `jams`, `jam_members`, `alerts`, and `alert_responses` are also in the `supabase_realtime` publication, so `postgres_changes` (filtered by RLS) works for the lobby and alert lists.

## Location flow (P3)

1. The member grants location consent (`jam_members.location_consent`). The Jam must be `active`. Then ask the OS: `Location.requestForegroundPermissionsAsync()`.
2. `locationService.watch()` uses `Location.watchPositionAsync` (balanced accuracy, `timeInterval` 4000, `distanceInterval` 5), or the simulated path in Demo Mode.
3. Every 3 to 5s it **broadcasts** a `LocationUpdate` on `jam:{jamId}`.
4. It **upserts** `live_locations` at most every 10s, or after a move of 10m or more (`LOCATION_DB_UPSERT_INTERVAL_MS`, `LOCATION_SIGNIFICANT_CHANGE_M`).
5. Presence: no update for 30s means `stale`, and 60s means `offline`. Staleness alone never means danger.
6. Route deviation is <100m on route, 100 to 200m slightly off, >200m deviation, >350m significant. It is emitted as `RouteStatus` in `member_status`.
7. Stop the subscription when sharing is paused, the Jam ends, or the app backgrounds (foreground-only). RLS also rejects writes when consent is off or the Jam isn't active.

## Health flow (P4)

The simulated wearable comes from `healthService.stream()` and emits a `HealthSignal`. It is broadcast as `health_update` and optionally stored in `health_signals` (requires health consent). The UI always shows "Simulated wearable data."

## Alert flow and escalation timing (P4 builds, P5 displays)

```
MONITORING → CHECK_IN_SENT → GROUP_ALERT_SENT → AI_CALL_STARTING → AI_CALL_ACTIVE → CONTACTS_NOTIFIED
                 ↓ answered        ↓ acknowledged         (contact_only_alert skips the AI call)
            USER_RESPONDED   GROUP_MEMBER_ACKNOWLEDGED              any state → RESOLVED / CANCELLED
```

- `riskService.evaluate()` is pure. When the score reaches a threshold, the app inserts an `alerts` row. The partial unique index allows **one open alert per member per Jam**, so a duplicate insert fails with `23505`. Treat that as a no-op.
- `alerts.next_deadline_at` drives timeouts. When a deadline passes, **any** member's app calls `advanceAlert(alertId)`, which runs the `advance-alert` Edge Function. It is idempotent (compare-and-set on `escalation_state`), so escalation continues even if the affected phone closes.
- Setting `RESOLVED` or `CANCELLED` must also set `resolved_at`. A check constraint enforces this.
- Group responses go in `alert_responses`. The UI shows New → Seen → Acknowledged → Responding → Resolved.
- Respect `emergency_preference` and each consent. Never record or notify contacts without consent.

## ntfy flow (P5)

- Each Jam gets a random `ntfy_topic` at creation (a DB default). Members can subscribe to it in the free ntfy app.
- `notifyNtfy(jamId, alertId)` runs the `notify-ntfy` Edge Function. It checks membership, then publishes **only** the fixed `NTFY_MESSAGE`: no health data, location, phone numbers, or recordings.
- Each attempt is logged to `notification_events`, which only the server writes. If ntfy fails, fall back to in-app alerts and show that status.

## AI flow (P4)

- `aiService.getSupportCallTurn(context, step)` runs the `ai-support-call` Edge Function. Context is limited to: display name, location *summary*, deviation level, heart-rate summary, activity, nearest support point, and whether the group responded. **Never** location history.
- The function calls Gemini with a short timeout and **always** returns a turn, falling back to `SUPPORT_CALL_SCRIPT`. The client falls back too.
- Speak the turn with `expo-speech` (`Speech.speak(text)`). Native apps don't need a gesture to unlock audio. Always show the text on screen as well.
- Recording only happens if `recording_consent` is true. Use `expo-audio`. Upload to the private `recordings` bucket under `{userId}/...`. Recipients get signed URLs from an Edge Function.

## Incident packages (P4 creates, P5 shows)

- `incident_packages.recipients` is a jsonb array of `{type:"member",userId}` and `{type:"contact",contactId}`. Listed members and the affected user can read a package through RLS.
- External contacts get a token. An `incident-access` Edge Function (P5) compares `sha256(token)` with `access_token_hash`, checks `expires_at`, and returns only what that contact may see. The raw token is never stored. Show it in the app's `incident/[token]` screen (Presenter 4 runs the app too).
- To delete, call `rpc("delete_incident_package", { p_id })`. It wipes the payload, sets `deleted_at`, and returns the recording path to remove from Storage.

## Demo actions

`src/features/demo/demoActions.ts` is the single registry. P3 and P4 call `demoActions.register({...})` with ids from `DEMO_ACTION_IDS`, usually inside a `useEffect` that returns the unregister function. P5's Demo Control panel uses `useDemoActions()` and `demoActions.run(id)`.

Actions run on the device that taps them. To move *another* phone's state (e.g. the affected user's simulated location), the action must **broadcast** the change (e.g. a `location_update` for that user) rather than only mutating local state.

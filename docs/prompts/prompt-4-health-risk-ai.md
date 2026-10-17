# Prompt 4: Health signals, risk engine, AI support call, and escalation (Expo)

You are responsible for health-signal simulation, explainable risk detection, check-ins, the AI support call, recording, incident package creation, and the escalation state machine for **Jam**, a native mobile app built with **Expo (SDK 57) + Expo Router**, run in **Expo Go**, with server logic in **Supabase Edge Functions**.

Work on branch **`feature/health-risk-ai`**, created from the updated `main` after the foundation merged.

## Read first (do not skip)

- Read `README.md`, `docs/architecture.md` (Alert flow, AI flow, Incident packages), and `docs/data-model.md` (alerts, incident_packages, RLS).
- **Use the foundation. Do not rewrite or duplicate it.** Types in `@/lib/types`: `HealthSignal`, `HealthScenario`, `RiskInput`, `RiskEvaluation`, `SafetyAlert`, `EscalationState`, `CheckInResponse`, `AiCallContext`, `AiCallTurn`, `AiCallStateEvent`, `IncidentPackage`, `IncidentRecipient`, `HealthService`, `RiskService`, `AiService`, `IncidentService`. Constants: `RISK_THRESHOLDS`, `DEMO_CHECKIN_TIMEOUT_MS`, `SUPPORT_CALL_SCRIPT`, `TERMINAL_ESCALATION_STATES`, `RECORDINGS_BUCKET`, `DEFAULT_INCIDENT_RETENTION_HOURS`. Edge Function wrappers: `advanceAlert`, `getSupportCallTurn` in `@/lib/supabase/functions`. Realtime hooks: `@/hooks/useJamChannel`.
- **Your files:** `src/features/health/*` (including `CheckInOverlay.tsx`, already mounted over every Jam tab), `src/features/ai/*` (including `SupportCallScreen.tsx`, route `/jam/[jamId]/support-call` already exists), `src/services/{health,risk,ai,incident}/*`, `supabase/functions/advance-alert`, and `supabase/functions/ai-support-call`.
- **Do not** modify the map, auth, or onboarding. Don't build ntfy, contact storage, in-app alert cards, or the demo panel. Call `notificationService` through its interface (P5 implements it). Register demo actions.
- Already installed: `expo-speech`, `expo-audio`, `expo-haptics`, `expo-crypto`. Install anything else with `npx expo install`, Expo Go modules only.

## Goal

Detect a **possible** need for support by combining signals. Never diagnose illness, intoxication, assault, or danger.

## Simulated health (`src/services/health`)

Build `SimulatedHealthProvider` implementing `HealthService`, with states `normal_walking`, `heart_rate_spike`, `unexpected_running`, `sudden_stop`, `fall_simulated`, `no_response`, `safe_again`. Each emits a `HealthSignal` (heart rate, activity, movement state, timestamp, baseline, `source: "simulated"`). Map states onto the shared enums: `unexpected_running` becomes activity `running` and movement `rapid`, and so on. Always show "Simulated wearable data."

Baseline: a random resting value of 65 to 90 BPM (`measureBaseline`), which Demo Mode can override (`campusWalk.health.baselineHeartRate` = 75), plus the current % difference. No medical questions. Broadcast `health_update`. Store in `health_signals` only if `health_consent` is on.

The team demos with **real accounts in a live Jam**, so never hardcode the seeded user ids. Inside each demo action's `run`, read the target with `getDemoContext()` from `@/features/demo/demoContext` (`{ jamId, affectedUserId }`). It's set by P2/P5, and it defaults to the seeded Campus Walk as a backup.

Demo actions run on the tapping phone (usually presenter 1's), so a scenario change for the affected user must be **broadcast** on `jam:{jamId}` (e.g. a `health_update` for `affectedUserId` with the spiked values), not just set locally. The affected user's own phone should then adopt that scenario, so its risk engine, check-in, and AI call run there.

## Risk engine (`src/services/risk`): pure, deterministic, unit-tested

Points are **cumulative**:

| Signal | Points |
|---|---|
| HR ≥ 40% above baseline | +2 |
| HR ≥ 70% above baseline | +1 more (≥70% = +3 total) |
| unexpected running | +2 |
| route deviation > 200m (from P3's `RouteStatus.level`) | +1 |
| sudden stop after rapid movement | +2 |
| fall simulation | +3 |
| no response to check-in | +3 |
| separated from group | +1 |

Thresholds (`RISK_THRESHOLDS`): 0 to 2 monitor (severity low); 3 to 4 check-in (moderate); 5 to 6 group alert (moderate); 7+ escalate (high). Return `RiskEvaluation` with human-readable reasons, e.g. "Heart rate is 93% above personal baseline." Route and separation inputs come from P3; don't recompute geometry.

**Sanity test:** 145 vs 75 BPM (+3) + running (+2) + deviation (+1) = 6, which is the group-alert range. The unanswered check-in (+3) brings it to 9, which escalates. Assert this in a test.

## Check-in (`CheckInOverlay.tsx`)

At the check-in threshold, show the affected user a calm modal sheet: "Are you okay?" with **I'm okay / I changed my destination / I'm lost / I need help / I cannot respond** (`CheckInResponse`). Use haptics (`Haptics.notificationAsync`). The demo timer is 10 to 15s (`DEMO_CHECKIN_TIMEOUT_MS`). Real timers come from the Jam's `checkin_delay_seconds` / `group_response_timeout_seconds`.

## Escalation state machine

States: `MONITORING, CHECK_IN_SENT, USER_RESPONDED, GROUP_ALERT_SENT, GROUP_MEMBER_ACKNOWLEDGED, AI_CALL_STARTING, AI_CALL_ACTIVE, AI_CALL_USER_RESPONDED, AI_CALL_USER_UNRESPONSIVE, CONTACTS_NOTIFIED, RESOLVED, CANCELLED`.

Flow: MONITORING → CHECK_IN_SENT → GROUP_ALERT_SENT → (no group ack) AI_CALL_STARTING → AI_CALL_ACTIVE → (no response) CONTACTS_NOTIFIED.

- Write a **pure** transition function `(state, event, now) => { state, status, deadlineAt }` in `src/features/health/escalation.ts`, with unit tests for every valid and invalid transition.
- Persist `escalation_state`, `status`, and `next_deadline_at` on the `alerts` row. Set `resolved_at` on RESOLVED/CANCELLED (a DB check constraint enforces this).
- **Timers survive phones closing:** when `next_deadline_at` passes, any member's app calls `advanceAlert(alertId)`. Implement the TODO in `supabase/functions/advance-alert/index.ts`: copy the transition function into `supabase/functions/_shared/escalation.ts` (Edge Functions can't import `src/`; keep the two in sync and test the `src/` copy), then compare-and-set with `adminClient()`. Calling it twice must be a no-op.
- One open alert per user is enforced by the DB. A duplicate insert returns error `23505`; treat it as a no-op.
- Respect `emergency_preference`: `contact_only_alert` skips the AI call (group alert → contacts). Respect each consent; no recording or contact notification without it.
- Broadcast `alert_created`, `alert_updated`, `checkin_requested`, `ai_call_state`, and `incident_created` (ids and states only, no sensitive data).

## AI support call (`SupportCallScreen.tsx`)

Implement the Gemini call in `supabase/functions/ai-support-call/index.ts` (see its TODO): validate the context, ~4s timeout, short outputs, rate-limit per user (e.g. keep a timestamp in the alert row or a simple in-memory map), and fall back to the script on any failure. The app side is already wired: `aiService.getSupportCallTurn(context, step)` never throws.

Script:
1. "Hi, this is Jam. Your group could not reach you. Are you safe?"
2. "Can you tap the button if you can hear me?"
3. "I have not received a response. Your authorized contacts may be notified with your location and safety information."

Speak with **`expo-speech`** (`Speech.speak(text, { rate: 0.95 })`), and **always** show the text large on screen too. The AI is not emergency services and never claims to be medical. Context sent: display name, location *summary*, route deviation level, heart-rate summary, activity, nearest support point, whether the group responded. **Never** location history.

## Recording

Show "AI support call active", "Recording enabled under your emergency preference", a timer, and a stop control, but only if `recording_consent` is true. Use **`expo-audio`** (`useAudioRecorder` + `RecordingPresets.HIGH_QUALITY`, after `requestRecordingPermissionsAsync`). If permission is denied or recording fails, use a simulated recording reference. Upload real recordings to the private `recordings` bucket at `{userId}/{alertId}.m4a`: read the file with `fetch(uri)` → `arrayBuffer()`, then `supabase.storage.from(RECORDINGS_BUCKET).upload(...)`. Keep the path. Never start recording silently.

## Incident package creation

When the user stays unresponsive, create the package: alert id, affected user, last known location, last response time, route deviation, health summary, risk score, reasons, recording reference, recipients (`IncidentRecipient[]`: Jam members + consented trusted contacts), expiry, and retention hours. Generate an external-contact access token with `expo-crypto` (`randomUUID()`) and store **only** its SHA-256 hash (`Crypto.digestStringAsync(SHA256, token)`) in `access_token_hash`. Implement `IncidentService` in `src/services/incident/supabase.ts`. Do not contact real emergency services.

## Always-visible safety controls

"I'm safe", "Cancel escalation", and "Call emergency services". The last is a **placeholder**: show a confirmation that explains it would open the dialer, and don't auto-dial.

## Demo actions (register in `demoActions`, owner `"health"`)

`triggerHeartRateSpike`, `triggerRunning`, `triggerRouteDeviation` (call `demoActions.run(DEMO_ACTION_IDS.triggerRouteDeviation)` only if P3 registered it), `triggerSuddenStop`, `sendCheckIn`, `simulateNoResponse`, `simulateNoGroupResponse`, `startAiCall`, `simulateAiResponse`, `simulateAiNonResponse`, `simulateAiRecording`, `createIncidentPackage`, `resolveAlert`.

## Done when

- [ ] `npm run check` and `npm run doctor` pass
- [ ] vitest unit tests for every risk threshold, the 6 → 9 sanity case, and every state transition (valid + invalid)
- [ ] Edge Functions deploy (`npx supabase functions deploy advance-alert ai-support-call`) and work with Gemini **unset** (scripted lines)
- [ ] On two phones: spike + running + deviation → check-in → no answer → group alert → AI call speaks → incident package created; closing the affected phone mid-flow still advances via `advance-alert`
- [ ] The PR says what changed and how to test it. No secrets. No changes outside your area.

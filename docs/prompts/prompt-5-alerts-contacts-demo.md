# Prompt 5: Contacts, alerts, notifications, incident screen, demo, and QA (Expo)

You are responsible for trusted contacts, emergency-preference display, in-app alerts, ntfy, SMS preview, the incident package screen, the **single** Demo Control panel, end-to-end QA, and final docs for **Jam**, a native mobile app built with **Expo (SDK 57) + Expo Router**, run in **Expo Go**, with server logic in **Supabase Edge Functions**.

Work on branch **`feature/alerts-contacts-demo`**, created from the updated `main` after the foundation merged.

## Read first (do not skip)

- Read `README.md`, `docs/architecture.md` (Alert flow, ntfy flow, Incident packages, Demo actions), `docs/data-model.md`, and `docs/demo.md`.
- **Use the foundation. Do not rewrite or duplicate it.** Types: `@/lib/types` (`SafetyAlert`, `AlertResponseRow`, `TrustedContactRow`, `IncidentPackage`, `NotificationResult`, `SmsPreview`, `NotificationService`). Constants: `NTFY_MESSAGE`. Wrapper: `notifyNtfy` in `@/lib/supabase/functions`. Registry: `demoActions`, `DEMO_ACTION_IDS`, `useDemoActions()`. Theme: `@/theme`. Use the existing escalation state machine (P4); don't write your own.
- **Your files (stubs already exist and are mounted):** `src/features/contacts/ContactsScreen.tsx` (route `/contacts`), `src/features/alerts/AlertOverlay.tsx` (shown over every Jam tab), `src/features/alerts/IncidentScreen.tsx` (route `/incident/[token]`), `src/features/alerts/DemoControlPanel.tsx` (route `/demo-control`), anything else in `src/features/alerts` and `src/features/contacts`, `src/services/notification/*`, `supabase/functions/notify-ntfy`, and new functions `supabase/functions/incident-access` and `supabase/functions/demo-reset`. Docs: `docs/demo.md`, `DEMO_CHECKLIST.md`.
- **Do not** rewrite the map, health engine, or auth.

## Trusted contacts (`ContactsScreen.tsx`)

Manage: name, relationship, phone, optional email, receive location, receive health/activity summary, receive recording (**all default off**), and confirmation status (pending/confirmed/declined). Store real test numbers only if the team chooses to. **Phone numbers are visible only to the owner.** RLS already enforces this; don't show them anywhere else.

## Emergency preference display

Show the chosen preference clearly ("AI support call" or "Contact-only alert"). It's editable before the Jam starts and locked while the user has an open alert (an `alerts` row with `resolved_at` null).

## In-app alerts (`AlertOverlay.tsx`)

Listen for `alert_created` / `alert_updated` on `jam:{jamId}`. On load and on reconnect, also re-read open `alerts` rows, so a reloaded app recovers state from the DB. Card: "Alex may need support." Show the affected user (name from `member_profiles`), last known location, time since last response, current activity, reasons, and the buttons "I'm going to help", "Open map", and "Join call". Statuses: New → Seen → Acknowledged → Responding → Resolved, backed by `alert_responses` inserts (unique per user/kind). Acknowledging moves the state machine to `GROUP_MEMBER_ACKNOWLEDGED` (use P4's transition function). Use a calm entrance animation (`Animated` / LayoutAnimation) and a light haptic. Not shown to the affected user themself.

## ntfy (server-side only)

Implement the TODO in `supabase/functions/notify-ntfy/index.ts`. Publish only Title "Jam safety alert" and Message "A Jam member may need support. Open the Jam app to view details." (`NTFY_MESSAGE` in `_shared/constants.ts`) to the Jam's random `ntfy_topic`. No health data, location, phone numbers, or recordings. Log every attempt in `notification_events` with `adminClient()`. If ntfy is unconfigured or fails, return `failed`/`skipped` and keep the in-app alert as the fallback.

Implement `NotificationService` in `src/services/notification/supabase.ts` (`notifyGroup` calls `notifyNtfy` and reports `in_app` too; `getStatus` reads the latest `notification_events`). Switch `index.ts` to it. Add a notification settings screen (new route file): ntfy configured/unavailable, topic status (show the topic so members can subscribe in the free ntfy app), last notification sent, and fallback state.

## Escalation order (P4 runs the steps; you show them and own the last one)

1. **Trigger:** going off the route (P3) or a health signal such as a sudden fall or stop (P4) → "Are you okay?" check-in.
2. **No answer within the person's buffer** (`profiles.checkin_buffer_seconds`, chosen at sign-up, e.g. 2 min) → **group alert**: in-app alert on every phone + ntfy push.
3. **Nobody in the group acknowledges** within `jams.group_response_timeout_seconds` → **AI support call** starts by itself on the affected phone. It guides them toward the destination (P3's spoken guidance), checks in every 15s, and is **recorded** if they consented.
4. **45 seconds of silence** on the AI call → the **emergency contact's phone rings** (Twilio).
5. Then the **contact gets a text** and the **group gets the incident package**: recording, last-seen location, and the relevant health/route data, each only as allowed.

## Last step: call + text + incident package (Twilio, built)

Built in `supabase/functions/_shared/contactEscalation.ts` (`escalateToContacts`), exposed as the `call-contacts` function and `notificationService.notifyContacts({ alertId, recordingPath? })`. It creates one incident package per alert, phones each trusted contact who has a phone number and hasn't declined, then texts them, then pings the group on ntfy. The call says their name, that the person may need support, the last known place **only if** `receive_location`, Jam's reasons **only if** `receive_health_summary`, and "if you believe they are in immediate danger, call 9 1 1". The text adds a maps link (location toggle) and a 24-hour recording link (`receive_recording`). Each attempt is logged in `notification_events` (`voice_call`, `sms`, `ntfy`), with no phone numbers. Phone numbers are stored in E.164 (`+14165550123`). Twilio trial accounts can only call and text **verified** numbers.

## SMS preview

With Twilio unset, the call and text are `skipped`; show an **"SMS preview"** (`previewSms`) of what would have been sent. Twilio credentials go in Edge Function secrets only.

## Contact access to incident data

`supabase/functions/incident-access` (built): `{}` lists packages shared with me; `{ incidentId }` returns one, filtered for me; `{ incidentId, action: "delete" }` wipes it and its recording. Jam members and the affected user are authorized by RLS. A **trusted contact** is matched by the email they sign in to Jam with (`trusted_contacts.email`) and gets only what their `receive_*` toggles allow. Recordings come back as 1-hour signed URLs. The contact opens **Incidents** (`/incidents`) → the package (`/incident/[id]`). They also get the text with the map link and recording link, so the app is optional for them.

## Incident package screen (`IncidentScreen.tsx`)

Show: "Incident package created", "Alex may need support.", a last-known-location map preview (`JamMapView` with one marker, `scrollEnabled={false}`), last response ("42 seconds ago"), "Why Jam flagged this" (reasons), "Shared with" (Jam members, selected contact), the recording (e.g. a 30-second incident recording, played with `expo-audio`), and the retention message: "Incident data is scheduled for deletion after the selected retention period." Actions: copy location (`Clipboard` from `react-native` is deprecated, so use `expo-clipboard` via `npx expo install expo-clipboard`), open map, play recording, delete package (`rpc("delete_incident_package", { p_id })`, then remove the returned recording path from Storage), and mark resolved. Include P3's `getRouteRecommendation(...)` explanation text.

## Demo Control panel (`DemoControlPanel.tsx`, the only one)

Buttons, in order: Reset demo, Move affected user away, Trigger route deviation, Trigger heart-rate spike, Trigger running, Trigger sudden stop, Send check-in, Simulate no response, Simulate no group response, Start AI call, Simulate AI recording, Send incident package, Resolve incident. Each calls `demoActions.run(id)` (ids in `DEMO_ACTION_IDS`). Show unregistered ones as **unavailable** (`demoActions.has(id)`), and show running/success/error per button.

The team demos with **real accounts in a live Jam**. At the top of the panel, show the Jam being demoed (`getDemoContext().jamId`, set by P2's Demo Mode) and an **"Affected user" picker** listing that Jam's members (from `jam_members` + `member_profiles`). Picking one calls `setDemoContext({ affectedUserId })`. Use `subscribeDemoContext` to re-render. All P3/P4 actions read this context, so nothing is hardcoded. If nothing was set, it defaults to the seeded Campus Walk backup.

**Reset demo** must fully clear alerts, responses, incident packages, notification events, health signals, and live locations **for the context Jam** so the demo is repeatable. Add `supabase/functions/demo-reset` taking `{ jamId }`: verify the caller is that Jam's **host** (user client), then delete those rows with the admin client, for that Jam only. Never touch accounts, profiles, members, or contacts. Then broadcast a reset so every phone clears local state. (Re-running `supabase/seed.sql` remains the reset for the seeded backup Jam.)

Presenter roles: Host (P1), Group member (P2), Affected user (P3), Emergency contact (P4 or a simulated recipient). For the emergency-contact step with real accounts, the affected user adds presenter 4 as a trusted contact before the demo (with location/health toggles on).

## Final demo flow (implement and test exactly)

1. Presenter 1 signs in (demo account or email code) and creates "Campus Walk".
2. Presenters 2 and 3 join via code or QR. Everyone appears on the shared map.
3. Presenter 3 confirms the destination and emergency preference, and shares live location.
4. Presenter 3 moves away (simulated location). The map shows route deviation.
5. Health signal: baseline 75, current 145, activity running.
6. Jam shows "Are you okay?" Presenter 3 doesn't respond within their buffer (Demo Mode shortens it).
7. All members receive the in-app alert and the ntfy push. Nobody acknowledges.
8. The AI support-call screen starts by itself and speaks "Hi, this is Jam. Your group could not reach you. Are you safe?", then guides them toward the destination. The screen shows "Recording enabled under your emergency preference."
9. Presenter 3 stays silent for 45 seconds. **Presenter 4's phone rings** and they get a text with the last-seen location and the recording link.
10. The group sees the incident package in-app (and via ntfy). The map shows the last known location.
11. Jam shows: "This route has fewer nearby public support points and a current transit disruption. We recommend an alternative route."
12. A presenter marks the user safe. The alert resolves, and the recording/data deletion status appears.

## Tone

Use: "Jam noticed a combination of changes and is checking in." / "Your group has been notified." / "Move toward the highlighted public support point if you can do so safely." Avoid: "DANGER DETECTED", "YOU ARE IN AN UNSAFE ZONE", heavy red, fake precision, unexplained AI text, long paragraphs during an alert.

## Error-handling tests

Location denied, location unavailable, no internet, Supabase down, Gemini down, ntfy down, user leaves the Jam, **app reload mid-alert (state recovers from the DB)**, stale location, duplicate alert, user resolves the incident. Friendly recovery messages, no crashes.

## Testing matrix

iPhone (Expo Go) and Android (Expo Go), at least two physical phones at once, plus a projector mirror. Verify: login, Jam create/join, live map, location updates, route deviation, alert creation, AI voice, incident package, privacy (non-recipients can't read incident data or others' contacts; check with a second account), and reset and replay.

## Docs

Update `docs/demo.md`: setup, phone assignments, sequence, env vars, fallbacks (ntfy fails, Gemini fails, live location fails, sign-in fails, laptop/dev server fails → EAS Update). Create `DEMO_CHECKLIST.md` with presentation checkboxes, including: Expo Go updated on every phone; phones charged and set to stay awake; the EAS Update or tunnel URL tested; volume up and silent mode off (for TTS); location/mic/camera permissions granted ahead of time; demo reset run; a backup screen recording.

## Done when

- [ ] `npm run check` and `npm run doctor` pass; functions deploy
- [ ] The full 12-step flow passes twice in a row on real phones, with **Reset demo** between runs
- [ ] The PR says what changed and how to test it. No secrets. Notification details stay server-side. No changes outside your area.

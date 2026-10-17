# Prompt 2: UI, authentication, onboarding, and Jam management (Expo)

You are responsible for the user experience, authentication, onboarding, Jam creation, Jam joining, and shared navigation for **Jam**, a native mobile app built with **Expo (SDK 57) + Expo Router** and run in **Expo Go**. Jam is for students, tourists, and friends travelling together: users create or join a private Jam, share live location, set a destination, and get support if someone becomes lost, separated, or unresponsive.

Work on branch **`feature/ui-onboarding`**, created from the updated `main` after the foundation merged.

## Read first (do not skip)

- Read `README.md`, `docs/architecture.md`, `docs/data-model.md`, and `docs/environment.md`.
- **Use the foundation. Do not rewrite or duplicate it.** Shared types: `@/lib/types`. Supabase client: `getSupabaseClient()` from `@/lib/supabase/client`. Auth helpers: `@/lib/supabase/auth`. Design tokens: `@/theme`. Shared states: `LoadingState` / `EmptyState` / `ErrorState` from `@/components/ui/States`. Realtime: `useJamChannel` / `useJamEvent` from `@/hooks/useJamChannel`. Services: `@/services`.
- **Do not touch** map, location, risk, AI, notification, or contact logic (P3/P4/P5). Don't build trusted-contact management; link to its route (`/contacts`, owned by P5).
- **No schema changes** unless unavoidable. If one is needed: add a new migration, update `src/lib/types/database.ts`, and tag the team.
- Install native libraries only with `npx expo install <pkg>`, and only ones bundled in Expo Go. Everything you need is already installed: `expo-router`, `react-native-safe-area-context`, `expo-camera`, `react-native-qrcode-svg`, `expo-keep-awake`, `expo-haptics`, `expo-linking`.

## Design direction

Warm, calm, modern, human: like a friend quietly looking out for you. Not a generic campus emergency app. It should feel **native**: native stack transitions, a bottom tab bar, sheets/modals for quick actions, haptics on key taps, safe-area aware layouts.

- **Avoid:** excessive red, police-style warnings, fear language, cluttered dashboards, meaningless AI chat bubbles, giant EMERGENCY buttons, dark institutional branding, fake technical metrics.
- **Use:** soft navy, warm white, light blue, amber for attention, red (`colors.escalation`) only for confirmed escalation; rounded cards; large touch targets (`TAP_TARGET`); friendly plain copy; clear status labels; subtle motion; strong spacing; accessible contrast.
- **You own `src/theme`.** Tune the values freely, but keep the token names stable (`colors.navy`, `space()`, `radius.card`, `type.*`, `TAP_TARGET`). P3/P4/P5 use them. You may add shared primitives (`Button`, `Card`, `Toggle`, `Screen`, `Badge`) in `src/components/ui`. Tell the team when they land.

## Navigation (Expo Router, in `src/app`)

Suggested structure (replace the placeholder `index.tsx`):

```
src/app/_layout.tsx                  root Stack + session gate (keep the existing providers)
src/app/(auth)/welcome.tsx  profile.tsx  consent.tsx  baseline.tsx
src/app/index.tsx                    home
src/app/create.tsx  join.tsx  join/[code].tsx  demo.tsx
src/app/jam/[jamId]/lobby.tsx
src/app/jam/[jamId]/(tabs)/_layout.tsx   bottom tabs: Map, Group, Signals, Settings
src/app/jam/[jamId]/(tabs)/map.tsx       placeholder that renders P3's <JamMapScreen jamId/> (P3 replaces it)
src/app/jam/[jamId]/(tabs)/group.tsx  signals.tsx  settings.tsx
```

Put screen logic and components in `src/features/auth` and `src/features/jams`. Keep route files thin.

## Authentication + profile

Flow: welcome → sign in → profile setup if no `profiles` row → home. Session state comes from `supabase.auth.getSession()` plus `onAuthStateChange`. Gate routes in the root layout.

Sign-in options, all already implemented in `@/lib/supabase/auth`:
1. **"Continue with email"**: `sendEmailCode(email)`, then a 6-digit code screen calls `verifyEmailCode(email, code)`. It creates the account on first use, so this is also **sign-up**.
2. **Demo accounts** (shown when `publicEnv.enableDevLogin`): one-tap buttons for `host@jam.demo`, `member@jam.demo`, `affected@jam.demo`, `contact@jam.demo` (password `jam-demo-1234`) using `signInWithDevAccount`.
3. **"Continue with Google"** (`signInWithGoogle()`): show it, but it's optional in Expo Go. Handle `{ error }` calmly.

Profile asks only for: display name, optional phone, optional photo (photo upload is optional. If you add it, add an `avatars` Storage bucket via a migration and tell the team). Copy: "Let's set up your Jam profile. You can change these settings later." Never ask for a home address, unnecessary medical info, or weight. Insert the `profiles` row here (no trigger exists).

## Consent screen

Separate plain-language toggles for: location sharing, health signals, AI support call, emergency recording, trusted-contact notifications. **All off by default** (`DEFAULT_CONSENTS` in `@/lib/constants`). Example: "Location sharing lets your Jam see where you are while the Jam is active. You can pause it at any time."

Emergency preference (`ai_support_call` or `contact_only_alert`) must be **actively chosen**, with nothing pre-selected. Keep a draft in local state, then persist it to the user's `jam_members` row when they create or join a Jam. RLS lets members update only those columns on their own row.

## Health baseline screen

"Stay still for a moment while Jam establishes a demo heart-rate baseline." Use `healthService.measureBaseline({ durationMs, onProgress })`. Show the baseline BPM, a progress indicator, "Use this baseline", and "Skip for now". Label it "Simulated wearable data for prototype." No risk logic.

## Home

Greeting, Create a Jam, Join a Jam, active Jams, past Jams, emergency contacts (link to `/contacts`), privacy settings, Demo Mode button.

## Create Jam

Fields: name, destination (name + coordinates; a simple list of preset Campus Walk places or a map-pick stub is fine, and P3 can enhance it), expected arrival, travel mode (walking/transit/mixed), check-in delay, group response timeout, emergency preference.

Insert into `jams` (`host_id` = you; `join_code` and `ntfy_topic` are generated by the DB), then insert your own `jam_members` row with `role: "host"`. Afterwards show: the name, the join code, a **QR code** (`react-native-qrcode-svg`, encoding just the join code, e.g. `JAM:CAMPUS`), a **Share** button (React Native `Share.share` with the code and instructions), and "Waiting for members".

## Join Jam

Code entry (validate with `joinCodeSchema` from `@/lib/validation`), QR scan (`expo-camera` `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`), and the `join/[code]` route. Call `supabase.rpc("join_jam", { code })`. Map its errors (`invalid_code`, `jam_ended`, `profile_required`) to calm copy. If camera permission is denied, fall back to manual entry. Afterwards, confirm display name, location sharing, health sharing, and emergency preference.

## Lobby

Destination, host, joined members with status (Ready / Location not shared / Health signals off / Waiting), join code, QR, and **Start Jam** (host only: sets `status: "active"` and `started_at`). The member list updates in realtime: subscribe to `postgres_changes` on `jam_members` filtered by `jam_id` (the table is in the realtime publication). Names come from the `member_profiles` view, because `profiles` is own-row only.

## Active Jam tabs

Bottom tabs: **Map, Group, Signals, Settings.** The Map tab just renders `<JamMapScreen jamId={jamId} />` from `@/features/map/JamMapScreen` (a working stub that P3 replaces). In the tabs `_layout.tsx`, also render **`<JamOverlayHost jamId={jamId} />`** from `@/components/JamOverlayHost` once, above the tabs. That's where P4's check-in and P5's alert cards appear. Never put their UI in your files.

Routes that already exist (foundation stubs, owned by others; just link to them): `/contacts` (P5), `/demo-control` (P5), `/incident/[token]` (P5), `/jam/[jamId]/support-call` (P4).
- **Group:** member circles, live/offline, last seen, activity, location-sharing status, and "Check in with group", which sends `checkin_requested` via `channel.send("checkin_requested", { jamId, requestedBy, reason: "group_manual", timestamp })`.
- **Signals:** health-sharing state, baseline, current signal if present (listen to `health_update`), a "Simulated data" badge, and a privacy explanation.
- **Settings:** pause location, disable health, change emergency preference (blocked during an active alert, i.e. any `alerts` row for you with `resolved_at` null), link to trusted contacts, stop Jam (host: `status: "ended"`, `ended_at`), leave Jam (`is_active: false`, `left_at`), delete account, delete incident data, and a consent summary. Privacy controls are never hidden.

While a Jam is active, keep the screen awake (`useKeepAwake()` from `expo-keep-awake` in the tabs layout).

## UX states

Loading, no active Jam, waiting for members, location permission denied, health disabled, no internet, member offline, Jam ended, alert resolved. Calm copy, e.g. "Your location is paused. Other Jam members cannot see your current position."

## Demo Mode entry

The team demos with **their own real accounts**. Presenter 1 creates "Campus Walk" live and the others join. Demo Mode has two paths:

1. **Primary: "Demo this Jam".** From an active Jam (e.g. in Settings, or a Demo Mode button on the Jam), call `setDemoContext({ jamId })` from `@/features/demo/demoContext` and open `/demo-control` (P5's panel, where the presenter picks which member is the affected user).
2. **Backup: "Load seeded Campus Walk".** If real sign-in fails on stage, a role picker (Host / Group Member / Affected User / Emergency Contact) signs in with the matching seeded account (`signInWithDevAccount`, shown only when `publicEnv.enableDevLogin`) and opens the seeded Jam (`campusWalk.jam.id`). The demo context defaults to this Jam, so nothing else is needed.

In **Create Jam**, offer a one-tap **"Campus Walk" preset** that fills the destination from `campusWalk.destination` (St. George Station), so the live Jam matches the demo route and support-point data. Polished loading and empty states. No risk logic and no control panel (P5 owns the panel).

## Accessibility

`accessibilityRole` / `accessibilityLabel` on every control, status text alongside color, readable sizes (support Dynamic Type; don't set `allowFontScaling={false}`), strong contrast, and touch targets of at least `TAP_TARGET`. Test on iPhone and Android.

## Done when

- [ ] `npm run check` and `npm run doctor` pass
- [ ] Flow works in Expo Go on two phones: sign in → profile → consent → create → second phone joins by code and by QR → lobby updates live → Start Jam → tabs
- [ ] A README section lists the screens you implemented
- [ ] The PR says what changed and how to test it. No secrets. No changes outside your area.

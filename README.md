# Huddle

*Your journey, connected.* A native mobile app for students, tourists, and friends travelling together. Create or join a private Huddle, share live location, set a destination, and get support if someone becomes lost, separated, or unresponsive.

> Formerly **Jam**: code, routes, tables, and ids still use `jam` (see "Naming" in CLAUDE.md).

**Stack:** Expo SDK 57 (React Native, Expo Router), run in **Expo Go** · TypeScript · Supabase (Auth, Postgres + RLS, Realtime, Storage, Edge Functions) · react-native-maps · expo-location / speech / audio / camera · Zod · Vitest

## Quick start

```bash
npm install
cp .env.example .env     # optional: the app runs on mocks with no values
npm start                # scan the QR with your phone (Expo Go, SDK 57)
npm run start:tunnel     # if your phone can't reach your laptop on Wi-Fi
npm run check            # typecheck + lint + unit tests (required before every PR)
npm run doctor           # expo-doctor
```

Full setup (Supabase, sign-in, Edge Functions, demo day): [docs/environment.md](docs/environment.md)

**Team prompts (start here if you're P2 to P5):** [docs/prompts/](docs/prompts/README.md)

## Docs

- [Architecture](docs/architecture.md): app, Supabase, Edge Functions, realtime, location, health, alert, ntfy, and AI flows
- [Data model](docs/data-model.md): tables, relationships, RPCs, RLS
- [Environment](docs/environment.md): setup, env vars, phones, EAS Update
- [Demo](docs/demo.md): the 3 to 4 phone demo

## P2: UI, auth, onboarding, Jam management

Implemented on `feature/ui-onboarding`. Screens (route → `src/features/...`):

- **Auth / onboarding** (`src/app/(auth)/`): `welcome` (email code sign-in/sign-up, demo-account
  one-tap buttons, Google), `profile` (display name + optional phone; creates the `profiles`
  row), `consent` (the five sharing toggles + emergency preference, nothing pre-selected),
  `baseline` (simulated heart-rate baseline via `healthService.measureBaseline`). Consent and
  baseline run once, right after profile setup, and become the on-device default (`src/features/
  auth/onboardingDraft.ts`) applied to every Jam afterwards — still editable per Jam.
- **Home** (`src/app/index.tsx` → `HomeScreen`): greeting, Create/Join buttons, active and past
  Jams, links to contacts, privacy defaults (`/privacy`), and Demo Mode.
- **Create a Jam** (`/create` → `CreateJamScreen`): name, destination presets (incl. a one-tap
  "Campus Walk" preset), travel mode, expected arrival, check-in delay, group response timeout,
  emergency preference. Inserts `jams` + the host's own `jam_members` row.
- **Join a Jam** (`/join`, `/join/[code]` → `JoinJamScreen`): manual code entry or QR scan
  (`expo-camera`, falls back to manual entry if the camera is denied), then a short confirm step
  (location/health sharing + emergency preference) before calling `join_jam`.
- **Lobby** (`/jam/[jamId]/lobby` → `LobbyScreen`): destination, host, live member list with
  status (Ready / Location not shared / Health signals off / Waiting), join code, QR code,
  Share button, and Start Jam (host only). Updates live via `postgres_changes`.
- **Active Jam tabs** (`/jam/[jamId]/(tabs)/`): Map (renders P3's `JamMapScreen`), Group (member
  roster, presence/last-seen/activity, "Check in with group"), Signals (health-sharing state,
  baseline, current signal, simulated-data badge), Settings (every consent toggle, emergency
  preference — locked during an active alert, trusted contacts link, Demo this Jam, stop/leave
  Jam, delete incident data, delete account). Mounts `<JamOverlayHost>` once and keeps the screen
  awake for the whole tab stack.
- **Demo Mode** (`/demo` → `DemoEntryScreen`): "Demo this Jam" (sets the demo context to a live
  Jam and opens `/demo-control`) and the seeded-account role-picker backup.

Shared UI primitives added in `src/components/ui`: `Button`, `Card`, `Toggle`, `Badge`,
`TextField`, `OptionCard`, `Avatar`, `Screen` (alongside the existing `States`).

**Test plan:** `npm run check` and `npm run doctor` pass; `npx expo export --platform ios`
bundles cleanly. On two phones: sign in → profile → consent → baseline → home → Create a Jam
(phone A) → Join by code and by QR scan (phone B) → lobby member list updates live on both →
Start Jam → tabs appear with the overlay host mounted and the screen staying awake.

## Layout

```
src/
  app/                 Expo Router screens (thin). Foundation stubs: contacts, demo-control,
                       incident/[token], jam/[jamId]/support-call, dev (check screen)
  components/          JamMapView, JamOverlayHost (P4/P5 overlays), Placeholder, ui/States
  features/<area>/     screens + logic per owner (see each README.md). Stubs to replace:
                       map/JamMapScreen, health/CheckInOverlay, ai/SupportCallScreen,
                       alerts/{AlertOverlay,IncidentScreen,DemoControlPanel}, contacts/ContactsScreen
  hooks/               useJamChannel, useJamEvent, useDemoActions
  lib/types/           SHARED CONTRACTS: domain, events, database rows, service interfaces
  lib/constants/       thresholds, channel names, AI script, ntfy message
  lib/validation/      Zod schemas (realtime payloads, join codes, AI context)
  lib/supabase/        client (AsyncStorage session), auth helpers, Edge Function wrappers
  lib/demo/            campus-walk.json + typed campusWalk (single source for mocks/seed)
  services/<name>/     interface → mock today; owners add the real implementation
  theme/               design tokens (colors, space, radius, type, TAP_TARGET)
supabase/
  migrations/          schema + RLS (tested: 50+ access checks)
  functions/           Edge Functions: advance-alert, ai-support-call, notify-ntfy (+ _shared)
  seed.sql             demo accounts + Campus Walk; re-run = demo reset
```

## Ownership

| Area | Owner | Branch |
|---|---|---|
| Auth, profile, consent, baseline, Jam create/join/lobby, tabs, Group/Signals/Settings, home, Demo Mode entry, theme | P2 | `feature/ui-onboarding` |
| Map, live location, routing, route deviation, civic data, support points, route recommendation, data-sources | P3 | `feature/maps-location-data` |
| Health simulation, risk engine, escalation state machine, check-in, AI call + recording, incident package creation | P4 | `feature/health-risk-ai` |
| Trusted contacts, in-app alerts, ntfy, SMS preview, incident screen, notification settings, Demo Control panel, QA, docs | P5 | `feature/alerts-contacts-demo` |

## Rules for everyone

1. Branch from updated `main`: `git checkout main && git pull origin main && git checkout -b feature/<name>`.
2. Import types from `@/lib/types` and **never redefine them**. Contracts (types, schema, event payloads, service interfaces) are **frozen**. Change them only through a small PR that tags the team. Adding new optional fields or new types is fine.
3. Use services through `@/services`. To go real, add your implementation next to `mock.ts` and change the one line in that service's `index.ts`.
4. Edit only your own files. Cross-owner screens are already stubbed and mounted, so replace the body and keep the export.
5. Realtime: `const ch = useJamChannel(jamId); useJamEvent(ch, "location_update", handler); ch?.send(...)`. Never put phone numbers, health history, or recordings in broadcasts.
6. Demo controls: **don't build your own**. Use `demoActions.register({ id: DEMO_ACTION_IDS.x, label, owner, run })` in a `useEffect`.
7. **No secrets in the app.** Only `EXPO_PUBLIC_*` vars, which are public. Gemini, ntfy, and the service role live in Edge Function secrets.
8. Native libraries: `npx expo install <pkg>`, Expo Go modules only.
9. Run `npm run check` + `npm run doctor` before opening a PR. The PR says what changed and how to test it.

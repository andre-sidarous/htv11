# Huddle

**Huddle N' Waddle.** *Nobody walks home alone, even when they're on their own.*

Huddle is a native mobile app for students, tourists and friends heading somewhere together, or on their own. Create or join a private Huddle, share your live location while it's running, and set where you're going: one destination for the whole group, or one each. If someone may need support, Huddle responds calmly, in steps: it checks in with them, tells the group, calls them with an AI that guides them toward help, and only then reaches their trusted contacts.

Built at **Hack the Valley 11**.


## Contents

- [Features](#features)
- [Privacy and safety principles](#privacy-and-safety-principles)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Backend setup (Supabase)](#backend-setup-supabase)
- [Scripts](#scripts)
- [Testing](#testing)
- [Running the demo](#running-the-demo)
- [Data sources](#data-sources)
- [Documentation](#documentation)
- [Ownership](#ownership)
- [Known limitations](#known-limitations)

## Features

### Lifeline: the AI support call

When someone may need support and nobody in their group has answered, Huddle calls them.

- **Real phone call** through Twilio when a phone number is on their profile, or a **spoken call inside the app** otherwise (same script, shown on screen in large text).
- Every turn re-reads their latest location, gets **real walking directions** (OSRM on OpenStreetMap) and **nearby public places** (Toronto Open Data), then asks **Google Gemini** what to say. A scripted line is always ready if Gemini is slow or unavailable.
- In a quiet area with few public places or TTC stops, it guides them to the nearest library, station or community centre instead.
- Any answer counts as a response. Two silent turns (about 10 seconds) bring in their trusted contacts.
- Can be started directly with **SOS** on the map or **I need help** on a check-in.
- The AI only sees a short summary (name, location *summary*, route status, activity, destination, next direction), never raw coordinates or location history.

### Safety Circle: check-ins, group alerts, trusted contacts

A step-by-step escalation that tries the least intrusive option first:

```
Check-in ──no answer──► Group alert ──no response──► Lifeline AI call ──silence──► Trusted contacts
   │                        │                           │
"I'm okay"            "I'm going to help"        any answer = responded
 ends it              (the call still guides      (people who chose "contacts only"
                       them until help arrives)    skip the AI call)
                       Any step → "I'm safe" / "Cancel escalation" resolves it on every phone
```

- **Check-in** sheet: *I'm okay*, *I changed my destination*, *I'm lost*, *I need help*, *I cannot respond*.
- **Group alert** cards on every member's phone with the reasons, last known location and actions (*I'm going to help*, *Open map*, *Join call*, *View incident*, *Mark safe*), plus a fixed push message via ntfy.
- **Trusted contacts** get a phone call and a text containing only what the person allowed (location, health summary, recording link).
- **Incident package** per alert: last-seen place, reasons, route, recording (if consented) and who it was shared with. Contacts open it with a link or their sign-in email.
- **Deadlines live in the database**, so the escalation keeps going if the affected person's phone dies.

### Pulse: health signals and an explainable score

- A **simulated wearable** (the UI always says "Simulated wearable data") streams heart rate, activity and movement.
- A deterministic **points system** decides when to check in, with a plain-language reason for every point:

| Signal | Points |
|---|---|
| Heart rate ≥ 40% above personal baseline | +2 (≥ 70%: +3) |
| Unexpected running | +2 |
| More than 200 m off the planned route | +1 |
| Sudden stop after rapid movement | +2 |
| Simulated fall | +3 |
| No response to a check-in | +3 |

  Score 3 = check-in, 5 = group alert, 7+ = escalate.
- An optional **health profile** uses a model trained on the CDC's **NHANES** survey: normal resting heart rate for your age and sex, and an estimate of the chance of high blood pressure, diabetes or heart disease. It runs on the phone, and it's an estimate, never a diagnosis. See [ml/README.md](ml/README.md).

### Huddles and the map

- Sign-in with an email code (or seeded demo accounts), then profile, consent and a heart-rate baseline.
- Create a Huddle or join by code or QR. One shared destination, or everyone picks their own.
- Live map of every member, each person's planned route, route-deviation levels (100 / 200 / 350 m), Toronto support points and TTC, a "follow me" mode with the next step, and an SOS button.
- Group roster with presence (live, stale after 30 s, offline after 60 s; staleness never means danger), group chat, and a manual **Check in with group**.

## Privacy and safety principles

- **Consent first.** Location, health signals, the AI call, recording and contact notifications are each **off by default**, and the emergency preference must be actively chosen.
- **Least intrusive first.** The person is always asked before the group, and the group before contacts.
- **Calm, honest wording.** Huddle never calls a place or person safe, unsafe or dangerous, never diagnoses, and **is not emergency services**. The "Call emergency services" button is a placeholder that never dials.
- **Minimal data on the wire.** Realtime broadcasts carry ids and states only. Everything else is re-read through row-level security. Phone numbers are visible only to their owner and are never logged.
- **No secrets in the app.** Only public `EXPO_PUBLIC_*` values are bundled. Gemini, Twilio, ntfy and the service role key live in Edge Function secrets.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile app | [Expo](https://expo.dev) SDK 57, React Native, Expo Router, run in Expo Go |
| Language | TypeScript (strict), [Zod](https://zod.dev) for validating every realtime message |
| Maps and device | react-native-maps, expo-location, expo-speech, expo-audio, expo-camera (QR), expo-haptics, expo-image-picker |
| UI | Inter (`@expo-google-fonts/inter`), lucide-react-native icons, custom design tokens in `src/theme` |
| Backend | [Supabase](https://supabase.com): Auth, Postgres with row-level security, Realtime Broadcast, Storage |
| Server logic | Supabase Edge Functions (Deno) |
| AI | Google Gemini, with a scripted fallback |
| Calls and texts | [Twilio](https://www.twilio.com) Programmable Voice and Messaging |
| Push | [ntfy](https://ntfy.sh) |
| Routing and places | [OSRM](https://project-osrm.org) on OpenStreetMap, Overpass, Nominatim, Photon |
| City data | City of Toronto Open Data (preprocessed and bundled) |
| Health model | Python, pandas, scikit-learn (logistic regression on NHANES) |
| Tests | Vitest (app), Deno test (Edge Functions) |
| Delivery | EAS Update |

## Project structure

```
htv11/
├── src/
│   ├── app/                    Expo Router routes (kept thin: each renders a screen from src/features)
│   │   ├── (auth)/             welcome, profile, consent, health profile, baseline
│   │   ├── jam/[jamId]/        lobby, chat, support-call, and (tabs)/ map · group · signals · settings
│   │   ├── incident/[token]    incident package (members and trusted contacts)
│   │   └── …                   home, create, join, solo, contacts, incidents, notifications,
│   │                           privacy, health-profile, data-sources, demo, demo-control, dev
│   ├── features/               screens + logic per area (each has a README.md)
│   │   ├── auth/               sign-in, profile, consent, baseline
│   │   ├── jams/               home, create/join, lobby, group, chat, settings
│   │   ├── map/                map screen, routes, guidance, Toronto civic data
│   │   ├── location/           live location sharing, presence, route status
│   │   ├── health/             Pulse, escalation state machine, check-in, health profile + model
│   │   ├── ai/                 Lifeline in-app call, call context, recording, incident packages
│   │   ├── alerts/             group alert cards, incident screens, Demo Control + automated story
│   │   ├── contacts/           trusted contacts
│   │   └── demo/               demo action registry and flags
│   ├── components/             shared UI (ui/), brand (Pico, logo), map view, overlay host
│   ├── hooks/                  useJamChannel, useJamEvent, useDemoActions
│   ├── services/               one interface per service; index.ts picks real or mock
│   │                           (ai, health, incident, location, notification, realtime, risk, routing)
│   ├── lib/
│   │   ├── types/              shared contracts: domain, realtime events, database rows, services
│   │   ├── constants/          thresholds, timings, scripts, brand copy
│   │   ├── validation/         Zod schemas
│   │   ├── supabase/           client, auth helpers, Edge Function wrappers
│   │   ├── ai/                 scripted support-call lines (mirrored on the server)
│   │   └── demo/               Campus Walk demo data
│   └── theme/                  design tokens (colors, spacing, radius, type)
├── supabase/
│   ├── migrations/             schema, RLS and RPCs (run in order)
│   ├── functions/              Edge Functions + _shared/ (Deno)
│   └── seed.sql                demo accounts + the Campus Walk Huddle
├── ml/                         NHANES health model training script
├── assets/brand/               app icon, splash, Pico the penguin
├── docs/                       architecture, data model, environment, demo, team prompts
├── app.json                    Expo config
├── CLAUDE.md                   detailed engineering guide
└── DEMO_CHECKLIST.md           presentation-day checklist
```

## Getting started

### Prerequisites

- **Node.js** 20 or newer, and npm
- **Expo Go** on your phone, the version for **SDK 57** ([iOS](https://apps.apple.com/app/expo-go/id982107779) · [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Optional, for the full experience: a **Supabase** project, a **Twilio** account, a **Gemini** API key
- Optional, for Edge Function tests: **Deno** (or run it through `npx -y deno`)

### Install and run

```bash
git clone https://github.com/andre-sidarous/htv11.git
cd htv11
npm install                 # re-run after every pull: branches add packages
cp .env.example .env        # optional: with no values the app runs on mocks
npm start                   # scan the QR code with Expo Go
```

- Phone can't reach your laptop on Wi-Fi? Use `npm run start:tunnel`.
- "Unable to resolve module" after a pull? Run `npm install`, then `npx expo start -c`.

**Mock mode:** with the Supabase values blank (or `EXPO_PUBLIC_USE_MOCK_SERVICES=true`), the app boots on in-memory services. That's enough for a single-device walkthrough. Cross-phone features need Supabase.

## Configuration

### App (`.env`, public)

Everything here is bundled into the app, so never put a secret in it.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key (never the service role key) |
| `EXPO_PUBLIC_ENABLE_DEV_LOGIN` | `true` shows one-tap sign-in with the seeded demo accounts |
| `EXPO_PUBLIC_USE_MOCK_SERVICES` | `true` forces mocks even when Supabase is set (single device) |
| `EXPO_PUBLIC_OSRM_URL` | Optional walking-route server, e.g. `https://routing.openstreetmap.de/routed-foot`. Blank = the Campus Walk demo route |

### Edge Functions (`supabase/functions/.env`, secret)

Uploaded with `npx supabase secrets set --env-file supabase/functions/.env`. Never committed, never in the app.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Lifeline lines. Blank = scripted call |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Phone calls and texts. Blank = calls skipped and logged. Trial accounts can only call verified numbers |
| `AI_CALL_SIGNING_SECRET` | Signs the Twilio webhook URLs for the live AI call (any long random string) |
| `NTFY_BASE_URL`, `NTFY_TOKEN` | Group push messages (public ntfy.sh needs no token) |

## Backend setup (Supabase)

Full walkthrough: [docs/environment.md](docs/environment.md).

1. **Create a Supabase project** and put its URL and anon key in `.env`.
2. **Apply the migrations in order** (`supabase/migrations/`), with `npx supabase db push` or the SQL Editor:
   `initial_schema` → `rls` → `voice_call_channel` → `escalation_timing` → `chat_messages` → `checkin_responses` → `health_profiles` → `planned_routes` → `destination_mode`
3. **Seed the demo** (optional, never in production): run `supabase/seed.sql`. It creates four demo accounts and the Campus Walk Huddle.
4. **Set secrets and deploy the functions:**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy --use-api
```

### Edge Functions

| Function | What it does |
|---|---|
| `advance-alert` | Moves an alert to its next step when its deadline passes (idempotent, compare-and-set). Places the AI call and contacts trusted contacts when it makes those moves |
| `ai-support-call` | One line of the in-app support call from Gemini, with a scripted fallback |
| `ai-phone-call` | Starts the Lifeline phone call through Twilio (one call per alert) |
| `ai-call-webhook` | Twilio webhook for each turn of the phone call: location, directions, nearby places, Gemini (signed per alert) |
| `call-contacts` | Last step: incident package, calls and texts to trusted contacts, ntfy to the group |
| `test-call` | Rings one of your own trusted contacts with a short test message |
| `notify-ntfy` | Sends the fixed group push message |
| `incident-token` | Saves a trusted contact's access token for an incident package (only its hash is stored) |
| `incident-access` | Lists, reads and deletes incident packages, filtered by what each reader may see |
| `demo-reset` | Host only: clears one Huddle's alerts, incidents, notifications, health signals and locations |

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server (scan the QR with Expo Go). Add `-c` to clear the Metro cache |
| `npm run start:tunnel` | Dev server over a tunnel, for phones that can't reach the laptop |
| `npm run ios` / `npm run android` | Open in a simulator or emulator |
| `npm run check` | Typecheck + lint + unit tests. **Must pass before every commit or PR** |
| `npm run typecheck` · `npm run lint` · `npm test` | Each check on its own (`npm run test:watch` to watch) |
| `npm run doctor` | expo-doctor |
| `npm run publish:demo` | EAS Update to the `demo` branch (needs the Expo project owner's account) |

## Testing

```bash
npm run check                                                   # app: typecheck, lint, Vitest
npx vitest run path/to/file.test.ts                             # one test file
npx -y deno test --allow-env supabase/functions/_shared/        # Edge Function tests
npx -y deno check supabase/functions/*/index.ts                 # typecheck every Edge Function
npx expo export --platform ios --platform android --output-dir /tmp/huddle-export   # proves the bundle builds
```

Unit tests are pure TypeScript and run in Node: the risk engine, escalation state machine, route status, guidance, health model and more. Logic lives in modules with no `react-native` imports so it can be tested and shared with the server.

**Live smoke tests:** use the seeded demo accounts in a throwaway Huddle and clean up with Reset demo. Never call `ai-phone-call`, `call-contacts` or `test-call` in tests, and never let an alert go past the group alert: those steps ring and text real phones.

## Running the demo

The demo is the **Campus Walk**, from the Bahen Centre (University of Toronto) to St. George Station, on 3 to 4 phones: a host who runs Demo Control, a group member, the person who may need support, and their trusted contact.

- **Demo Control** (`/demo-control`) has every demo action, plus an **automated story**: tap *Reset demo*, *Move affected user away*, then *Run the rest automatically* to play the whole escalation with narration.
- **Seeded accounts** (`host@`, `member@`, `affected@`, `contact@jam.demo`, password `jam-demo-1234`) need `EXPO_PUBLIC_ENABLE_DEV_LOGIN=true`.

Step-by-step plan and fallbacks: [docs/demo.md](docs/demo.md) · checklist: [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md).

## Data sources

Toronto data is extracted citywide and bundled with the app (nothing is fetched from the portal at runtime). The in-app list, with what each dataset can and can't tell us, is on the **Data sources** screen.

| Source | Used for |
|---|---|
| [TTC Routes and Schedules (GTFS)](https://open.toronto.ca/dataset/ttc-routes-and-schedules/) | Subway stations, stops and lines |
| [Pedestrian Network](https://open.toronto.ca/dataset/pedestrian-network/) | Sidewalks and walkways |
| [Toronto Centreline](https://open.toronto.ca/dataset/toronto-centreline-tcl/) | Street names for spoken directions |
| [Library Branch General Information](https://open.toronto.ca/dataset/library-branch-general-information/) | Libraries as public support points |
| [Parks and Recreation Facilities](https://open.toronto.ca/dataset/parks-and-recreation-facilities/) | Community centres and parks |
| [Washroom Facilities](https://open.toronto.ca/dataset/washroom-facilities/) | Public washrooms |
| [School Locations](https://open.toronto.ca/dataset/school-locations-all-types/) | Schools and university buildings |
| [Police Facility Locations](https://open.toronto.ca/dataset/police-facility-locations/) | Police facilities |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL) | Hospitals, walking routes (OSRM), places outside Toronto (Overpass), place names (Nominatim, Photon) |
| [CDC NHANES 2017 to March 2020](https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?Cycle=2017-2020) | Health model and normal heart-rate ranges |

The TTC disruption shown in the demo is scripted, not live data. Regenerating the city data: [src/features/map/README.md](src/features/map/README.md).

## Documentation

| Doc | What's in it |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Detailed engineering guide: every feature, the state machine, design system, rules |
| [docs/architecture.md](docs/architecture.md) | App, Supabase, realtime, location, health, alert, ntfy and AI flows |
| [docs/data-model.md](docs/data-model.md) | Tables, relationships, RPCs, RLS |
| [docs/environment.md](docs/environment.md) | Setup, environment variables, phones, EAS Update |
| [docs/demo.md](docs/demo.md) | The multi-phone demo, step by step |
| [supabase/functions/README.md](supabase/functions/README.md) | Edge Function APIs |
| [ml/README.md](ml/README.md) | The NHANES health model |
| `src/features/*/README.md` | Per-area APIs |
| [docs/prompts/](docs/prompts/README.md) | Each team member's original brief |

## Ownership

| Area | Owner |
|---|---|
| App experience: sign-in, profile, consent, baseline, creating and joining a Huddle, lobby, Group and Settings tabs, home, theme | Andre Sidarous |
| Map, live location, routing, route deviation, Toronto civic data, support points, data sources | Shivam Murawala |
| Pulse health simulation, risk engine, escalation state machine, check-in, Lifeline AI call and recording | Sanae Faghfouri |
| Alerts, trusted contacts, ntfy, incident packages, notification settings, Demo Control, NHANES health model | Aditi Nahar |

## Known limitations

- **Simulated wearable.** Heart rate and activity are generated in the app. Real wearables need a development build.
- **Foreground location only.** Expo Go has no background location, so sharing pauses when the app is closed.
- **No server scheduler.** Escalation deadlines are stored in the database, but some member's open app has to tick them (`advance-alert`). Once the phone call starts, Twilio and the server finish on their own.
- **Not wired yet:** the "separated from the group" signal, and each person's own check-in delay (`profiles.checkin_buffer_seconds`); the Huddle's `checkin_delay_seconds` is used instead.
- **Public-but-unguessable realtime channels.** Broadcasts carry ids only. The upgrade path is private channels with RLS.
- **Prototype only.** Huddle is not emergency services, and the emergency button never dials.

No license has been chosen yet.

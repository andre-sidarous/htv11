<p align="center">
  <img src="assets/brand/logo-slogan.png" alt="Huddle" width="420">
</p>

<p align="center">
  A native app for groups and solo travellers who want someone watching out for them —
  without being watched over.
</p>

---

## What it is

Huddle is an Expo app for students, tourists, and friends travelling together — and for
anyone travelling alone. A group creates or joins a private Huddle, shares live location
while it's active, and sets a destination. If someone may need support, Huddle doesn't
jump straight to an alarm — it checks in with them, then tells the group, then calls them,
and only after that reaches their trusted contacts.

You don't need a group to use it. A **Solo Huddle** is just you: pick a destination (or
don't) and start. Pulse and Lifeline run exactly the same — the only difference is that
the "tell the group" step has nobody to notify, so it falls straight through to the AI
phone call and then your trusted contacts. It's built for the person walking home alone
at night as much as for a group of friends out together.

Nothing is shared, recorded, or sent to a contact without that person's consent. Huddle
never diagnoses a medical event, never labels a place as safe or unsafe, and never claims
to be emergency services.

The product was built around three features, with everything else — onboarding, the map,
group chat — supporting them.

| | |
|---|---|
| **Lifeline** | An automatic AI phone call that talks an unresponsive member toward their destination, using real walking directions and nearby public places. |
| **Safety Circle** | A step-by-step escalation — check-in, group alert, AI call, trusted contacts — backed by server-side timers so it keeps running even if every phone is closed. |
| **Pulse** | A simulated wearable feed and a deterministic, explainable scoring system that decides when a check-in is warranted. It is not machine learning, and it says so on screen. |

The full behaviour of each — state machines, timers, what the AI is and isn't allowed to
know — is documented in [`CLAUDE.md`](CLAUDE.md) and [`docs/architecture.md`](docs/architecture.md).

## Stack

Expo SDK 57 (React Native, Expo Router), running in Expo Go, written in TypeScript.
Supabase provides auth, Postgres with row-level security, Realtime, Storage, and Edge
Functions on Deno. Twilio places the Lifeline phone calls, Gemini writes what gets said
on them, and walking directions come from OSRM over OpenStreetMap data. Toronto Open Data
supplies the nearby-support-point lookups used by the demo route.

## Requirements

To run the app:
- **Node 22.12+** (the version in `.nvmrc`)
- A phone with **Expo Go** installed (App Store / Play Store), on the **SDK 57** release
- The phone and your computer reachable over the network (same Wi-Fi, or use the tunnel
  mode below)

To use real backend features rather than the built-in mocks, you also need:
- A free **[Supabase](https://supabase.com)** project, with the schema in
  `supabase/migrations/` applied and `supabase/seed.sql` run once for demo accounts
- To make Lifeline's AI call sound natural rather than fall back to a scripted line: a
  **Gemini API key** ([aistudio.google.com](https://aistudio.google.com/apikey))
- To actually ring a phone — the Lifeline call and trusted-contact notifications — a
  **Twilio** account and phone number

None of the above is required just to explore the app. With no Supabase project
configured, Huddle runs entirely on in-memory mocks: every screen works, on one device,
with nothing sent anywhere.

Full setup, including Supabase migrations, Edge Function secrets, and sign-in options, is
in [`docs/environment.md`](docs/environment.md).

## Getting started

```bash
npm install
cp .env.example .env     # fill in your Supabase URL and anon key, or leave blank for mocks
npm start                # scan the QR code in Expo Go
```

If your phone can't reach the dev machine over Wi-Fi, use `npm run start:tunnel` instead.

```bash
npm run check    # typecheck + lint + unit tests — must pass before a commit
npm run doctor   # expo-doctor, catches SDK/dependency drift
```

## Project layout

```
src/app/            Expo Router routes — thin, each one renders a screen from src/features
src/features/       screens and logic, grouped by area (auth, jams, map, health, ai, alerts, contacts)
src/components/     shared UI primitives and the Huddle brand components
src/lib/            shared types, constants, validation, and the Supabase/AI clients
src/services/       interface-first services with a real implementation and a mock
src/theme/          design tokens — colors, spacing, type
supabase/           migrations, RLS policies, and Edge Functions
docs/                architecture, data model, environment setup, demo script
```

`CLAUDE.md` is the canonical reference for how the app actually behaves — it's kept
current by design, so it's worth reading before the docs folder for anything you're
unsure about.

## A note on naming

The app was called **Jam** for most of its development and was renamed to **Huddle**
late — on purpose, only in what people see and hear. Route paths, database tables,
realtime channel names, the deep-link scheme, and the bundle identifier still say `jam`,
because renaming them would have meant breaking existing installs, QR codes, and the
database. If you're reading the source and wondering why a screen says "Huddle" but the
file is in `src/app/jam/[jamId]/`, that's why.

## Status

This was built in 36 hours by a small team, split by feature area (onboarding and Jam
management, the map, health signals and escalation, alerts and contacts). It's a working
prototype, not a production safety product — the state machines and consent model are
real and tested, but things like the "call emergency services" button are intentionally
a placeholder, not a live integration.

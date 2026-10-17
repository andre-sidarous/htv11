# Demo plan (4 phones)

Presentation-day checklist: [DEMO_CHECKLIST.md](../DEMO_CHECKLIST.md).

## Roles

Everyone signs in with their **own real account** (email code). The seeded accounts are only a backup.

| Presenter | Role | In the Jam? | Backup account (seed) |
|---|---|---|---|
| 1 | Host, runs **Demo Control** | yes | host@jam.demo (Priya) |
| 2 | Group member | yes | member@jam.demo (Daniel) |
| 3 | Affected user | yes | affected@jam.demo (Alex) |
| 4 | Emergency contact (gets the phone call + text) | **no** | contact@jam.demo (Sam) |

Backup password: `jam-demo-1234` (needs `EXPO_PUBLIC_ENABLE_DEV_LOGIN=true`).

## Before the demo (once)

1. **Supabase:** all migrations run in the SQL Editor (`supabase/migrations/*`, in order). Secrets set and every function deployed:
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy --use-api
   ```
2. **Twilio:** `TWILIO_FROM_NUMBER` is listed under the account's **Active numbers**, and **presenter 3's and presenter 4's numbers are Verified Caller IDs** (trial accounts can only call verified numbers). Canada/US are allowed under Voice → Geo permissions. On a trial, whoever picks up hears a short Twilio notice and must **press any key** first.
   **Presenter 3's profile has their phone number** (Profile → phone): that's the number Jam's AI calls.
3. **Sign-up on every phone:** profile, check-in buffer, consents. Presenter 3 turns on **all five** consents (location, health, AI call, recording, trusted-contact notifications) and picks **AI support call**, so the OS location and microphone permissions are granted now, not on stage.
4. **Presenter 3 → Trusted contacts:** add presenter 4 with their phone (`+1…`) and the **same email presenter 4 signs in with**, turn on location, health summary, and recording, and tap **Test call**. Presenter 4's phone should ring.
5. **Presenter 4:** sign in to Jam with that email. They don't join the Jam. The **Incidents** screen (`/incidents`) is where the package will appear.
6. Optional: everyone subscribes to the Jam's ntfy topic (Jam → Notifications → Copy topic → ntfy app).

## Setup on stage

1. Every phone opens Jam in **Expo Go** (SDK 57): `npm run start:tunnel` on the laptop, or an EAS Update published beforehand.
2. Presenter 1 creates "Campus Walk" (Bahen Centre → St. George Station). Presenters 2 and 3 join by QR or code.
3. Presenter 1 opens **Demo Control** (`/demo-control`), picks the Jam, then picks presenter 3 as the **Affected user**, then taps **1. Reset demo**.
4. Mirror presenter 1's or 2's phone to the projector (AirPlay / QuickTime, or scrcpy on Android).

## Sequence (Demo Control buttons in bold)

1. Everyone is on the shared map.
2. Presenter 3 confirms the destination and emergency preference and shares live location.
3. **Move affected user away**: the map shows route deviation.
4. **Trigger heart-rate spike** + **Trigger running**: baseline 75, now 145. Risk 3 + 2 + 1 = 6.
5. **Send check-in**: presenter 3 sees "Are you okay?" and doesn't answer. Demo Mode shortens their buffer (`DEMO_CHECKIN_TIMEOUT_MS`), or tap **Simulate no response**. The unanswered check-in brings risk to 9.
6. Presenters 1 and 2 get the in-app card "Alex may need support." (and an ntfy push). Nobody taps "I'm going to help". Tap **Simulate no group response** to skip the wait.
7. **Presenter 3's phone rings: a real call from Jam's AI.** Answer on speaker (hold it to the mic), press a key if the Twilio trial notice plays. The AI says their group couldn't reach them, asks if they're okay, and gives live walking directions from their current position (real street names, nearby public places). Talk to it: "How far is it?", "What's around me?". Saying anything stops the escalation; "I made it" ends the call and resolves the alert. The app shows "Jam is calling your phone". (No phone number / Twilio down → the app speaks the call itself instead.)
8. For the escalation path: presenter 3 answers and **stays silent** (two ~5s turns), or declines the call. Jam says it's notifying their trusted contacts and hangs up. **Simulate AI non-response** skips this.
9. **Presenter 4's phone rings** (Twilio), then they get a text with the last-seen location, why Jam was concerned, and a recording link. If P4's flow didn't fire it, tap **Send incident package**.
10. Presenters 1 and 2 see **View incident** on the alert card: map, reasons, recording, who it was shared with. Presenter 4 opens **Incidents** and sees their filtered view.
11. Jam shows: "This route has fewer nearby public support points and a current transit disruption. We recommend an alternative route."
12. **Resolve incident** (or "Mark safe" on the card): the alert resolves on every phone. Optionally **Delete package** on the incident screen to show the data deletion.

To run it again: **Reset demo** (host only). It clears alerts, incidents, notifications, health signals, and live locations for that Jam. Accounts, members, and contacts stay.

## When something fails

| If this fails | Fallback |
|---|---|
| Email sign-in (rate limit, no email) | seeded demo accounts |
| Gemini | scripted support-call lines (always on) |
| Twilio call or text | the incident package still appears in-app, and Notifications shows the reason. Show the SMS preview |
| ntfy | in-app alert cards only. Notifications shows "Unavailable" |
| OSRM | Campus Walk route labelled "Demo route" |
| Live GPS | simulated location (Demo Control moves people) |
| An app reloads mid-alert | alert cards recover from the database on reopen |
| Laptop / dev server | EAS Update published beforehand |
| Supabase entirely | `EXPO_PUBLIC_USE_MOCK_SERVICES=true` on one phone (single-device walkthrough) |

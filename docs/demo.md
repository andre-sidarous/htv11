# Demo plan (3 to 4 phones)

> P5 finalizes this document (fallbacks, `DEMO_CHECKLIST.md`). This is the foundation's plan.

## Setup

1. Each presenter signs in with their **own account**. Presenter 1 creates "Campus Walk" (Campus Walk preset: Bahen Centre to St. George Station), and the others join by code or QR. `supabase/seed.sql` adds a backup Jam (code `CAMPUS`) and four demo accounts, in case real sign-in fails.
2. Every phone runs the app in **Expo Go** (SDK 57), from the presenter laptop (`npm run start:tunnel`) or from an EAS Update published beforehand.
3. Presenter 1 opens Demo Mode → Demo Control and picks the affected user (presenter 3). Backup: the seeded accounts (password `jam-demo-1234`, with `EXPO_PUBLIC_ENABLE_DEV_LOGIN=true`).
4. Mirror one phone to the projector (AirPlay / QuickTime on Mac, or scrcpy on Android).

| Presenter | Role | Backup account (seed) | Backup name |
|---|---|---|---|
| 1 | Host | host@jam.demo | Priya |
| 2 | Group member | member@jam.demo | Daniel |
| 3 | Affected user | affected@jam.demo | Alex |
| 4 (optional) | Emergency contact | contact@jam.demo, or a simulated recipient | Sam |

The Demo Control panel (P5) runs on presenter 1's phone.

## Sequence

1. Presenter 1 signs in and creates "Campus Walk" (or loads the seeded Jam from Demo Mode).
2. Presenters 2 and 3 join by code or QR. Everyone appears on the shared map.
3. Presenter 3 confirms the destination and emergency preference, and shares live location.
4. **Move affected user away** (simulated location). The map shows route deviation.
5. **Heart-rate spike + running**: baseline 75, current 145. Risk is 3 + 2 + 1 = 6, which is the group-alert range.
6. Jam asks "Are you okay?" Presenter 3 doesn't answer. The unanswered check-in adds +3, for a total of 9, so it escalates.
7. Everyone gets the in-app alert (with haptics), and nobody acknowledges.
8. The AI support call starts and speaks "Hi, this is Jam. Your group could not reach you. Are you safe?" The screen shows "Recording enabled under your emergency preference."
9. Presenter 3 stays unresponsive, and the incident package is created.
10. Members are notified in-app (and through ntfy if configured). The map shows the last known location.
11. Jam shows: "This route has fewer nearby public support points and a current transit disruption. We recommend an alternative route."
12. Presenter marks the user safe. The alert resolves, and the deletion status appears.

## Everything must work without third parties

| If this fails | Fallback |
|---|---|
| Google / email sign-in | seeded demo accounts |
| Gemini | scripted support-call lines (always available) |
| ntfy | in-app alerts only, with status shown |
| OSRM | predefined Campus Walk route labelled "Demo route" |
| Live GPS | simulated location source (demo actions move people) |
| Laptop / dev server | EAS Update published beforehand |
| Supabase entirely | `EXPO_PUBLIC_USE_MOCK_SERVICES=true` on one phone (single-device walkthrough) |

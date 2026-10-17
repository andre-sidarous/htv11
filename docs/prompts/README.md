# Jam prompts (Expo edition)

The team switched from a web app to a **native Expo app running in Expo Go**. The product, features, ownership, demo flow, and tone are unchanged. Only the stack changed:

| Was (web plan) | Now (Expo) |
|---|---|
| Next.js App Router pages | Expo Router screens in `src/app` |
| Tailwind CSS | `src/theme` tokens + `StyleSheet` |
| Leaflet / React Leaflet | `react-native-maps` via `JamMapView` |
| Browser Geolocation | `expo-location` (foreground) |
| Browser SpeechSynthesis | `expo-speech` |
| MediaRecorder | `expo-audio` |
| QR libraries | `react-native-qrcode-svg` (show), `expo-camera` (scan) |
| Next.js `/api` server routes | Supabase **Edge Functions** (`supabase/functions`) |
| `NEXT_PUBLIC_*` env | `EXPO_PUBLIC_*` env (public). Secrets in Supabase function secrets |
| Google OAuth web redirect | Demo accounts + email 6-digit code first. Google optional |
| iOS audio unlock, Wake Lock API | Not needed / `expo-keep-awake` |
| SMS preview only | Order: check-in → (per-person buffer) group alert → AI call that guides + records → (45s silence) **Twilio call + text** to trusted contacts + incident package to the group (`call-contacts`) |
| HTTPS URL on phones, Vercel | Expo Go (`npm start` / `--tunnel`), EAS Update for demo day |

| Person | Prompt | Branch |
|---|---|---|
| P1 | done: the foundation (this branch) | `setup/foundation` |
| P2 | [prompt-2-ui-onboarding.md](prompt-2-ui-onboarding.md) | `feature/ui-onboarding` |
| P3 | [prompt-3-maps-location-data.md](prompt-3-maps-location-data.md) | `feature/maps-location-data` |
| P4 | [prompt-4-health-risk-ai.md](prompt-4-health-risk-ai.md) | `feature/health-risk-ai` |
| P5 | [prompt-5-alerts-contacts-demo.md](prompt-5-alerts-contacts-demo.md) | `feature/alerts-contacts-demo` |

## Workflow

1. The foundation merges to `main` first.
2. Everyone runs: `git checkout main && git pull origin main && git checkout -b feature/<name>`. Branch from `main`, never from someone else's unfinished branch.
3. `npm install`, then `cp .env.example .env` and paste the shared values. Then `npm start` and open the app in Expo Go (SDK 57).
4. Work only in your area. Commit small. Run `npm run check` (typecheck + lint + tests) and `npm run doctor` before every PR.
5. Open a PR. One teammate reviews it. Merge one branch at a time and rebase the others after each merge.
6. Integration checkpoint around hour 24: merge P2 + P3 first, then P4, then P5. Keep the last ~6 hours for end-to-end testing and rehearsal, not new features.

**Contracts freeze:** `src/lib/types`, `supabase/migrations`, event payloads, and service interfaces change only through a small PR that tags the whole team. Adding new optional fields or new types is fine.

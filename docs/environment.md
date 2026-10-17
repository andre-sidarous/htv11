# Environment setup

## 1. Install and run (everyone)

Requires **Node 22.12+** (see `.nvmrc`) and the **Expo Go** app on your phone (App Store / Play Store). Expo Go must support **SDK 57** (App Store version 57.x). We stay on 57 because the iOS App Store build of Expo Go lags new SDKs; don't upgrade Expo packages without the team.

```bash
npm install
cp .env.example .env          # paste the shared values (see §3)
npm start                     # scan the QR code with the Camera app (iOS) or Expo Go (Android)
npm run start:tunnel          # use this if your phone isn't on the same Wi-Fi as your laptop
```

With no env values at all, the app still runs on mocks. Open **Developer check** from the home screen.

Every PR must pass:

```bash
npm run check     # typecheck + lint + unit tests
npm run doctor    # expo-doctor: native dependency sanity
```

Install native libraries with `npx expo install <pkg>`, **not** `npm install`. That picks the version Expo Go 57 ships. A native module that isn't in Expo Go will crash the app, so check with the team first.

## 2. Supabase project (done once, by one person)

1. Create a project at supabase.com. Pick the region nearest you (Canada Central for Toronto).
2. **Apply migrations**, using either option:
   - **CLI:** `npx supabase login`, then `npx supabase link --project-ref <ref>`, then `npx supabase db push`.
   - **Dashboard:** SQL Editor → run `supabase/migrations/20261017000001_initial_schema.sql`, then `..._rls.sql`, in order.
3. **Seed the demo** by running `supabase/seed.sql` in the SQL Editor. It creates 4 test accounts and the Campus Walk Jam. Run it again any time to reset the demo.
4. **Deploy the Edge Functions:**
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # fill GEMINI_API_KEY etc.
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy
   ```
5. Under **Authentication → URL Configuration**:
   - Site URL: `jam://`
   - Redirect URLs: add `exp://**` (Expo Go) and `jam://**` (future standalone builds).
6. Under **Authentication → Providers → Email**, keep it enabled. Under **Authentication → Email Templates → Magic Link**, make sure the body includes `{{ .Token }}` so emails carry a **6-digit code** (the app types the code in; it doesn't open links). For the hackathon you can also turn **Confirm email** off.
7. **Email limits:** Supabase's built-in email sends only a few messages per hour. Prefer the seeded demo accounts, or add custom SMTP (e.g. Resend) under Authentication → SMTP.

## Sign-in options

| Method | Reliability in Expo Go | Setup |
|---|---|---|
| Seeded demo accounts (`host@`, `member@`, `affected@`, `contact@jam.demo`, password `jam-demo-1234`) | Best | Run `seed.sql`, set `EXPO_PUBLIC_ENABLE_DEV_LOGIN=true` |
| Email 6-digit code (creates the account on first use) | Good | Step 6 above |
| Google | Works, but fiddly | See below |

**Google OAuth (optional):**
1. Google Cloud Console → OAuth consent screen. Choose External, set it to *Testing*, and add all 4 teammates' Gmail addresses as test users.
2. Credentials → OAuth client ID → **Web application**. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Paste the client ID and secret into Supabase → Authentication → Providers → Google.
4. The app opens Google in the system browser and returns via an `exp://...` URL, which `exp://**` in the redirect list allows.

**Never run `seed.sql` on a production project.**

## 3. Environment variables

**App (`.env`, bundled into the app, all public):**

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes (else mocks) | Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes (else mocks) | The **anon / publishable** key. Never the service_role key. |
| `EXPO_PUBLIC_ENABLE_DEV_LOGIN` | no | `true` shows demo-account sign-in |
| `EXPO_PUBLIC_USE_MOCK_SERVICES` | no | `true` forces mocks (single device) |
| `EXPO_PUBLIC_OSRM_URL` | no | e.g. `https://routing.openstreetmap.de/routed-foot`. Blank uses the demo route. |

**Edge Functions (`supabase/functions/.env`, uploaded with `supabase secrets set`, never in the app):**

| Variable | Notes |
|---|---|
| `GEMINI_API_KEY` | aistudio.google.com/apikey. Blank uses the scripted AI. |
| `GEMINI_MODEL` | defaults to `gemini-2.5-flash` |
| `NTFY_BASE_URL` | `https://ntfy.sh` |
| `NTFY_TOKEN` | only for a protected or self-hosted ntfy |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically, so nobody needs the service-role key locally.

Share the app `.env` values privately (DM or a password manager). `.env` files are gitignored.

## 4. Testing on phones

- Phones and laptop on the same Wi-Fi: `npm start`. Different networks, or campus Wi-Fi that blocks device-to-device traffic: `npm run start:tunnel`.
- Each teammate can run their own dev server, or one laptop serves everyone.
- The first launch asks for location, camera, and microphone permissions. The permission text comes from `app.json`.
- Keep the screen awake during a Jam with `expo-keep-awake`. Tracking is foreground-only.

## 5. Demo day without a laptop (optional)

Expo Go loads the app from a dev server. To avoid depending on a laptop on stage, publish an update with EAS:

```bash
npm i -g eas-cli && eas login
eas update:configure
eas update --branch demo --message "demo build"
```

Then open the update in Expo Go from the link or QR that EAS prints. Run this at least once before demo day.

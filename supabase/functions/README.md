# Edge Functions (server side)

The app is native (Expo), so anything that needs a secret runs here instead of in the app.
Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` automatically.
Our own secrets come from `supabase secrets set` (see `.env.example` in this folder).

| Function | Owner | Called from the app via |
|---|---|---|
| `advance-alert` | P4 | `advanceAlert(alertId)` in `src/lib/supabase/functions.ts` |
| `ai-support-call` | P4 | `getSupportCallTurn(context, step)` (scripted fallback built in) |
| `incident-token` | P4 | `ensureIncidentPackage` (saves the contact token for `getIncidentAccess`) |
| `notify-ntfy` | P5 | `notifyNtfy(jamId, alertId)` |
| `call-contacts` | P5 | Last step: incident package + Twilio call and text to contacts + ntfy to group. `escalateToContacts` is also run by `advance-alert` at CONTACTS_NOTIFIED |
| `test-call` | P5 | Rings one of your own trusted contacts with a short test message (Contacts screen button) |
| `incident-access` | P5 | List / read / delete incident packages; members via RLS, trusted contacts by sign-in email, filtered by their toggles |
| `demo-reset` | P5 | Host only: clears one Jam's alerts, incidents, notifications, health signals, and live locations |
| `incident-access` (to add) | P5 | contact view of `/incident/[token]` |
| `demo-reset` (to add) | P5 | Demo Control "Reset demo" |

Rules: verify the caller with `requireUser(req)`; check access with the **user** client (RLS) before
touching anything with `adminClient()`; never return secrets; `_shared/constants.ts` must match
`src/lib/constants`.

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase secrets set --env-file supabase/functions/.env   # GEMINI_API_KEY, NTFY_TOKEN, ...
npx supabase functions deploy                                  # deploys every function
npx supabase functions serve                                   # local (needs Docker)
```

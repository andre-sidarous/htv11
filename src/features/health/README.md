# health — owner: P4

Simulated wearable, risk engine, escalation state machine, check-in, safety controls.

| File | What |
|---|---|
| `escalation.ts` | Pure `transition(state, event, now, config)`. The block between BEGIN/END SHARED is copied verbatim to `supabase/functions/_shared/escalation.ts`; `escalation.test.ts` fails if they drift. |
| `alertActions.ts` | The only way to move an alert: `createCheckInAlert`, `dispatchAlertEvent`, `advanceDueAlert`. Compare-and-set; the winner broadcasts `alert_updated` and runs side effects (`notificationService.notifyGroup`, incident fallback). |
| `alertRepository.ts` | Supabase (RLS) or in-memory (mock mode, one phone) persistence. |
| `useSafetyEngine.ts` | Runs on every phone in a Jam (mounted by `CheckInOverlay`): syncs open alerts, ticks due deadlines via `advance-alert`. On the affected phone: streams the simulated wearable, scores risk, opens the alert, adopts demo scenarios, opens the AI call, builds the incident package. |
| `CheckInOverlay.tsx` / `SafetyControls.tsx` | "Are you okay?" sheet and the always-visible "I'm safe" / "Cancel escalation" / "Call emergency services" (placeholder, never dials). |
| `useHealthDemoActions.ts` | P4 demo actions (owner `"health"`), all targeting `getDemoContext()`. |

**For P5:** acknowledge with `dispatchAlertEvent(alert, { type: "GROUP_ACK" })` (valid from `GROUP_ALERT_SENT`).
`alert_created` / `alert_updated` broadcasts carry ids and states only (`reasons: []`): re-read the
`alerts` row through RLS for the reasons.

**Incident token for presenter 4:** `await getIncidentAccess(alertId)` (`@/features/ai/incidents`) returns
`{ incidentId, token }` on any member's phone. Build the `/incident/[token]` link from it. It's saved by the
`incident-token` Edge Function as a `notification_events` row (`channel: "sms_preview"`, `status: "skipped"`,
`detail` = JSON `{"type":"incident_access",...}`). Skip these rows when showing "last notification sent".

Timers: check-in and group timeouts come from the Jam (`checkin_delay_seconds`,
`group_response_timeout_seconds`); `contact_only_alert` or no `ai_call_consent` skips the AI call.
Health signals are only streamed, broadcast, stored, and scored with `health_consent`.

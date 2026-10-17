# ai — owner: P4

AI support call screen, recording, incident package creation. Gemini only via the `ai-support-call` Edge Function.

- `SupportCallScreen.tsx`: speaks each turn with `expo-speech` (rate 0.95) and always shows it large on screen. 6s to tap "I can hear you" after each line; no response after the last line → `AI_CALL_USER_UNRESPONSIVE` → incident package → `CONTACTS_NOTIFIED`.
- `callContext.ts`: the only data the model sees (location *summary*, never coordinates or history).
- `useCallRecording.ts`: `expo-audio`, only with `recording_consent`, always visible with a timer and stop control. Uploads to `recordings/{userId}/{alertId}.m4a`. Permission denied / failure → `simulated://…` reference.
- `incidents.ts`: `ensureIncidentPackage(alertId)`, once per alert. Built on the affected phone when alive (members + consented trusted contacts + recording); otherwise the phone that advanced the alert builds a members-only package. Only the SHA-256 of the access token is stored.

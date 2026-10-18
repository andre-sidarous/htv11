# Demo checklist

Full plan: [docs/demo.md](docs/demo.md).

## The day before

- [ ] All migrations run in the Supabase SQL Editor, in order
- [ ] `npx supabase secrets set --env-file supabase/functions/.env` and `npx supabase functions deploy --use-api` done
- [ ] Twilio: presenter 4's number verified; **Test call** rings it
- [ ] Gemini key set (otherwise the scripted lines play, which is fine)
- [ ] An EAS Update published as a backup to the laptop tunnel, and tested on one phone
- [ ] A backup screen recording of the full flow

## Every phone

- [ ] Expo Go updated (SDK 57) and Jam opens
- [ ] Charged, and Auto-Lock / screen timeout turned off
- [ ] Volume up, silent mode off (the AI call speaks out loud)
- [ ] Signed in with the presenter's own account
- [ ] Location, microphone, and camera permissions granted ahead of time (sign-up asked for them)
- [ ] Notifications allowed for ntfy (optional)

## Presenter 3 (affected user)

- [ ] All five consents on, emergency preference **AI support call**
- [ ] Presenter 4 saved as a trusted contact with phone, the email they sign in with, and all three sharing toggles on

- [ ] **Health profile** filled in (Home → Health profile): age, e.g. asthma + family history of heart disease, *Are you vulnerable?* on with a medical card photo
- [ ] Recording and trusted-contact consents on in this Huddle (Demo Control warns otherwise)

## Presenter 4 (emergency contact)

- [ ] Signed in with the email presenter 3 saved
- [ ] Phone not on Do Not Disturb (it must ring)

## Automated story (Demo Control)

- [ ] Presenter 1 opened the Huddle once (map/health actions load), then Settings → Demo this Huddle
- [ ] Affected user picked; no warnings under the Automated demo card
- [ ] Huddle created with **Everyone picks their own**; each person picked a destination when joining
- [ ] Presenter 3 opened the Map tab once (their planned route is saved; the panel warns otherwise)
- [ ] 1. Reset demo → 2. ▶ Run the story
- [ ] During the call, presenter 3 taps two or three replies, then stops (that's what sends the incident)

## Right before going on stage

- [ ] Jam created; presenters 2 and 3 joined (QR or code)
- [ ] Demo Control: correct Jam selected, presenter 3 picked as **Affected user**
- [ ] **Reset demo** tapped
- [ ] Projector mirroring works

## After a run

- [ ] **Reset demo** before running again

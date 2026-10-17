// POST /functions/v1/test-call  { contactId } -> NotificationResult
//
// Places a short "this is a test" call to one of the caller's own trusted contacts, so people can
// check Twilio and the contact's number before a real Jam. RLS on trusted_contacts means you can
// only test your own contacts. Nothing about any alert, location, or health is said.
import { buildTwiml, toE164 } from "../_shared/callScript.ts";
import { isUuid, json, requireUser, serve } from "../_shared/supabase.ts";
import { placeCall, twilioConfig } from "../_shared/twilio.ts";

serve(async (req, body) => {
  const contactId = body.contactId;
  if (!isUuid(contactId)) return json({ channel: "voice_call", status: "failed", detail: "invalid_contact_id" }, 400);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  // Owner-only through RLS.
  const { data: contact } = await auth.supabase.from("trusted_contacts").select("name, phone_number").eq("id", contactId).maybeSingle();
  if (!contact) return json({ channel: "voice_call", status: "failed", detail: "Contact not found" }, 404);
  const to = toE164(contact.phone_number);
  if (!to) return json({ channel: "voice_call", status: "skipped", detail: "This contact has no phone number" });

  const twilio = twilioConfig();
  if (!twilio) return json({ channel: "voice_call", status: "skipped", detail: "Phone calls aren't set up (Twilio secrets missing)" });

  const { data: profile } = await auth.supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
  const owner = profile?.display_name ?? "A Jam user";
  const message =
    `Hello ${contact.name}. This is a test call from Jam, a group travel safety app. ` +
    `${owner} added you as a trusted contact. If ${owner} ever stops responding during a Jam, ` +
    "you will get a call like this one, followed by a text with details. No action is needed now. Goodbye.";

  const call = await placeCall(twilio, to, buildTwiml(message));
  return json(
    call.ok
      ? { channel: "voice_call", status: "sent", detail: `Calling ${contact.name} now` }
      : { channel: "voice_call", status: "failed", detail: call.detail },
  );
});

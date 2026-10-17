// The last escalation step, after 10s of silence on the AI support call (CONTACTS_NOTIFIED):
//   1. build the incident package (last-seen location, health summary, recording, recipients)
//   2. phone each trusted contact (Twilio voice)
//   3. text each contact the last-seen location, summary, and recording link they're allowed to get
//   4. ping the group (ntfy; the app also shows the package in-app)
// Used by call-contacts (the affected phone, with its recording) and advance-alert (server fallback,
// e.g. the affected phone died). Idempotent: one package per alert, each contact called/texted once.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildCallMessage, buildSmsMessage, buildTwiml, describePlace, toE164 } from "./callScript.ts";
import { publishNtfy } from "./ntfy.ts";
import { placeCall, sendSms, twilioConfig } from "./twilio.ts";

type Channel = "voice_call" | "sms" | "ntfy" | "in_app";
type Result = { channel: Channel; status: "sent" | "skipped" | "failed"; detail?: string };

const GEOCODE_TIMEOUT_MS = 3_000;
const RECORDING_LINK_TTL_S = 24 * 60 * 60;

async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${latitude}&lon=${longitude}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Huddle-hackathon/0.1 (group travel safety prototype)" },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    return res.ok ? describePlace(await res.json()) : null;
  } catch {
    return null;
  }
}

/** Recordings must sit in the affected user's own folder: "{userId}/...". */
const isOwnRecording = (path: unknown, userId: string): path is string =>
  typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..") && path.length <= 300;

export async function escalateToContacts(
  admin: SupabaseClient,
  alertId: string,
  opts: { recordingPath?: unknown } = {},
): Promise<Result[]> {
  const { data: alert } = await admin
    .from("alerts")
    .select("id, jam_id, affected_user_id, reasons, resolved_at")
    .eq("id", alertId)
    .maybeSingle();
  if (!alert) return [{ channel: "in_app", status: "failed", detail: "alert_not_found" }];
  if (alert.resolved_at) return [{ channel: "in_app", status: "skipped", detail: "alert_resolved" }];
  const userId = alert.affected_user_id as string;

  const [{ data: jam }, { data: member }, { data: profile }, { data: members }] = await Promise.all([
    admin.from("jams").select("id, ntfy_topic, destination_name").eq("id", alert.jam_id).single(),
    admin
      .from("jam_members")
      .select("location_consent, health_consent, recording_consent, contact_notify_consent")
      .eq("jam_id", alert.jam_id)
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    admin.from("jam_members").select("user_id").eq("jam_id", alert.jam_id).eq("is_active", true).neq("user_id", userId),
  ]);
  if (!jam) return [{ channel: "in_app", status: "failed", detail: "jam_not_found" }];
  const personName = profile?.display_name ?? "Your contact";

  // Rows only exist when the person consented, but check the consent flags anyway.
  const [{ data: loc }, { data: health }] = await Promise.all([
    member?.location_consent
      ? admin.from("live_locations").select("latitude, longitude, accuracy, last_seen_at").eq("jam_id", jam.id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    member?.health_consent
      ? admin
          .from("health_signals")
          .select("heart_rate, baseline_heart_rate, activity, movement_state, created_at")
          .eq("jam_id", jam.id)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const reasons = Array.isArray(alert.reasons) ? (alert.reasons as string[]) : [];

  // Contacts are only involved with contact_notify_consent (given at sign-up / join).
  const { data: contactRows } = member?.contact_notify_consent
    ? await admin
        .from("trusted_contacts")
        .select("id, name, phone_number, receive_location, receive_health_summary, receive_recording")
        .eq("owner_user_id", userId)
        .neq("confirmation_status", "declined")
    : { data: [] };
  const contacts = contactRows ?? [];

  const place = loc ? await reverseGeocode(loc.latitude, loc.longitude) : null;

  // ---- 1. Incident package (one per alert) ----
  const recordingPath = member?.recording_consent && isOwnRecording(opts.recordingPath, userId) ? opts.recordingPath : null;
  let { data: pkg } = await admin
    .from("incident_packages")
    .select("id, recording_url")
    .eq("alert_id", alertId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pkg) {
    const { data: created } = await admin
      .from("incident_packages")
      .insert({
        alert_id: alertId,
        affected_user_id: userId,
        location_snapshot: loc
          ? { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy ?? undefined, capturedAt: loc.last_seen_at, place }
          : null,
        health_summary: member?.health_consent
          ? {
              reasons,
              heartRate: health?.heart_rate ?? null,
              baselineHeartRate: health?.baseline_heart_rate ?? null,
              activity: health?.activity ?? null,
              movementState: health?.movement_state ?? null,
              capturedAt: health?.created_at ?? null,
            }
          : null,
        route_summary: { destinationName: jam.destination_name ?? null },
        recording_url: recordingPath,
        recipients: [
          ...(members ?? []).map((m) => ({ type: "member", userId: m.user_id })),
          ...contacts.map((c) => ({ type: "contact", contactId: c.id })),
        ],
      })
      .select("id, recording_url")
      .maybeSingle();
    // A concurrent call may have won the unique index; read its row instead.
    pkg = created ?? (await admin.from("incident_packages").select("id, recording_url").eq("alert_id", alertId).is("deleted_at", null).maybeSingle()).data;
  } else if (recordingPath && !pkg.recording_url) {
    await admin.from("incident_packages").update({ recording_url: recordingPath }).eq("id", pkg.id);
    pkg = { ...pkg, recording_url: recordingPath };
  }
  const results: Result[] = [
    pkg ? { channel: "in_app", status: "sent", detail: `incident:${pkg.id}` } : { channel: "in_app", status: "failed", detail: "incident_not_created" },
  ];

  // ---- 2 + 3. Call, then text, each contact ----
  const log = (channel: Channel, status: Result["status"], detail: string) =>
    admin.from("notification_events").insert({ jam_id: jam.id, alert_id: alertId, channel, status, detail });

  const reachable = contacts.filter((c) => toE164(c.phone_number));
  const twilio = twilioConfig();
  if (!member?.contact_notify_consent) {
    await log("voice_call", "skipped", "no_contact_consent");
    results.push({ channel: "voice_call", status: "skipped", detail: "No consent to contact their trusted contacts" });
  } else if (reachable.length === 0) {
    await log("voice_call", "skipped", "no_contacts_with_phone");
    results.push({ channel: "voice_call", status: "skipped", detail: "No trusted contacts with a phone number" });
  } else if (!twilio) {
    await log("voice_call", "skipped", "twilio_not_configured");
    results.push({ channel: "voice_call", status: "skipped", detail: "Phone calls aren't set up (Twilio)" });
  } else {
    const { data: done } = await admin
      .from("notification_events")
      .select("channel, detail")
      .eq("alert_id", alertId)
      .in("channel", ["voice_call", "sms"])
      .eq("status", "sent");
    const already = new Set((done ?? []).map((r) => `${r.channel}:${/contact:([0-9a-f-]{36})/.exec(r.detail ?? "")?.[1]}`));

    const recordingUrl =
      pkg?.recording_url && reachable.some((c) => c.receive_recording)
        ? (await admin.storage.from("recordings").createSignedUrl(pkg.recording_url, RECORDING_LINK_TTL_S)).data?.signedUrl ?? null
        : null;
    const minutesAgo = loc ? Math.max(0, Math.round((Date.now() - new Date(loc.last_seen_at).getTime()) / 60_000)) : null;

    for (const contact of reachable) {
      const to = toE164(contact.phone_number)!;
      const allowed = {
        place: contact.receive_location && loc ? place ?? "shown in the text we are sending you" : null,
        reasons: contact.receive_health_summary ? reasons : null,
      };

      if (already.has(`voice_call:${contact.id}`)) {
        results.push({ channel: "voice_call", status: "skipped", detail: `Already called ${contact.name}` });
      } else {
        const twiml = buildTwiml(
          buildCallMessage({ contactName: contact.name, personName, placeDescription: allowed.place, reasons: allowed.reasons, textFollows: true }),
        );
        const call = await placeCall(twilio, to, twiml);
        // Log the contact id and Twilio sid only: never the phone number.
        await log("voice_call", call.ok ? "sent" : "failed", `contact:${contact.id} ${call.ok ? `call:${call.sid}` : call.detail}`);
        results.push(call.ok ? { channel: "voice_call", status: "sent", detail: `Calling ${contact.name}` } : { channel: "voice_call", status: "failed", detail: call.detail });
      }

      if (already.has(`sms:${contact.id}`)) {
        results.push({ channel: "sms", status: "skipped", detail: `Already texted ${contact.name}` });
      } else {
        const body = buildSmsMessage({
          personName,
          location: contact.receive_location && loc ? { latitude: loc.latitude, longitude: loc.longitude, placeDescription: place, minutesAgo } : null,
          reasons: allowed.reasons,
          recordingUrl: contact.receive_recording ? recordingUrl : null,
        });
        const sms = await sendSms(twilio, to, body);
        await log("sms", sms.ok ? "sent" : "failed", `contact:${contact.id} ${sms.ok ? `sms:${sms.sid}` : sms.detail}`);
        results.push(sms.ok ? { channel: "sms", status: "sent", detail: `Texted ${contact.name}` } : { channel: "sms", status: "failed", detail: sms.detail });
      }
    }
  }

  // ---- 4. Group ping (once per alert) ----
  const { data: pinged } = await admin
    .from("notification_events")
    .select("id")
    .eq("alert_id", alertId)
    .eq("channel", "ntfy")
    .eq("status", "sent")
    .eq("detail", "incident")
    .limit(1);
  results.push(pinged?.length ? { channel: "ntfy", status: "skipped", detail: "Group already notified" } : await publishNtfy(admin, jam, alertId, "urgent", "incident"));

  return results;
}

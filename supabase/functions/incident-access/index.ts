// POST /functions/v1/incident-access
//   { }                              -> { incidents: IncidentSummary[] }   packages shared with me
//   { incidentId }                   -> { incident: IncidentView }         one package, filtered for me
//   { incidentId, action: "delete" } -> { deleted: true }                  wipe it + its recording
//
// Who may read a package:
//   - the affected user and listed Jam members (RLS on incident_packages decides), and
//   - a trusted contact listed in recipients, matched by the email they signed in with
//     (trusted_contacts.email). Contacts only get what their receive_* toggles allow.
// Recordings are private; readers get a 1-hour signed URL. Phone numbers are never returned.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, isUuid, json, requireUser, serve } from "../_shared/supabase.ts";

const RECORDING_URL_TTL_S = 60 * 60;

type Role = "self" | "member" | "contact";
type Allowed = { location: boolean; health: boolean; recording: boolean };
type Pkg = {
  id: string;
  alert_id: string;
  affected_user_id: string;
  location_snapshot: Record<string, unknown> | null;
  health_summary: Record<string, unknown> | null;
  route_summary: Record<string, unknown> | null;
  recording_url: string | null;
  recipients: { type: string; userId?: string; contactId?: string }[];
  retention_hours: number;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
};

const PKG_COLUMNS =
  "id, alert_id, affected_user_id, location_snapshot, health_summary, route_summary, recording_url, recipients, retention_hours, expires_at, deleted_at, created_at";
const isLive = (p: Pkg) => !p.deleted_at && new Date(p.expires_at).getTime() > Date.now();

/** Contact rows (any owner) listing this email. Emails are stored lowercased. */
async function contactIdsForEmail(admin: SupabaseClient, email: string | undefined) {
  if (!email) return [];
  const { data } = await admin
    .from("trusted_contacts")
    .select("id, receive_location, receive_health_summary, receive_recording")
    .eq("email", email.toLowerCase())
    .neq("confirmation_status", "declined");
  return data ?? [];
}

async function view(admin: SupabaseClient, pkg: Pkg, role: Role, allowed: Allowed) {
  const [{ data: alert }, { data: person }] = await Promise.all([
    admin.from("alerts").select("jam_id, reasons, resolved_at, created_at").eq("id", pkg.alert_id).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", pkg.affected_user_id).maybeSingle(),
  ]);
  const memberIds = pkg.recipients.filter((r) => r.type === "member" && r.userId).map((r) => r.userId!);
  const { data: members } = memberIds.length
    ? await admin.from("profiles").select("display_name").in("id", memberIds)
    : { data: [] };

  const recordingUrl =
    allowed.recording && pkg.recording_url
      ? (await admin.storage.from("recordings").createSignedUrl(pkg.recording_url, RECORDING_URL_TTL_S)).data?.signedUrl ?? null
      : null;

  return {
    id: pkg.id,
    alertId: pkg.alert_id,
    jamId: alert?.jam_id ?? null,
    role,
    personName: person?.display_name ?? "A Jam member",
    createdAt: pkg.created_at,
    alertCreatedAt: alert?.created_at ?? null,
    expiresAt: pkg.expires_at,
    retentionHours: pkg.retention_hours,
    alertResolved: Boolean(alert?.resolved_at),
    location: allowed.location ? pkg.location_snapshot : null,
    health: allowed.health ? pkg.health_summary : null,
    reasons: allowed.health && Array.isArray(alert?.reasons) ? alert.reasons : null,
    destinationName: (pkg.route_summary?.destinationName as string | null | undefined) ?? null,
    hasRecording: Boolean(pkg.recording_url),
    recordingUrl,
    sharedWith: {
      members: (members ?? []).map((m) => m.display_name as string),
      contacts: pkg.recipients.filter((r) => r.type === "contact").length,
    },
    canDelete: role !== "contact",
    canResolve: role !== "contact",
  };
}

serve(async (req, body) => {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const admin = adminClient();
  const contacts = await contactIdsForEmail(admin, auth.user.email);

  // ---- list: everything shared with me ----
  if (body.incidentId === undefined) {
    const { data: mine } = await auth.supabase.from("incident_packages").select(PKG_COLUMNS).order("created_at", { ascending: false }).limit(20);
    const byId = new Map<string, { pkg: Pkg; role: Role }>();
    for (const p of (mine ?? []) as Pkg[]) byId.set(p.id, { pkg: p, role: p.affected_user_id === auth.user.id ? "self" : "member" });
    for (const c of contacts) {
      const { data } = await admin
        .from("incident_packages")
        .select(PKG_COLUMNS)
        .contains("recipients", [{ type: "contact", contactId: c.id }])
        .is("deleted_at", null)
        .limit(10);
      for (const p of (data ?? []) as Pkg[]) if (isLive(p) && !byId.has(p.id)) byId.set(p.id, { pkg: p, role: "contact" });
    }
    const ids = [...new Set([...byId.values()].map((v) => v.pkg.affected_user_id))];
    const { data: people } = ids.length ? await admin.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const names = Object.fromEntries((people ?? []).map((p) => [p.id, p.display_name]));
    const incidents = [...byId.values()]
      .sort((a, b) => b.pkg.created_at.localeCompare(a.pkg.created_at))
      .map(({ pkg, role }) => ({ id: pkg.id, role, personName: names[pkg.affected_user_id] ?? "A Jam member", createdAt: pkg.created_at }));
    return json({ incidents });
  }

  const incidentId = body.incidentId;
  if (!isUuid(incidentId)) return json({ error: "invalid_incident_id" }, 400);

  // ---- delete: RLS-checked RPC as the caller, then remove the recording with the admin client ----
  if (body.action === "delete") {
    const { data: path, error } = await auth.supabase.rpc("delete_incident_package", { p_id: incidentId });
    if (error) return json({ error: "not_found_or_forbidden" }, 404);
    if (typeof path === "string" && path) await admin.storage.from("recordings").remove([path]);
    return json({ deleted: true });
  }

  // ---- read one ----
  // Member / affected user: RLS on incident_packages already filters expiry and deletion.
  const { data: asMember } = await auth.supabase.from("incident_packages").select(PKG_COLUMNS).eq("id", incidentId).maybeSingle();
  if (asMember) {
    const pkg = asMember as Pkg;
    const role: Role = pkg.affected_user_id === auth.user.id ? "self" : "member";
    return json({ incident: await view(admin, pkg, role, { location: true, health: true, recording: true }) });
  }

  // Trusted contact: listed in recipients and signed in with the contact's email.
  const { data: raw } = await admin.from("incident_packages").select(PKG_COLUMNS).eq("id", incidentId).maybeSingle();
  const pkg = raw as Pkg | null;
  if (!pkg || !isLive(pkg)) return json({ error: "not_found" }, 404);
  const listed = new Set(pkg.recipients.filter((r) => r.type === "contact").map((r) => r.contactId));
  const mine = contacts.filter((c) => listed.has(c.id));
  if (mine.length === 0) return json({ error: "not_found" }, 404);
  const allowed: Allowed = {
    location: mine.some((c) => c.receive_location),
    health: mine.some((c) => c.receive_health_summary),
    recording: mine.some((c) => c.receive_recording),
  };
  return json({ incident: await view(admin, pkg, "contact", allowed) });
});

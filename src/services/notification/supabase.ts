import { getSupabaseClient } from "@/lib/supabase/client";
import { callContacts, notifyNtfy } from "@/lib/supabase/functions";
import type { NotificationResult, NotificationService } from "@/lib/types";

/**
 * Real notifications. In-app alerts travel over Realtime (alert_created), so "in_app" is always sent;
 * ntfy and Twilio calls run in Edge Functions so their secrets never reach the app.
 */
export const supabaseNotificationService: NotificationService = {
  async notifyGroup({ jamId, alertId }) {
    const ntfy = await notifyNtfy(jamId, alertId);
    return [{ channel: "in_app", status: "sent" }, ntfy];
  },

  notifyContacts({ alertId, recordingPath }) {
    return callContacts(alertId, recordingPath);
  },

  /** What the contact text would say (owner's own contacts only, via RLS). Used when Twilio is off. */
  async previewSms({ contactIds }) {
    const supabase = getSupabaseClient();
    if (!supabase || contactIds.length === 0) return [];
    const [{ data: contacts }, { data: auth }] = await Promise.all([
      supabase.from("trusted_contacts").select("id, name, phone_number, receive_location, receive_health_summary, receive_recording").in("id", contactIds),
      supabase.auth.getUser(),
    ]);
    const { data: me } = auth.user
      ? await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle()
      : { data: null };
    const name = me?.display_name ?? "Your contact";
    return (contacts ?? []).map((c) => ({
      contactId: c.id,
      to: c.phone_number ?? "(no phone number)",
      body: [
        `Jam alert: ${name} may need support. They stopped responding to their group and to Jam's support call.`,
        c.receive_location ? "Last seen: <place> (<n> min ago): <map link>" : null,
        c.receive_health_summary ? "Jam noticed: <reasons>." : null,
        c.receive_recording ? "Support call recording (link expires in 24 hours): <link>" : null,
        `Try to reach ${name}. If they are in immediate danger, call 911. Jam is not an emergency service.`,
      ]
        .filter(Boolean)
        .join("\n"),
    }));
  },

  async getStatus(jamId) {
    const supabase = getSupabaseClient();
    if (!supabase) return { ntfyConfigured: false, lastNotification: null };
    const { data } = await supabase
      .from("notification_events")
      .select("channel, status, detail, created_at")
      .eq("jam_id", jamId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNtfy = await supabase
      .from("notification_events")
      .select("status")
      .eq("jam_id", jamId)
      .eq("channel", "ntfy")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last: (NotificationResult & { createdAt: string }) | null = data
      ? { channel: data.channel, status: data.status, detail: data.detail ?? undefined, createdAt: data.created_at }
      : null;
    return { ntfyConfigured: lastNtfy.data?.status === "sent", lastNotification: last };
  },
};

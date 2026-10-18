import { getSupabaseClient } from "@/lib/supabase/client";
import type { Consents, EmergencyPreference, JamMemberRow, JamRow, TravelMode } from "@/lib/types";

/** Columns a member may update on their own `jam_members` row (see RLS column grant). */
export type MemberSettableFields = Partial<
  Pick<
    JamMemberRow,
    | "is_active"
    | "location_consent"
    | "health_consent"
    | "ai_call_consent"
    | "recording_consent"
    | "contact_notify_consent"
    | "emergency_preference"
    | "left_at"
    | "destination_name"
    | "destination_lat"
    | "destination_lng"
    | "destination_updated_at"
  >
>;

export type CreateJamInput = {
  name: string;
  destinationName?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  expectedArrival?: string | null;
  travelMode: TravelMode;
  checkinDelaySeconds: number;
  groupResponseTimeoutSeconds: number;
  emergencyPreference: EmergencyPreference;
  consents: Consents;
};

/** Creates the Jam, then inserts the host's own `jam_members` row (host_id = you, per RLS). */
export async function createJam(input: CreateJamInput): Promise<{ jam: JamRow | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { jam: null, error: "Supabase is not configured." };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) return { jam: null, error: "Sign in and try again." };

  const { data: jam, error: jamError } = await supabase
    .from("jams")
    .insert({
      host_id: userId,
      name: input.name.trim(),
      destination_name: input.destinationName ?? null,
      destination_lat: input.destinationLat ?? null,
      destination_lng: input.destinationLng ?? null,
      expected_arrival: input.expectedArrival ?? null,
      travel_mode: input.travelMode,
      checkin_delay_seconds: input.checkinDelaySeconds,
      group_response_timeout_seconds: input.groupResponseTimeoutSeconds,
    })
    .select()
    .single();
  if (jamError || !jam) return { jam: null, error: jamError?.message ?? "Couldn't create the Huddle." };

  const { error: memberError } = await supabase.from("jam_members").insert({
    jam_id: jam.id,
    user_id: userId,
    role: "host",
    location_consent: input.consents.location_consent,
    health_consent: input.consents.health_consent,
    ai_call_consent: input.consents.ai_call_consent,
    recording_consent: input.consents.recording_consent,
    contact_notify_consent: input.consents.contact_notify_consent,
    emergency_preference: input.emergencyPreference,
  });
  if (memberError) return { jam, error: memberError.message };

  return { jam, error: null };
}

type JoinErrorCode = "not_authenticated" | "profile_required" | "invalid_code" | "jam_ended";

const JOIN_ERROR_COPY: Record<JoinErrorCode, string> = {
  not_authenticated: "Sign in and try again.",
  profile_required: "Finish setting up your profile first.",
  invalid_code: "That code doesn't match a Huddle. Double check and try again.",
  jam_ended: "This Huddle has already ended.",
};

/** Maps `join_jam`'s raised exception message to calm, user-facing copy. */
export function joinErrorMessage(code: string | null | undefined): string {
  if (code && code in JOIN_ERROR_COPY) return JOIN_ERROR_COPY[code as JoinErrorCode];
  return "Couldn't join that Huddle. Try again.";
}

export async function joinJamByCode(code: string): Promise<{ jamId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { jamId: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc("join_jam", { code });
  if (error) return { jamId: null, error: joinErrorMessage(error.message) };
  return { jamId: data ?? null, error: null };
}

/** Writes consent / emergency-preference choices onto the caller's own `jam_members` row. */
export async function updateMyMembership(
  jamId: string,
  userId: string,
  updates: MemberSettableFields,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.from("jam_members").update(updates).eq("jam_id", jamId).eq("user_id", userId);
  return { error: error?.message ?? null };
}

/** "I changed my destination": save where this member is heading now (their route follows it). */
export async function setMyDestination(
  jamId: string,
  userId: string,
  place: { name: string; latitude: number; longitude: number },
): Promise<{ error: string | null }> {
  return updateMyMembership(jamId, userId, {
    destination_name: place.name.slice(0, 120),
    destination_lat: place.latitude,
    destination_lng: place.longitude,
    destination_updated_at: new Date().toISOString(),
  });
}

/** "Call someone in my group": their numbers, only while I have an open alert (enforced by the DB). */
export async function memberPhoneNumbers(jamId: string): Promise<{ userId: string; name: string; phone: string }[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase.rpc("member_phone_numbers", { p_jam_id: jamId });
  return (data ?? []).map((r) => ({ userId: r.user_id, name: r.display_name, phone: r.phone_number }));
}

export async function startJam(jamId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase
    .from("jams")
    .update({ status: "active", started_at: new Date().toISOString() })
    .eq("id", jamId);
  return { error: error?.message ?? null };
}

export async function stopJam(jamId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase
    .from("jams")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", jamId);
  return { error: error?.message ?? null };
}

export async function leaveJam(jamId: string, userId: string): Promise<{ error: string | null }> {
  return updateMyMembership(jamId, userId, { is_active: false, left_at: new Date().toISOString() });
}

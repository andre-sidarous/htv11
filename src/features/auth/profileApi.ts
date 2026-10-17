import { normalizePhone } from "@/features/contacts/schema";
import { DEFAULT_CHECKIN_BUFFER_S } from "@/lib/constants";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/types";

export type UpsertProfileInput = {
  id: string;
  displayName: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  checkinBufferSeconds?: number;
};

/** Creates or updates the signed-in user's `profiles` row (no DB trigger creates it). */
export async function upsertProfile(input: UpsertProfileInput): Promise<{ profile: ProfileRow | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { profile: null, error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: input.id,
      display_name: input.displayName.trim(),
      // E.164 so the live AI call (Twilio) can ring it; keep what they typed if it can't be normalized.
      phone_number: input.phoneNumber?.trim() ? (normalizePhone(input.phoneNumber) ?? input.phoneNumber.trim()) : null,
      avatar_url: input.avatarUrl ?? null,
      checkin_buffer_seconds: input.checkinBufferSeconds ?? DEFAULT_CHECKIN_BUFFER_S,
    })
    .select()
    .single();

  return { profile: data ?? null, error: error?.message ?? null };
}

/** Settings-only update: changes just the check-in buffer on the caller's own `profiles` row. */
export async function updateCheckinBufferSeconds(
  userId: string,
  seconds: number,
): Promise<{ profile: ProfileRow | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { profile: null, error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("profiles")
    .update({ checkin_buffer_seconds: seconds })
    .eq("id", userId)
    .select()
    .single();

  return { profile: data ?? null, error: error?.message ?? null };
}

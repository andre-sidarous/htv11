import { getSupabaseClient } from "@/lib/supabase/client";
import type { TrustedContactRow } from "@/lib/types";
import type { ContactInput } from "./schema";

/**
 * Trusted-contact data access. RLS makes every query owner-only, so phone numbers
 * never reach other Jam members. Returns { data, error } with friendly messages.
 */

export type Result<T> = { data: T; error: null } | { data: null; error: string };

const NOT_CONFIGURED = "Contacts need Supabase. Add the Supabase values to .env.";

function friendly(message: string, code?: string): string {
  if (code === "23503") return "Finish setting up your profile first, then add contacts.";
  if (/network|fetch/i.test(message)) return "You're offline. Your contacts will load when you reconnect.";
  return "Something went wrong saving your contacts. Please try again.";
}

export async function listContacts(): Promise<Result<TrustedContactRow[]>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.from("trusted_contacts").select("*").order("created_at", { ascending: true });
  if (error) return { data: null, error: friendly(error.message, error.code) };
  return { data: data ?? [], error: null };
}

/** Creates when `id` is omitted, otherwise updates. */
export async function saveContact(input: ContactInput, id?: string): Promise<Result<TrustedContactRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };

  if (id) {
    const { data, error } = await supabase.from("trusted_contacts").update(input).eq("id", id).select().single();
    if (error) return { data: null, error: friendly(error.message, error.code) };
    return { data, error: null };
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { data: null, error: "Sign in to add trusted contacts." };
  const { data, error } = await supabase
    .from("trusted_contacts")
    .insert({ ...input, owner_user_id: auth.user.id })
    .select()
    .single();
  if (error) return { data: null, error: friendly(error.message, error.code) };
  return { data, error: null };
}

export async function deleteContact(id: string): Promise<Result<true>> {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: NOT_CONFIGURED };
  const { error } = await supabase.from("trusted_contacts").delete().eq("id", id);
  if (error) return { data: null, error: friendly(error.message, error.code) };
  return { data: true, error: null };
}

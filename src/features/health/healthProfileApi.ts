import * as ImagePicker from "expo-image-picker";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { HealthProfileRow } from "@/lib/types";
import { riskFor, type HealthProfileInput } from "./healthProfile";

export * from "./healthProfile";

const fromRow = (r: HealthProfileRow): HealthProfileInput => ({
  age: r.age,
  sex: r.sex,
  weightKg: r.weight_kg != null ? Number(r.weight_kg) : null,
  heightCm: r.height_cm != null ? Number(r.height_cm) : null,
  allergies: r.allergies ?? [],
  carriesEpipen: r.carries_epipen,
  conditions: r.conditions ?? [],
  familyHistory: r.family_history ?? [],
  isVulnerable: r.is_vulnerable,
  medicalCardPath: r.medical_card_path,
});

export async function loadHealthProfile(userId: string): Promise<HealthProfileInput | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("health_profiles").select("*").eq("user_id", userId).maybeSingle();
  return data ? fromRow(data as HealthProfileRow) : null;
}

export async function saveHealthProfile(userId: string, p: HealthProfileInput): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return "Huddle isn't connected.";
  const risk = riskFor(p);
  const { error } = await supabase.from("health_profiles").upsert(
    {
      user_id: userId,
      age: p.age,
      sex: p.sex,
      weight_kg: p.weightKg,
      height_cm: p.heightCm,
      allergies: p.allergies,
      carries_epipen: p.carriesEpipen,
      conditions: p.conditions,
      family_history: p.familyHistory,
      is_vulnerable: p.isVulnerable,
      medical_card_path: p.isVulnerable ? p.medicalCardPath : null,
      risk_percent: risk ? risk.percent : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return error ? "Couldn’t save your health profile. Try again." : null;
}

/**
 * Pick a photo of their medical card and upload it to their private folder. Returns the storage
 * path (shared only inside an incident package), null if they cancelled, or an error message.
 */
export async function pickAndUploadMedicalCard(userId: string): Promise<{ path: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { path: null, error: "Huddle isn't connected." };
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { path: null, error: "Allow photo access to add your medical card." };
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true });
  if (picked.canceled || !picked.assets[0]) return { path: null, error: null };
  try {
    const body = await (await fetch(picked.assets[0].uri)).arrayBuffer();
    const path = `${userId}/medical-card-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("medical-cards").upload(path, body, { contentType: "image/jpeg", upsert: true });
    return error ? { path: null, error: "Couldn’t upload the photo. Try again." } : { path, error: null };
  } catch {
    return { path: null, error: "Couldn’t read that photo. Try another." };
  }
}

/** A short-lived link to show the owner their own card. */
export async function medicalCardUrl(path: string): Promise<string | null> {
  const { data } = (await getSupabaseClient()?.storage.from("medical-cards").createSignedUrl(path, 600)) ?? { data: null };
  return data?.signedUrl ?? null;
}

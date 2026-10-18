import { useRouter } from "expo-router";
import { HeartPulse, IdCard, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, IconBadge, Screen, TextField, Toggle } from "@/components/ui";
import { useSession } from "@/features/auth/SessionProvider";
import { colors, radius, space, type } from "@/theme";
import { modelInfo, restingRange } from "./healthModel";
import {
  COMMON_ALLERGIES,
  CONDITIONS,
  EMPTY_HEALTH_PROFILE,
  FAMILY_HISTORY,
  loadHealthProfile,
  medicalCardUrl,
  pickAndUploadMedicalCard,
  riskFor,
  saveHealthProfile,
  type HealthProfileInput,
} from "./healthProfileApi";

const SEXES = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "unspecified", label: "Prefer not to say" },
] as const;

const numberOrNull = (v: string) => {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

const toggleIn = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/**
 * "Your health profile" (sign-up step, editable later from Home). Optional and private: it powers
 * the NHANES risk estimate and a Medical ID that's shared only inside an incident package.
 */
export function HealthProfileScreen({ mode }: { mode: "onboarding" | "edit" }) {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [p, setP] = useState<HealthProfileInput>(EMPTY_HEALTH_PROFILE);
  const [otherAllergy, setOtherAllergy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadHealthProfile(userId).then(async (saved) => {
      if (cancelled) return;
      if (saved) {
        const known = new Set<string>(COMMON_ALLERGIES);
        setP({ ...saved, allergies: saved.allergies.filter((a) => known.has(a)) });
        setOtherAllergy(saved.allergies.filter((a) => !known.has(a)).join(", "));
        if (saved.medicalCardPath) setCardUrl(await medicalCardUrl(saved.medicalCardPath));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const set = (patch: Partial<HealthProfileInput>) => setP((prev) => ({ ...prev, ...patch }));
  const risk = riskFor(p);
  const range = p.age ? restingRange(p.age, p.sex ?? "unspecified") : null;

  async function addCard() {
    if (!userId) return;
    setUploading(true);
    setError(null);
    const { path, error: e } = await pickAndUploadMedicalCard(userId);
    setUploading(false);
    if (e) return setError(e);
    if (path) {
      set({ medicalCardPath: path });
      setCardUrl(await medicalCardUrl(path));
    }
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    const others = otherAllergy
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const e = await saveHealthProfile(userId, { ...p, allergies: [...p.allergies, ...others] });
    setSaving(false);
    if (e) return setError(e);
    if (mode === "onboarding") router.push("/(auth)/baseline");
    else router.back();
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.intro}>
        <Text style={type.title}>Your health profile</Text>
        <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
          Optional and private. It helps Huddle know what’s normal for you, and it’s only shared inside an incident package with people you allow.
        </Text>
      </View>

      <Card>
        <Text style={type.heading}>About you</Text>
        <View style={styles.row}>
          <TextField
            label="Age"
            value={p.age ? String(p.age) : ""}
            onChangeText={(v) => set({ age: numberOrNull(v) })}
            keyboardType="number-pad"
            maxLength={3}
            style={styles.flex}
          />
          <TextField
            label="Weight (kg)"
            value={p.weightKg ? String(p.weightKg) : ""}
            onChangeText={(v) => set({ weightKg: numberOrNull(v) })}
            keyboardType="decimal-pad"
            maxLength={5}
            style={styles.flex}
          />
          <TextField
            label="Height (cm)"
            value={p.heightCm ? String(p.heightCm) : ""}
            onChangeText={(v) => set({ heightCm: numberOrNull(v) })}
            keyboardType="decimal-pad"
            maxLength={5}
            style={styles.flex}
          />
        </View>
        <Text style={type.label}>Sex</Text>
        <View style={styles.chips}>
          {SEXES.map((s) => (
            <Chip key={s.value} label={s.label} selected={p.sex === s.value} onPress={() => set({ sex: s.value })} />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={type.heading}>Allergies</Text>
        <View style={styles.chips}>
          {COMMON_ALLERGIES.map((a) => (
            <Chip key={a} label={a} selected={p.allergies.includes(a)} onPress={() => set({ allergies: toggleIn(p.allergies, a) })} />
          ))}
        </View>
        <TextField label="Other allergies" value={otherAllergy} onChangeText={setOtherAllergy} placeholder="e.g. sesame, ibuprofen" />
        <Toggle label="I carry an EpiPen" value={p.carriesEpipen} onValueChange={(v) => set({ carriesEpipen: v })} />
      </Card>

      <Card>
        <Text style={type.heading}>Conditions</Text>
        <View style={styles.chips}>
          {CONDITIONS.map((c) => (
            <Chip key={c} label={c} selected={p.conditions.includes(c)} onPress={() => set({ conditions: toggleIn(p.conditions, c) })} />
          ))}
        </View>
        <Text style={type.heading}>Family history</Text>
        <Text style={type.caption}>A parent, brother or sister has had:</Text>
        <View style={styles.chips}>
          {FAMILY_HISTORY.map((f) => (
            <Chip key={f} label={f} selected={p.familyHistory.includes(f)} onPress={() => set({ familyHistory: toggleIn(p.familyHistory, f) })} />
          ))}
        </View>
      </Card>

      <Card>
        <Toggle
          label="Are you vulnerable?"
          description="For example a medical condition, disability or memory loss. Add a photo of your medical card for responders. It’s shared only inside an incident package."
          value={p.isVulnerable}
          onValueChange={(v) => set({ isVulnerable: v })}
        />
        {p.isVulnerable ? (
          <View style={styles.cardRow}>
            {cardUrl ? <Image source={{ uri: cardUrl }} style={styles.cardImage} accessibilityLabel="Your medical card photo" /> : null}
            <Button
              label={p.medicalCardPath ? "Replace medical card photo" : "Add a photo of your medical card"}
              icon={IdCard}
              variant="secondary"
              loading={uploading}
              onPress={() => void addCard()}
            />
          </View>
        ) : null}
      </Card>

      {risk && range ? (
        <View style={styles.risk} accessibilityLiveRegion="polite">
          <View style={styles.riskHeader}>
            <IconBadge icon={HeartPulse} tone={risk.comparedToAge === "higher" ? "amber" : "brand"} size={40} />
            <View style={styles.flex}>
              <Text style={type.overline}>Your health estimate</Text>
              <Text style={styles.riskNumber}>{risk.percent}%</Text>
            </View>
          </View>
          <Text style={type.body}>{risk.summary}</Text>
          <Text style={type.body}>
            Normal resting heart rate for your age: {range.low}–{range.high} bpm (most common {range.mostCommon}).
          </Text>
          <View style={styles.note}>
            <IconBadge icon={ShieldCheck} tone="neutral" size={28} />
            <Text style={[type.caption, styles.flex]}>
              From a model trained on {modelInfo.people.toLocaleString()} US adults (CDC NHANES), {modelInfo.accuracyPct}% accurate on people it hadn’t seen. An
              estimate, not a diagnosis.
            </Text>
          </View>
        </View>
      ) : (
        <Text style={type.caption}>Add your age to see your health estimate and your normal resting heart rate.</Text>
      )}

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
          {error}
        </Text>
      ) : null}

      <Button label={mode === "onboarding" ? "Save and continue" : "Save"} onPress={() => void save()} loading={saving} />
      {mode === "onboarding" ? <Button label="Skip for now" variant="ghost" onPress={() => router.push("/(auth)/baseline")} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space(2) },
  row: { flexDirection: "row", gap: space(2) },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  cardRow: { gap: space(3) },
  cardImage: { width: "100%", height: 180, borderRadius: radius.md, backgroundColor: colors.blushSoft },
  risk: { gap: space(3), padding: space(5), borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.blush },
  riskHeader: { flexDirection: "row", alignItems: "center", gap: space(3) },
  riskNumber: { ...type.metric, color: colors.brand },
  note: { flexDirection: "row", alignItems: "center", gap: space(2) },
});

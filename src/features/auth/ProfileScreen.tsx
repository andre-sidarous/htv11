import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Chip, Screen, TextField } from "@/components/ui";
import { CHECKIN_BUFFER_CHOICES_S, DEFAULT_CHECKIN_BUFFER_S } from "@/lib/constants";
import { colors, space, type } from "@/theme";
import { checkinBufferLabel } from "./checkinBuffer";
import { upsertProfile } from "./profileApi";
import { useSession } from "./SessionProvider";

/** Profile setup: shown once, right after sign-in, when the user has no `profiles` row yet. */
export function ProfileScreen() {
  const { session, setProfile } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkinBufferSeconds, setCheckinBufferSeconds] = useState(DEFAULT_CHECKIN_BUFFER_S);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!session) return;
    if (!displayName.trim()) {
      setError("Enter a display name.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await upsertProfile({
      id: session.user.id,
      displayName,
      phoneNumber: phone,
      checkinBufferSeconds,
    });
    setLoading(false);
    if (!result.profile) {
      setError(result.error ?? "Couldn't save your profile. Try again.");
      return;
    }
    setProfile(result.profile);
    // The root layout's session gate takes it from here (consent screen, or home).
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Let’s set up your Jam profile.</Text>
      <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
        You can change these settings later.
      </Text>

      <Card>
        <TextField
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={60}
          placeholder="What should your Jam call you?"
          editable={!loading}
        />
        <TextField
          label="Phone number (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          hint="Only visible to you. Jam members never see your phone number."
          editable={!loading}
        />
      </Card>

      <Card>
        <Text style={type.label}>If Jam checks on you and you don’t answer, how long should it wait before alerting your group?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) }}>
          {CHECKIN_BUFFER_CHOICES_S.map((seconds) => (
            <Chip
              key={seconds}
              label={checkinBufferLabel(seconds)}
              selected={checkinBufferSeconds === seconds}
              onPress={() => setCheckinBufferSeconds(seconds)}
              disabled={loading}
            />
          ))}
        </View>
        <Text style={type.caption}>You can change this later in Settings.</Text>
      </Card>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation, fontSize: 14 }}>
          {error}
        </Text>
      ) : null}
      <Button label="Continue" onPress={handleContinue} loading={loading} disabled={!displayName.trim()} />
    </Screen>
  );
}

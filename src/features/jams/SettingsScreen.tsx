import { useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Text, View } from "react-native";
import { Badge, Button, Card, Chip, LoadingState, OptionCard, Screen, Toggle } from "@/components/ui";
import { checkinBufferLabel } from "@/features/auth/checkinBuffer";
import { requestConsentPermission } from "@/features/auth/consentPermissions";
import { updateCheckinBufferSeconds } from "@/features/auth/profileApi";
import { useSession } from "@/features/auth/SessionProvider";
import { setDemoContext } from "@/features/demo/demoContext";
import { CHECKIN_BUFFER_CHOICES_S } from "@/lib/constants";
import { signOut } from "@/lib/supabase/auth";
import type { ConsentKey, EmergencyPreference } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { useHasActiveAlert } from "./useHasActiveAlert";
import { deleteMyIncidentData } from "./incidentPrivacy";
import { leaveJam, stopJam, updateMyMembership } from "./jamsApi";
import { useJam } from "./useJam";
import { useJamMembers } from "./useJamMembers";

/** Every privacy and lifecycle control for this Jam. Privacy controls are never hidden. */
export function SettingsScreen({ jamId }: { jamId: string }) {
  const router = useRouter();
  const { session, profile, setProfile } = useSession();
  const { jam } = useJam(jamId);
  const { members, loading: membersLoading, refresh: refreshMembers } = useJamMembers(jamId);
  const { hasActiveAlert } = useHasActiveAlert(jamId, session?.user.id);

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const self = members.find((m) => m.user_id === session?.user.id);
  const isHost = Boolean(jam && session && jam.host_id === session.user.id);

  async function handleToggle(key: ConsentKey, value: boolean) {
    if (!session) return;
    setError(null);
    setNotice(null);
    if (value) {
      const denied = await requestConsentPermission(key);
      if (denied) {
        setNotice(denied);
        return;
      }
    }
    setSaving(key);
    const { error } = await updateMyMembership(jamId, session.user.id, { [key]: value });
    setSaving(null);
    if (error) setError(error);
    else void refreshMembers();
  }

  async function handleCheckinBuffer(seconds: number) {
    if (!session) return;
    setSaving("checkin-buffer");
    setError(null);
    const { profile: updated, error } = await updateCheckinBufferSeconds(session.user.id, seconds);
    setSaving(null);
    if (error || !updated) setError(error ?? "Couldn't save that.");
    else setProfile(updated);
  }

  async function handlePreference(preference: EmergencyPreference) {
    if (!session || hasActiveAlert) return;
    setSaving("preference");
    setError(null);
    const { error } = await updateMyMembership(jamId, session.user.id, { emergency_preference: preference });
    setSaving(null);
    if (error) setError(error);
    else void refreshMembers();
  }

  function confirmDestructive(title: string, message: string, action: () => void) {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: title, style: "destructive", onPress: action },
    ]);
  }

  async function handleStopJam() {
    setSaving("stop");
    setError(null);
    const { error } = await stopJam(jamId);
    setSaving(null);
    if (error) setError(error);
  }

  async function handleLeaveJam() {
    if (!session) return;
    setSaving("leave");
    setError(null);
    const { error } = await leaveJam(jamId, session.user.id);
    setSaving(null);
    if (error) {
      setError(error);
      return;
    }
    router.replace("/");
  }

  function handleDemoThisJam() {
    setDemoContext({ jamId, affectedUserId: self?.user_id ?? session?.user.id ?? "" });
    router.push("/demo-control");
  }

  async function handleDeleteIncidentData() {
    if (!session) return;
    setSaving("incident");
    setError(null);
    const { deleted, error } = await deleteMyIncidentData(jamId, session.user.id);
    setSaving(null);
    if (error) setError(error);
    else setNotice(deleted > 0 ? `Removed ${deleted} incident record${deleted === 1 ? "" : "s"}.` : "No incident data to remove.");
  }

  async function handleDeleteAccount() {
    if (!session) return;
    setSaving("delete-account");
    const { error } = await leaveJam(jamId, session.user.id);
    if (!error) await signOut();
    setSaving(null);
    if (error) setError(error);
  }

  if (!self) {
    return membersLoading ? <LoadingState label="Loading settings…" /> : null;
  }

  return (
    <Screen scroll>
      <Text style={type.title}>Settings</Text>

      <Card>
        <Toggle
          label="Location sharing"
          description="Pause this anytime. Your location won't be visible to the group while paused."
          value={self.location_consent}
          onValueChange={(v) => handleToggle("location_consent", v)}
          disabled={saving === "location_consent"}
        />
        <Toggle
          label="Health signals"
          description="Simulated heart-rate signal, shared only while this is on."
          value={self.health_consent}
          onValueChange={(v) => handleToggle("health_consent", v)}
          disabled={saving === "health_consent"}
        />
        <Toggle
          label="AI support call"
          description="Lets Jam call you with a voice check-in before notifying contacts."
          value={self.ai_call_consent}
          onValueChange={(v) => handleToggle("ai_call_consent", v)}
          disabled={saving === "ai_call_consent"}
        />
        <Toggle
          label="Emergency recording"
          description="Records audio during a support call, only if things escalate."
          value={self.recording_consent}
          onValueChange={(v) => handleToggle("recording_consent", v)}
          disabled={saving === "recording_consent"}
        />
        <Toggle
          label="Trusted-contact notifications"
          description="If you stop responding to your group and to Jam's support call, Jam calls and texts your trusted contacts."
          value={self.contact_notify_consent}
          onValueChange={(v) => handleToggle("contact_notify_consent", v)}
          disabled={saving === "contact_notify_consent"}
        />
      </Card>

      <Card>
        <Text style={type.heading}>Check-in buffer</Text>
        <Text style={type.caption}>
          If Jam checks on you and you don’t answer, how long should it wait before alerting your group?
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) }}>
          {CHECKIN_BUFFER_CHOICES_S.map((seconds) => (
            <Chip
              key={seconds}
              label={checkinBufferLabel(seconds)}
              selected={profile?.checkin_buffer_seconds === seconds}
              onPress={() => handleCheckinBuffer(seconds)}
              disabled={saving === "checkin-buffer"}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={type.heading}>If you can’t be reached</Text>
        {hasActiveAlert ? (
          <Badge label="Locked during an active alert" tone="amber" />
        ) : null}
        <View style={{ gap: space(3), marginTop: space(2) }}>
          <OptionCard
            title="AI support call"
            description="Jam calls you with a short voice check-in before notifying anyone."
            selected={self.emergency_preference === "ai_support_call"}
            onPress={() => handlePreference("ai_support_call")}
          />
          <OptionCard
            title="Notify contacts only"
            description="Skip the call and go straight to your trusted contacts."
            selected={self.emergency_preference === "contact_only_alert"}
            onPress={() => handlePreference("contact_only_alert")}
          />
        </View>
        {hasActiveAlert ? (
          <Text style={type.caption}>You can change this again once the current alert is resolved.</Text>
        ) : null}
      </Card>

      <Card>
        <Text style={type.heading}>Demo</Text>
        <Button label="Demo this Jam" variant="secondary" onPress={handleDemoThisJam} />
        <Text style={type.caption}>Opens the presenter’s Demo Control panel for this live Jam.</Text>
      </Card>

      <Card>
        <Text style={type.heading}>More</Text>
        <Button label="Trusted contacts" variant="ghost" onPress={() => router.push("/contacts")} />
      </Card>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
          {error}
        </Text>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={type.caption}>{notice}</Text> : null}

      <Card>
        <Text style={type.heading}>Leave or end this Jam</Text>
        {isHost ? (
          <Button
            label="Stop Jam"
            variant="destructive"
            loading={saving === "stop"}
            onPress={() =>
              confirmDestructive("Stop Jam", "This ends the Jam for everyone. It can't be restarted.", handleStopJam)
            }
          />
        ) : null}
        <Button
          label="Leave Jam"
          variant="destructive"
          loading={saving === "leave"}
          onPress={() =>
            confirmDestructive("Leave Jam", "You'll stop sharing your location and health signals with this Jam.", handleLeaveJam)
          }
        />
      </Card>

      <Card>
        <Text style={type.heading}>Data</Text>
        <Button label="Delete incident data" variant="ghost" loading={saving === "incident"} onPress={handleDeleteIncidentData} />
        <Button
          label="Delete account"
          variant="ghost"
          loading={saving === "delete-account"}
          onPress={() =>
            confirmDestructive(
              "Delete account",
              "This leaves your Jams on this device and signs you out. Removing your account itself needs an admin step — contact the team to finish that part.",
              handleDeleteAccount,
            )
          }
        />
      </Card>
    </Screen>
  );
}

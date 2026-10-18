import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StyleSheet, Text, View } from "react-native";
import { PenguinHuddle } from "@/components/brand";
import { Button, Card, Chip, OptionCard, Screen, TextField, Toggle } from "@/components/ui";
import { requestConsentPermission } from "@/features/auth/consentPermissions";
import { useSession } from "@/features/auth/SessionProvider";
import { joinCodeSchema } from "@/lib/validation";
import type { EmergencyPreference } from "@/lib/types";
import { colors, space, type } from "@/theme";
import { DestinationPicker } from "./DestinationPicker";
import { joinJamByCode, setMyDestination, updateMyMembership } from "./jamsApi";
import type { Place } from "./placeSearch";
import { useCurrentPosition } from "./useCurrentPosition";
import { useJam } from "./useJam";

/** Join by code or QR. `initialCode` prefills from a Share deep link (`jam://join/<code>`). */
export function JoinJamScreen({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const { session, profile, onboardingDraft } = useSession();

  const [step, setStep] = useState<"code" | "confirm">("code");
  const [code, setCode] = useState(initialCode ?? "");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jamId, setJamId] = useState<string | null>(null);

  const [locationConsent, setLocationConsent] = useState(onboardingDraft.consents.location_consent);
  const [healthConsent, setHealthConsent] = useState(onboardingDraft.consents.health_consent);
  const [preference, setPreference] = useState<EmergencyPreference | null>(onboardingDraft.emergencyPreference);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  async function handleLocationConsent(value: boolean) {
    setPermissionNotice(null);
    if (value) {
      const denied = await requestConsentPermission("location_consent");
      if (denied) {
        setPermissionNotice(denied);
        return;
      }
    }
    setLocationConsent(value);
  }

  useEffect(() => {
    if (initialCode) void handleJoin(initialCode);
  }, [initialCode]);

  async function handleJoin(rawCode: string) {
    const parsed = joinCodeSchema.safeParse(rawCode);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid join code.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await joinJamByCode(parsed.data);
    setLoading(false);
    if (!result.jamId) {
      setError(result.error ?? "Couldn't join that Huddle.");
      return;
    }
    setJamId(result.jamId);
    setStep("confirm");
  }

  // "Where are you heading?": the Huddle's destination by default, or anywhere else.
  const { jam } = useJam(jamId ?? undefined);
  const here = useCurrentPosition();
  const individual = jam?.destination_mode === "individual";
  const [ownChoice, setOwnChoice] = useState<boolean | null>(null);
  // Everyone-picks-their-own Huddles start on "pick yours"; the Huddle's is still one tap away.
  const ownDestination = ownChoice ?? individual;
  const setOwnDestination = setOwnChoice;
  const [myPlace, setMyPlace] = useState<Place | null>(null);

  async function handleConfirm() {
    if (!session || !jamId || !preference) return;
    setLoading(true);
    setError(null);
    const { error } = await updateMyMembership(jamId, session.user.id, {
      location_consent: locationConsent,
      health_consent: healthConsent,
      ai_call_consent: onboardingDraft.consents.ai_call_consent,
      recording_consent: onboardingDraft.consents.recording_consent,
      contact_notify_consent: onboardingDraft.consents.contact_notify_consent,
      emergency_preference: preference,
    });
    if (!error && ownDestination && myPlace) {
      const { error: destError } = await setMyDestination(jamId, session.user.id, myPlace);
      if (destError) {
        setLoading(false);
        setError("Joined, but couldn’t save your destination. Change it in Settings.");
        return;
      }
    }
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    router.replace(`/jam/${jamId}/lobby`);
  }

  async function handleScanPress() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return; // Camera denied — manual entry below still works.
    }
    setScanning(true);
  }

  function handleBarcodeScanned(result: { data: string }) {
    setScanning(false);
    const raw = result.data.startsWith("JAM:") ? result.data.slice(4) : result.data;
    setCode(raw);
    void handleJoin(raw);
  }

  if (scanning) {
    return (
      <View style={styles.cameraScreen}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint} maxFontSizeMultiplier={1.6}>
            Point your camera at the Huddle’s QR code.
          </Text>
          <Button label="Cancel" variant="secondary" onPress={() => setScanning(false)} />
        </View>
      </View>
    );
  }

  if (step === "confirm" && jamId) {
    return (
      <Screen scroll>
        <Text style={type.title}>You’re joining as {profile?.display_name ?? "yourself"}</Text>
        <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
          Confirm what you’ll share with this Huddle. You can change this anytime in Settings.
        </Text>

        <Card>
          <Text style={type.heading}>Where are you heading?</Text>
          <Text style={type.caption}>
            {individual ? "Everyone in this Huddle picks their own destination. " : ""}Huddle plans your route there, and checks in if you go off it.
            Everyone can see each other’s routes.
          </Text>
          <View style={styles.chips}>
            <Chip
              label={
                jam?.destination_name ? `${individual ? "Same as the host" : "Same as the Huddle"}: ${jam.destination_name}` : "Same as the Huddle"
              }
              selected={!ownDestination}
              onPress={() => setOwnDestination(false)}
            />
            <Chip label="Somewhere else" selected={ownDestination} onPress={() => setOwnDestination(true)} />
          </View>
          {ownDestination ? <DestinationPicker value={myPlace} onChange={setMyPlace} near={here.position} disabled={loading} /> : null}
        </Card>

        <Card>
          <Toggle
            label="Location sharing"
            description="Lets this Huddle see where you are while it's active."
            value={locationConsent}
            onValueChange={(v) => void handleLocationConsent(v)}
          />
          <Toggle
            label="Health signals"
            description="Shares a simulated heart-rate signal with this Huddle."
            value={healthConsent}
            onValueChange={setHealthConsent}
          />
          {permissionNotice ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.amber, fontSize: 13 }}>
              {permissionNotice}
            </Text>
          ) : null}
        </Card>

        <Card>
          <Text style={type.heading}>If you can’t be reached</Text>
          <View style={{ gap: space(3), marginTop: space(2) }}>
            <OptionCard
              title="AI support call"
              description="Huddle calls you with a short voice check-in before notifying anyone."
              selected={preference === "ai_support_call"}
              onPress={() => setPreference("ai_support_call")}
            />
            <OptionCard
              title="Notify contacts only"
              description="Skip the call and go straight to your trusted contacts."
              selected={preference === "contact_only_alert"}
              onPress={() => setPreference("contact_only_alert")}
            />
          </View>
        </Card>

        {error ? (
          <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
            {error}
          </Text>
        ) : null}

        <Button label="Join Huddle" onPress={handleConfirm} loading={loading} disabled={!preference} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <PenguinHuddle height={150} />
      <Text style={type.title}>Join a Huddle</Text>
      <Text style={type.bodyMuted} maxFontSizeMultiplier={1.6}>
        Enter the 6-character code a Huddle member shared with you, or scan their QR code.
      </Text>

      <Card>
        <TextField
          label="Join code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="CAMPUS"
          editable={!loading}
        />
        {error ? (
          <Text accessibilityRole="alert" style={{ color: colors.escalation }}>
            {error}
          </Text>
        ) : null}
        <Button label="Join with code" onPress={() => handleJoin(code)} loading={loading} disabled={!code.trim()} />
      </Card>

      <Button
        label="Scan QR code"
        variant="secondary"
        onPress={handleScanPress}
        disabled={loading}
        accessibilityHint={permission?.canAskAgain === false ? "Camera access is off. You can still enter the code manually." : undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  cameraScreen: { flex: 1, backgroundColor: colors.ink },
  camera: { flex: 1 },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: space(6),
    gap: space(3),
    backgroundColor: colors.overlay,
  },
  cameraHint: { color: colors.warmWhite, fontSize: 16, textAlign: "center" },
});

import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { formatAgo } from "@/features/location/presence";
import { POOR_ACCURACY_M } from "@/services/location/device";
import type { LocationSharing } from "@/features/location/useLocationSharing";
import { colors, radius, shadow, space, type } from "@/theme";
import { PillButton } from "./controls";

/** Always-visible privacy strip: are you sharing, when was it last sent, pause/resume. */
export function SharingBar({ sharing }: { sharing: LocationSharing }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const { state, lastSentAt, lastAccuracy } = sharing;
  const live = state === "live";
  let label: string;
  switch (state) {
    case "live":
      label = lastSentAt ? `Sharing live · updated ${formatAgo(now - lastSentAt)}` : "Sharing live";
      break;
    case "paused":
      label = "Location paused";
      break;
    case "waiting_for_fix":
      label = "Finding your location…";
      break;
    case "background":
      label = "Sharing stops while Jam is in the background";
      break;
    case "jam_not_active":
      label = "Sharing starts when the Jam starts";
      break;
    case "no_consent":
      label = "Location sharing is off for this Jam";
      break;
    case "left":
      label = "You left this Jam · not sharing";
      break;
    case "checking":
      label = "Checking location permission…";
      break;
    default:
      label = "Location unavailable";
  }

  return (
    <View style={styles.bar} accessibilityRole="summary" accessibilityLabel={label}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: live ? colors.ok : colors.inkMuted }]} />
        <Text style={[type.body, styles.label]} numberOfLines={2}>
          {label}
        </Text>
        {state === "live" || state === "waiting_for_fix" ? (
          <PillButton label="Pause" variant="secondary" onPress={sharing.pause} accessibilityHint="Stops sharing your location" />
        ) : state === "paused" ? (
          <PillButton label="Resume" onPress={sharing.resume} accessibilityHint="Shares your location again" />
        ) : null}
      </View>
      {state === "paused" ? (
        <Text style={type.caption}>Your location is paused. Other Jam members cannot see your current position.</Text>
      ) : null}
      {live && lastAccuracy !== null && lastAccuracy > POOR_ACCURACY_M ? (
        <Text style={type.caption}>Low GPS accuracy (about {Math.round(lastAccuracy)} m). Your marker may be approximate.</Text>
      ) : null}
      {state === "live" || state === "waiting_for_fix" || sharing.simulated ? (
        <View style={styles.row}>
          <Text style={[type.caption, styles.label]}>Use Campus Walk demo position</Text>
          <Switch
            value={sharing.simulated}
            onValueChange={sharing.setCampusWalkPosition}
            accessibilityLabel="Use Campus Walk demo position instead of GPS"
            trackColor={{ true: colors.skyStrong, false: colors.border }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: space(1),
    padding: space(3),
    paddingLeft: space(4),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flex: 1 },
});

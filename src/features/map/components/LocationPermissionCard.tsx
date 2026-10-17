import { StyleSheet, Text, View } from "react-native";
import type { LocationSharing } from "@/features/location/useLocationSharing";
import { colors, radius, shadow, space, type } from "@/theme";
import { PillButton } from "./controls";

/**
 * Explanation before the OS location prompt, plus calm copy for denied / services-off / errors.
 * Renders nothing when there's nothing to explain.
 */
export function LocationPermissionCard({ sharing }: { sharing: LocationSharing }) {
  switch (sharing.state) {
    case "needs_permission":
      return (
        <Card title="Share your location with this Huddle">
          <Text style={type.body}>
            Huddle shows your position to the members of this Huddle while it is active, so you can find each other. It
            only works while the app is open, and you can pause it at any time.
          </Text>
          <PillButton label="Share my location" onPress={() => void sharing.requestPermission()} />
        </Card>
      );
    case "denied":
      return (
        <Card title="Location permission is off">
          <Text style={type.body}>
            You can still see your group. To share your own position, allow location for Expo Go in your phone’s
            Settings.
          </Text>
          <PillButton label="Open Settings" variant="secondary" onPress={sharing.openSettings} />
        </Card>
      );
    case "services_off":
      return (
        <Card title="Location services are off">
          <Text style={type.body}>Turn on Location Services in your phone’s settings, then come back to the Huddle.</Text>
          <PillButton label="Open Settings" variant="secondary" onPress={sharing.openSettings} />
        </Card>
      );
    case "error":
      return (
        <Card title="Location is unavailable right now">
          <Text style={type.body}>{sharing.errorMessage ?? "We’ll keep trying."} Your group can still see your last update.</Text>
        </Card>
      );
    default:
      return null;
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={type.heading}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space(3),
    padding: space(5),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
});

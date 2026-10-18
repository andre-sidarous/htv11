import { Navigation, X } from "lucide-react-native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Icon } from "@/components/ui";
import { colors, radius, shadow, space, type } from "@/theme";
import { walkingDirectionsUrl, type GuideRequest, type GuideTarget } from "../guideTarget";

const minutesOnFoot = (m: number) => Math.max(1, Math.round(m / 1.3 / 60));
const distanceText = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

/** "Route to Alex · 400 m · about 5 min walk" with Open in Maps and Stop. Replaces the route card while guiding. */
export function GuideCard({
  request,
  target,
  routeDistanceM,
  onStop,
}: {
  request: GuideRequest;
  target: GuideTarget | null;
  /** Walking-route length when we have one; else the straight-line distance is shown. */
  routeDistanceM: number | null;
  onStop: () => void;
}) {
  const title = request.kind === "group" ? "Guiding you back to your group" : `Finding ${request.name}`;
  const distance = target ? (routeDistanceM ?? target.distanceM) : null;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon icon={Navigation} size={18} color={colors.surface} />
        </View>
        <View style={styles.flex}>
          <Text style={type.overline}>{title}</Text>
          {target && distance !== null ? (
            <Text style={type.heading}>
              {target.name} · {distanceText(distance)} · about {minutesOnFoot(distance)} min walk
            </Text>
          ) : (
            <Text style={type.body}>
              {request.kind === "group"
                ? "Waiting for someone in your group to share their location…"
                : `Waiting for ${request.name}’s location…`}
            </Text>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Stop guiding" hitSlop={12} onPress={onStop}>
          <Icon icon={X} size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
      {target ? (
        <>
          <Text style={type.caption}>Follow the green line. It updates as you both move.</Text>
          <Button
            label="Open in Maps for turn-by-turn"
            icon={Navigation}
            variant="secondary"
            onPress={() => void Linking.openURL(walkingDirectionsUrl(target.position)).catch(() => undefined)}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space(3), padding: space(4), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.raised },
  header: { flexDirection: "row", alignItems: "center", gap: space(3) },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.ok },
  flex: { flex: 1 },
});

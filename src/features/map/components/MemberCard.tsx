import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatAgo, presenceLabel } from "@/features/location/presence";
import { ROUTE_LEVEL_LABEL } from "@/features/location/routeStatus";
import { colors, radius, shadow, space, type } from "@/theme";
import type { MapMember } from "../useJamMapData";
import type { MemberStore } from "../memberStore";
import { activityLabel, initials, PRESENCE_DOT, profileColor } from "../memberAppearance";
import { PillButton } from "./controls";

/**
 * Details for the tapped member, e.g. "Daniel — Possible concern — Running — updated 4 seconds ago".
 * Lives outside the map so its 1s clock doesn't re-render markers.
 */
export function MemberCard({
  store,
  userId,
  member,
  isSelf,
  onClose,
}: {
  store: MemberStore;
  userId: string;
  member: MapMember | undefined;
  isSelf: boolean;
  onClose: () => void;
}) {
  const live = useSyncExternalStore(
    (listener) => store.subscribe(userId, listener),
    () => store.get(userId),
    () => store.get(userId),
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const name = isSelf ? "You" : (member?.displayName ?? "Jam member");
  const presence = live?.presence ?? "unavailable";
  const status = presenceLabel(presence, live?.lastSeenAt, now);
  const activity = activityLabel(live?.activity);
  const updated = presence === "live" && live?.lastSeenAt ? `updated ${formatAgo(now - live.lastSeenAt)}` : status;
  const parts = [name, live?.possibleConcern ? "Possible concern" : null, activity, updated].filter(Boolean);
  const route = live?.routeStatus;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: profileColor(userId) }]}>
          <Text style={styles.avatarText}>{initials(member?.displayName ?? name)}</Text>
        </View>
        <View style={styles.text}>
          <Text style={type.heading}>{parts.join(" — ")}</Text>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: PRESENCE_DOT[presence] }]} />
            <Text style={type.caption}>{status}</Text>
          </View>
        </View>
      </View>
      <Text style={type.caption}>
        {route ? `${ROUTE_LEVEL_LABEL[route.level]} · ${route.distanceFromRouteM} m from the planned route` : "No route status yet"}
        {" · "}
        {member?.healthConsent ? "Health signals shared (simulated)" : "Health signals not shared"}
      </Text>
      <PillButton label="Close" variant="quiet" onPress={onClose} style={styles.close} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space(2), padding: space(4), borderRadius: radius.card, backgroundColor: colors.surface, ...shadow.card },
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  text: { flex: 1, gap: space(1) },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.surface, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  close: { alignSelf: "flex-end" },
});

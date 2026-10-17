import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { toMapCoord } from "@/components/map/JamMapView";
import { colors } from "@/theme";
import type { MemberStore } from "../memberStore";
import { initials, PRESENCE_OPACITY, profileColor } from "../memberAppearance";

type Props = {
  store: MemberStore;
  userId: string;
  displayName: string;
  isSelf: boolean;
  onPress: (userId: string) => void;
};

/**
 * One member on the map: a coloured circle with initials. Subscribes only to its own member,
 * so other members' updates don't re-render it. `tracksViewChanges` is on only briefly after the
 * marker's look changes (it's expensive to leave on).
 */
export const MemberMarker = memo(function MemberMarker({ store, userId, displayName, isSelf, onPress }: Props) {
  const member = useSyncExternalStore(
    (listener) => store.subscribe(userId, listener),
    () => store.get(userId),
    () => store.get(userId),
  );
  const presence = member?.presence ?? "unavailable";
  const concern = member?.possibleConcern ?? false;
  const look = `${displayName}|${presence}|${concern}|${isSelf}`;

  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const timer = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(timer);
  }, [look]);

  if (!member?.position) return null;
  const color = profileColor(userId);

  return (
    <Marker
      identifier={userId}
      coordinate={toMapCoord(member.position)}
      tracksViewChanges={tracks}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={isSelf ? 20 : concern ? 15 : 10}
      onPress={() => onPress(userId)}
      accessibilityLabel={`${isSelf ? "You" : displayName} on the map`}
    >
      <View style={[styles.halo, concern && styles.concernHalo, { opacity: PRESENCE_OPACITY[presence] }]}>
        <View style={[styles.circle, { backgroundColor: color }, isSelf && styles.self]}>
          <Text style={styles.initials} maxFontSizeMultiplier={1.2}>
            {initials(displayName)}
          </Text>
        </View>
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  halo: { padding: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.9)" },
  concernHalo: { backgroundColor: colors.amber },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  self: { borderColor: colors.navy, borderWidth: 3 },
  initials: { color: colors.surface, fontWeight: "700", fontSize: 14 },
});

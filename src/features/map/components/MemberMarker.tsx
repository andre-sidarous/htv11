import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { toMapCoord } from "@/components/map/JamMapView";
import { fonts, colors } from "@/theme";
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
 * One member on the map: a coloured circle with initials, plus a small name tag underneath so
 * people are identifiable at a glance without having to tell colours apart. Subscribes only to
 * its own member, so other members' updates don't re-render it. `tracksViewChanges` is on only
 * briefly after the marker's look changes (it's expensive to leave on).
 *
 * The anchor's `y` is less than 0.5 (not dead centre) because the name tag sits below the circle
 * within the same marker view — this keeps the circle itself, not the tag, pinned to the
 * member's actual coordinate.
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
  const shortName = isSelf ? "You" : displayName.trim().split(/\s+/)[0] || displayName;

  return (
    <Marker
      identifier={userId}
      coordinate={toMapCoord(member.position)}
      tracksViewChanges={tracks}
      anchor={{ x: 0.5, y: 0.36 }}
      zIndex={isSelf ? 20 : concern ? 15 : 10}
      onPress={() => onPress(userId)}
      accessibilityLabel={`${isSelf ? "You" : displayName} on the map`}
    >
      <View style={styles.wrap}>
        <View style={[styles.halo, concern && styles.concernHalo, { opacity: PRESENCE_OPACITY[presence] }]}>
          <View style={[styles.circle, { backgroundColor: color }, isSelf && styles.self]}>
            <Text style={styles.initials} maxFontSizeMultiplier={1.2}>
              {initials(displayName)}
            </Text>
          </View>
        </View>
        <View style={styles.tag}>
          <Text style={styles.tagText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {shortName}
          </Text>
        </View>
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  halo: {
    padding: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  concernHalo: { backgroundColor: colors.amber },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: colors.surface,
  },
  self: { borderColor: colors.brand, borderWidth: 3.5 },
  initials: { color: colors.surface, fontFamily: fonts.bold, fontWeight: "700", fontSize: 15 },
  tag: {
    marginTop: 2,
    maxWidth: 88,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tagText: { fontFamily: fonts.semibold, fontWeight: "600", fontSize: 11, color: colors.ink },
});

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Circle, Marker, Polyline } from "react-native-maps";
import { toMapCoord } from "@/components/map/JamMapView";
import type { SupportPoint } from "@/lib/types";
import { colors } from "@/theme";
import type { TransitDisruption, TransitLine, TransitStop } from "../civicData";

export const CATEGORY_STYLE: Record<SupportPoint["category"], { glyph: string; color: string; label: string }> = {
  library: { glyph: "L", color: "#5a6fb5", label: "Library" },
  community_centre: { glyph: "C", color: "#2c8a8a", label: "Community centre" },
  school: { glyph: "S", color: "#8a7a5b", label: "School" },
  hospital: { glyph: "H", color: "#3b6ea5", label: "Hospital" },
  police: { glyph: "P", color: "#1f3a5f", label: "Police" },
  transit: { glyph: "T", color: "#b9772a", label: "TTC" },
  washroom: { glyph: "W", color: "#6b8a2f", label: "Washroom" },
  public_space: { glyph: "•", color: "#2f8a5b", label: "Park" },
};

/** Static markers: tracksViewChanges is off, so they render once. */
const SupportMarker = memo(function SupportMarker({ point, highlighted }: { point: SupportPoint; highlighted: boolean }) {
  const style = CATEGORY_STYLE[point.category];
  const status = point.openNow === false ? " · Closed now" : point.openNow ? " · Open now" : "";
  return (
    <Marker
      coordinate={toMapCoord(point)}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
      title={point.name}
      description={`${style.label}${status} · ${point.source}`}
      zIndex={highlighted ? 6 : 2}
      accessibilityLabel={`${style.label}: ${point.name}`}
    >
      <View style={[styles.pin, { backgroundColor: style.color }, highlighted && styles.pinHighlighted, point.openNow === false && styles.closed]}>
        <Text style={styles.glyph} maxFontSizeMultiplier={1}>
          {style.glyph}
        </Text>
      </View>
    </Marker>
  );
});

export const SupportPointLayer = memo(function SupportPointLayer({
  points,
  highlightedIds,
}: {
  points: SupportPoint[];
  highlightedIds: Set<string>;
}) {
  return (
    <>
      {points.map((p) => (
        <SupportMarker key={p.id} point={p} highlighted={highlightedIds.has(p.id)} />
      ))}
    </>
  );
});

/** Subway and streetcar lines (faint) plus surface stops as small dots. */
export const TransitLayer = memo(function TransitLayer({
  lines,
  surfaceStops,
}: {
  lines: TransitLine[];
  surfaceStops: TransitStop[];
}) {
  return (
    <>
      {lines.flatMap((line) =>
        line.segments.map((segment, i) => (
          <Polyline
            key={`${line.id}-${i}`}
            coordinates={segment.map(toMapCoord)}
            strokeColor={line.color}
            strokeWidth={line.mode === "subway" ? 4 : 2}
            zIndex={1}
          />
        )),
      )}
      {surfaceStops.map((stop) => (
        <Marker
          key={stop.id}
          coordinate={toMapCoord(stop)}
          tracksViewChanges={false}
          anchor={{ x: 0.5, y: 0.5 }}
          title={stop.name}
          description="TTC stop · TTC GTFS"
          zIndex={1}
        >
          <View style={styles.stopDot} />
        </Marker>
      ))}
    </>
  );
});

export function DisruptionLayer({ disruption }: { disruption: TransitDisruption }) {
  if (!disruption.location) return null;
  return (
    <>
      <Circle
        center={toMapCoord(disruption.location)}
        radius={120}
        strokeColor={colors.amber}
        fillColor="rgba(224,160,48,0.18)"
        strokeWidth={2}
        zIndex={3}
      />
      <Marker
        coordinate={toMapCoord(disruption.location)}
        tracksViewChanges={false}
        title={disruption.line}
        description={disruption.message}
        zIndex={7}
      >
        <View style={styles.disruptionPin}>
          <Text style={styles.disruptionGlyph} maxFontSizeMultiplier={1}>
            !
          </Text>
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  pinHighlighted: { width: 28, height: 28, borderRadius: 14, borderColor: colors.amber },
  closed: { opacity: 0.55 },
  glyph: { color: colors.surface, fontSize: 11, fontWeight: "700" },
  stopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: "#b9772a",
  },
  disruptionPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  disruptionGlyph: { color: colors.navy, fontWeight: "800", fontSize: 14 },
});

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ROUTE_LEVEL_LABEL } from "@/features/location/routeStatus";
import type { Route, RouteRecommendation, RouteStatus } from "@/lib/types";
import { colors, radius, shadow, space, type } from "@/theme";
import type { TransitDisruption } from "../civicData";
import { CATEGORY_STYLE } from "./SupportLayers";
import { Badge, PillButton } from "./controls";

type Props = {
  destinationName: string | null;
  route: Route | null;
  routeLoading: boolean;
  selfStatus: RouteStatus | null;
  recommendation: RouteRecommendation | null;
  disruption: TransitDisruption | null;
  showAlternative: boolean;
  hasAlternative: boolean;
  onToggleAlternative: () => void;
  onOpenDataSources: () => void;
};

const LEVEL_TONE: Record<RouteStatus["level"], "ok" | "neutral" | "attention"> = {
  on_route: "ok",
  slightly_off: "neutral",
  deviation: "attention",
  significant_deviation: "attention",
};

const minutes = (s: number) => Math.max(1, Math.round(s / 60));

/** Bottom card: where you are relative to the route, plus support context. */
export function RouteStatusCard(props: Props) {
  const { destinationName, route, routeLoading, selfStatus, recommendation, disruption } = props;
  const [expanded, setExpanded] = useState(false);
  const open = expanded || Boolean(disruption);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Hide route details" : "Show route details"}
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={type.heading} numberOfLines={1}>
            {destinationName ? `To ${destinationName}` : "No destination set"}
          </Text>
          <Text style={type.caption}>
            {routeLoading && !route
              ? "Finding a walking route…"
              : route
                ? `${(route.distanceM / 1000).toFixed(1)} km · about ${minutes(route.durationS)} min walk`
                : destinationName
                  ? "Route unavailable"
                  : "The host can add a destination to the Huddle"}
          </Text>
        </View>
        <View style={styles.badges}>
          {selfStatus ? (
            <Badge tone={LEVEL_TONE[selfStatus.level]}>
              {selfStatus.level === "on_route" ? ROUTE_LEVEL_LABEL.on_route : `${ROUTE_LEVEL_LABEL[selfStatus.level]} · ${selfStatus.distanceFromRouteM} m`}
            </Badge>
          ) : null}
          {route?.isDemoRoute ? <Badge>Demo route</Badge> : null}
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {disruption ? (
            <View style={styles.disruption} accessibilityRole="alert">
              <Text style={styles.disruptionTitle}>{disruption.line}</Text>
              <Text style={type.body}>{disruption.message}</Text>
            </View>
          ) : null}

          {recommendation ? <Text style={type.body}>{recommendation.explanation}</Text> : null}

          {recommendation?.supportPoints.length ? (
            <View style={styles.points}>
              <Text style={type.caption}>Public support nearby</Text>
              {recommendation.supportPoints.slice(0, 3).map((p) => (
                <Text key={p.id} style={type.body} numberOfLines={1}>
                  {CATEGORY_STYLE[p.category].label}: {p.name}
                  {p.openNow === false ? " (closed now)" : ""}
                </Text>
              ))}
            </View>
          ) : null}

          {props.hasAlternative ? (
            <PillButton
              label={props.showAlternative ? "Hide alternative route" : "Show alternative route"}
              variant={recommendation?.alternativeRoute && !props.showAlternative ? "primary" : "secondary"}
              onPress={props.onToggleAlternative}
            />
          ) : null}

          <View style={styles.footer}>
            <Text style={[type.caption, styles.attribution]}>Map data © OpenStreetMap / City of Toronto</Text>
            <PillButton label="Data sources" variant="quiet" onPress={props.onOpenDataSources} />
          </View>
        </View>
      ) : (
        <Text style={[type.caption, styles.attributionCollapsed]}>Map data © OpenStreetMap / City of Toronto</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space(4),
    gap: space(2),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space(3), minHeight: 48 },
  headerText: { flex: 1, gap: 2 },
  badges: { alignItems: "flex-end", gap: space(1) },
  body: { gap: space(3) },
  disruption: { gap: space(1), padding: space(3), borderRadius: radius.sm, backgroundColor: colors.amberSoft },
  disruptionTitle: { ...type.heading, fontSize: 15 },
  points: { gap: 2 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  attribution: { flex: 1 },
  attributionCollapsed: { fontSize: 11 },
});

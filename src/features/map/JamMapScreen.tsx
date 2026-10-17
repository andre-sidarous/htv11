import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import type MapView from "react-native-maps";
import { Marker, Polyline } from "react-native-maps";
import { JamMapView, regionAround, toMapCoord } from "@/components/map/JamMapView";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useLocationSharing } from "@/features/location/useLocationSharing";
import { useJamChannel, useJamEvent } from "@/hooks/useJamChannel";
import { campusWalk } from "@/lib/demo/campusWalk";
import type { LatLng, Route } from "@/lib/types";
import { routingService } from "@/services";
import { colors, radius, shadow, space, type } from "@/theme";
import { loadAllSupportPoints, loadTransitDisruption, loadTransitLines, loadTransitStops } from "./civicData";
import { LocationPermissionCard } from "./components/LocationPermissionCard";
import { MemberCard } from "./components/MemberCard";
import { MemberMarker } from "./components/MemberMarker";
import { MemberTrail } from "./components/MemberTrail";
import { RouteStatusCard } from "./components/RouteStatusCard";
import { SharingBar } from "./components/SharingBar";
import { GuideCard } from "./components/GuideCard";
import { DisruptionLayer, SupportPointLayer, TransitLayer } from "./components/SupportLayers";
import { guideRouteKey, pickGuideTarget, type GuideTarget } from "./guideTarget";
import { mapUi, useMapUi } from "./mapUiStore";
import { createMemberStore } from "./memberStore";
import { getRouteRecommendation } from "./recommendation";
import { useJamMapData } from "./useJamMapData";
import { useMapDemoActions } from "./useMapDemoActions";
import { visibleStops, visibleSupportPoints, type MapRegion } from "./visibleMarkers";

/**
 * OWNER: P3. The Map tab renders <JamMapScreen jamId />. Keep the export name and props stable.
 *
 * Shows you, the other members (live over jam:{jamId}), the destination, the planned route,
 * each member's actual path, the alternative route, support points, TTC, and a route-status card.
 */

/** Presence buckets (live → stale → offline) are re-evaluated this often. */
const PRESENCE_TICK_MS = 5_000;
/** The recommendation reads group positions; refresh it at this pace instead of on every update. */
const RECOMMENDATION_REFRESH_MS = 10_000;
const INITIAL_SPAN = 0.015;

const SUPPORT_POINTS = loadAllSupportPoints();
const TRANSIT_LINES = loadTransitLines();
const SURFACE_STOPS = loadTransitStops().filter((s) => s.kind === "surface_stop");
const DISRUPTION = loadTransitDisruption();

export function JamMapScreen({ jamId }: { jamId: string }) {
  const router = useRouter();
  const channel = useJamChannel(jamId);
  const store = useMemo(() => createMemberStore(), []);
  const ui = useMapUi();
  const mapRef = useRef<MapView>(null);

  const [fallbackOrigin, setFallbackOrigin] = useState<LatLng | null>(null);
  const data = useJamMapData(jamId, fallbackOrigin);
  const self = data.members.find((m) => m.userId === data.selfId);

  const sharing = useLocationSharing({
    channel,
    jamId,
    userId: data.selfId,
    locationConsent: self?.locationConsent ?? false,
    jamStatus: data.jam?.status ?? null,
    isActive: self?.isActive ?? false,
    route: data.route,
  });

  useMapDemoActions();

  // Non-preset destinations route from wherever you first appear.
  if (!fallbackOrigin && sharing.lastPosition) setFallbackOrigin(sharing.lastPosition);

  // ---- seed + keep the member store in sync ----
  const inactiveIds = useMemo(
    () => new Set(data.members.filter((m) => !m.isActive).map((m) => m.userId)),
    [data.members],
  );

  useEffect(() => {
    const now = Date.now();
    data.members.filter((m) => m.isActive).forEach((m) => store.ensure(m.userId));
    for (const row of data.initialLocations) {
      if (inactiveIds.has(row.user_id)) continue;
      store.applyLocation(
        {
          jamId,
          userId: row.user_id,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          accuracy: row.accuracy ?? undefined,
          activity: row.activity ?? undefined,
          timestamp: row.last_seen_at,
        },
        now,
        Date.parse(row.last_seen_at),
      );
      if (!row.sharing_enabled) store.applyStatus({ jamId, userId: row.user_id, sharingEnabled: false, timestamp: row.last_seen_at }, now);
    }
    for (const alert of data.openAlerts) {
      store.applyAlert({ ...alert, status: "group_alert", resolvedAt: null });
    }
  }, [data.members, data.initialLocations, data.openAlerts, inactiveIds, jamId, store]);

  useEffect(() => store.setRoute(data.route), [data.route, store]);
  useEffect(() => {
    if (ui.resetCount > 0) store.clearTrails();
  }, [ui.resetCount, store]);
  useEffect(() => {
    const timer = setInterval(() => store.tick(), PRESENCE_TICK_MS);
    return () => clearInterval(timer);
  }, [store]);

  useJamEvent(channel, "location_update", (u) => {
    if (u.jamId === jamId && !inactiveIds.has(u.userId)) store.applyLocation(u);
  });
  useJamEvent(channel, "member_status", (e) => {
    if (e.jamId === jamId) store.applyStatus(e);
  });
  useJamEvent(channel, "health_update", (s) => {
    if (s.jamId === jamId) store.applyHealth(s);
  });
  useJamEvent(channel, "alert_created", (a) => store.applyAlert(a));
  useJamEvent(channel, "alert_updated", (a) => store.applyAlert(a));

  const ids = useSyncExternalStore(store.subscribeIds, store.ids, store.ids);
  const names = useMemo(() => new Map(data.members.map((m) => [m.userId, m.displayName])), [data.members]);

  // ---- route recommendation (support context) ----
  const [recommendationTick, setRecommendationTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRecommendationTick((n) => n + 1), RECOMMENDATION_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  const recommendation = useMemo(() => {
    if (!data.route) return null;
    const groupPositions = store
      .all()
      .filter((m) => m.userId !== data.selfId && m.position && m.presence !== "offline")
      .map((m) => m.position!);
    return getRouteRecommendation({
      route: data.route,
      alternativeRoute: data.alternativeRoute,
      supportPoints: SUPPORT_POINTS,
      disruption: ui.showDisruption ? DISRUPTION : null,
      groupPositions,
      userPosition: sharing.lastPosition ?? undefined,
    });
    // recommendationTick refreshes group positions periodically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.route, data.alternativeRoute, data.selfId, ui.showDisruption, recommendationTick, store]);
  const highlightedIds = useMemo(
    () => new Set((recommendation?.supportPoints ?? []).map((p) => p.id)),
    [recommendation],
  );

  // Citywide civic data: draw only the markers in view (see visibleMarkers.ts).
  const [region, setRegion] = useState<MapRegion | null>(null);
  const viewRegion = useMemo(
    () => region ?? regionAround(data.jam?.destination ?? campusWalk.start, INITIAL_SPAN),
    [region, data.jam?.destination],
  );
  const shownSupport = useMemo(() => visibleSupportPoints(SUPPORT_POINTS, viewRegion, highlightedIds), [viewRegion, highlightedIds]);
  const shownStops = useMemo(() => visibleStops(SURFACE_STOPS, viewRegion), [viewRegion]);

  // ---- "Find Alex" / "Guide me back to my group": a live walking route to that person ----
  const [guide, setGuide] = useState<{ key: string; from: LatLng; target: GuideTarget } | null>(null);
  const [guideRoute, setGuideRoute] = useState<{ key: string; route: Route | null } | null>(null);
  useEffect(() => {
    if (!ui.guide) return;
    const update = () => {
      const me = sharing.lastPosition ?? (data.selfId ? (store.get(data.selfId)?.position ?? null) : null);
      const candidates = store.all().map((m) => ({
        userId: m.userId,
        name: names.get(m.userId) ?? "Huddle member",
        position: m.position,
        presence: m.presence,
        isActive: !inactiveIds.has(m.userId),
      }));
      const target = pickGuideTarget(ui.guide, me, data.selfId, candidates);
      const next = target && me ? { key: guideRouteKey(me, target), from: me, target } : null;
      setGuide((prev) => (prev?.key === next?.key ? prev : next));
    };
    const first = setTimeout(update, 0);
    const timer = setInterval(update, PRESENCE_TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [ui.guide, sharing.lastPosition, data.selfId, names, inactiveIds, store]);
  const activeGuide = ui.guide ? guide : null;
  useEffect(() => {
    if (!activeGuide) return;
    let cancelled = false;
    void routingService
      .getRoute(activeGuide.from, activeGuide.target.position, "walking")
      .catch(() => null)
      .then((route) => {
        // The Campus Walk fallback isn't a route to this person: draw a straight line instead.
        if (!cancelled) setGuideRoute({ key: activeGuide.key, route: route && !route.isDemoRoute ? route : null });
      });
    return () => {
      cancelled = true;
    };
  }, [activeGuide]);
  const guideLine =
    activeGuide && guideRoute?.key === activeGuide.key && guideRoute.route
      ? guideRoute.route.coordinates
      : activeGuide
        ? [activeGuide.from, activeGuide.target.position]
        : null;
  // Frame both ends when guiding starts.
  const framedGuide = useRef<string | null>(null);
  useEffect(() => {
    const target = activeGuide?.target.userId;
    if (!activeGuide || framedGuide.current === target) return;
    framedGuide.current = target ?? null;
    mapRef.current?.fitToCoordinates([toMapCoord(activeGuide.from), toMapCoord(activeGuide.target.position)], {
      edgePadding: { top: 160, right: 64, bottom: 260, left: 64 },
      animated: true,
    });
  }, [activeGuide]);
  const stopGuide = useCallback(() => {
    framedGuide.current = null;
    mapUi.set({ guide: null });
  }, []);

  // Frame the route once it arrives.
  const framedRoute = useRef<string | null>(null);
  useEffect(() => {
    const coords = data.route?.coordinates;
    if (!coords?.length) return;
    const key = `${coords[0]!.latitude},${coords[coords.length - 1]!.latitude}`;
    if (framedRoute.current === key) return;
    framedRoute.current = key;
    mapRef.current?.fitToCoordinates(coords.map(toMapCoord), {
      edgePadding: { top: 160, right: 48, bottom: 220, left: 48 },
      animated: true,
    });
  }, [data.route]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const onMarkerPress = useCallback((userId: string) => setSelectedId(userId), []);
  const toggleAlternative = useCallback(() => mapUi.set({ showAlternative: !mapUi.get().showAlternative }), []);
  const openDataSources = useCallback(() => router.push("/data-sources"), [router]);

  if (data.status === "loading" && !data.jam) return <LoadingState label="Loading the map…" />;
  if (data.status === "error" && !data.jam) {
    return (
      <View style={styles.center}>
        <ErrorState title="The map didn't load" description={data.error ?? undefined} onRetry={data.reload} />
      </View>
    );
  }

  const destination = data.jam?.destination ?? null;
  const center = destination ?? campusWalk.start;
  const jamEnded = data.jam?.status === "ended";
  const sharingCount = ids.filter((id) => store.get(id)?.position).length;
  const showAlternative = ui.showAlternative && Boolean(data.alternativeRoute);

  return (
    <View style={styles.screen}>
      <JamMapView ref={mapRef} center={center} span={INITIAL_SPAN} onRegionChangeComplete={setRegion}>
        <TransitLayer lines={TRANSIT_LINES} surfaceStops={shownStops} />
        {data.route ? (
          <Polyline coordinates={data.route.coordinates.map(toMapCoord)} strokeColor={colors.navy} strokeWidth={5} zIndex={5} />
        ) : null}
        {showAlternative && data.alternativeRoute ? (
          <Polyline
            coordinates={data.alternativeRoute.coordinates.map(toMapCoord)}
            strokeColor={colors.skyStrong}
            strokeWidth={5}
            lineDashPattern={[10, 8]}
            zIndex={5}
          />
        ) : null}
        {guideLine ? (
          <Polyline coordinates={guideLine.map(toMapCoord)} strokeColor={colors.ok} strokeWidth={6} lineDashPattern={guideRoute?.route ? undefined : [8, 8]} zIndex={7} />
        ) : null}
        {data.members
          .filter((m) => m.isActive && m.userId !== data.selfId && m.personalDestination)
          .map((m) => (
            <Marker
              key={`dest-${m.userId}`}
              coordinate={toMapCoord(m.personalDestination!)}
              title={`${m.displayName}’s new destination`}
              description={m.personalDestination!.name}
              pinColor={colors.amber}
              zIndex={8}
            />
          ))}
        <SupportPointLayer points={shownSupport} highlightedIds={highlightedIds} />
        {ui.showDisruption ? <DisruptionLayer disruption={DISRUPTION} /> : null}
        {destination ? (
          <Marker
            coordinate={toMapCoord(destination)}
            title={destination.name}
            description="Huddle destination"
            pinColor={colors.navy}
            zIndex={8}
          />
        ) : null}
        {ids.map((id) => (
          <MemberTrail key={`trail-${id}`} store={store} userId={id} />
        ))}
        {ids.map((id) => (
          <MemberMarker
            key={id}
            store={store}
            userId={id}
            displayName={names.get(id) ?? "Huddle member"}
            isSelf={id === data.selfId}
            onPress={onMarkerPress}
          />
        ))}
      </JamMapView>

      <View style={styles.top} pointerEvents="box-none">
        {jamEnded ? (
          <Banner text="This Huddle has ended. Location sharing has stopped." />
        ) : data.jam?.status === "waiting" ? (
          <Banner text="The Huddle hasn't started yet. Locations appear once the host starts it." />
        ) : null}
        {!jamEnded ? <SharingBar sharing={sharing} /> : null}
        <LocationPermissionCard sharing={sharing} />
        {!jamEnded && data.members.filter((m) => m.isActive).length <= 1 ? (
          <Banner text="It's just you in this Huddle so far. Invite people from the Group tab." />
        ) : !jamEnded && sharingCount === 0 && sharing.state !== "live" ? (
          <Banner text="No one is sharing their location yet." />
        ) : null}
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        {ui.guide ? (
          <GuideCard
            request={ui.guide}
            target={activeGuide?.target ?? null}
            routeDistanceM={activeGuide && guideRoute?.key === activeGuide.key ? (guideRoute.route?.distanceM ?? null) : null}
            onStop={stopGuide}
          />
        ) : selectedId ? (
          <MemberCard
            store={store}
            userId={selectedId}
            member={data.members.find((m) => m.userId === selectedId)}
            isSelf={selectedId === data.selfId}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <RouteStatusCard
            destinationName={destination?.name ?? null}
            route={data.route}
            routeLoading={data.routeLoading}
            selfStatus={sharing.state === "live" ? sharing.routeStatus : null}
            recommendation={recommendation}
            disruption={ui.showDisruption ? DISRUPTION : null}
            showAlternative={showAlternative}
            hasAlternative={Boolean(data.alternativeRoute)}
            onToggleAlternative={toggleAlternative}
            onOpenDataSources={openDataSources}
          />
        )}
      </View>
    </View>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text style={type.body}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.warmWhite },
  center: { flex: 1, justifyContent: "center", padding: space(6), backgroundColor: colors.warmWhite },
  top: { position: "absolute", top: space(3), left: space(3), right: space(3), gap: space(2) },
  bottom: { position: "absolute", bottom: space(3), left: space(3), right: space(3) },
  banner: { padding: space(3), borderRadius: radius.card, backgroundColor: colors.sky, ...shadow.card },
});

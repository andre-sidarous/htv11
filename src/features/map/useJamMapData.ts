import { useCallback, useEffect, useRef, useState } from "react";
import { campusWalk } from "@/lib/demo/campusWalk";
import { mockServicesEnabled } from "@/lib/env";
import { haversineM } from "@/lib/geo";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { EscalationState, JamStatus, LatLng, LiveLocationRow, MemberRole, Route, TravelMode } from "@/lib/types";
import { routingService } from "@/services";

/**
 * Everything the map needs from Supabase for one Jam: the current user, the Jam (destination,
 * status), active members with their consents and names, and last known positions.
 * With no Supabase (mock mode) it serves the Campus Walk scenario so the map still works.
 */

export type MapMember = {
  userId: string;
  displayName: string;
  role: MemberRole;
  isActive: boolean;
  locationConsent: boolean;
  healthConsent: boolean;
};

export type MapJam = {
  id: string;
  name: string;
  status: JamStatus;
  travelMode: TravelMode;
  destination: (LatLng & { name: string }) | null;
};

/** Unresolved alerts, only to label markers "Possible concern" after a reload (P4/P5 own alerts). */
export type OpenAlert = { id: string; affectedUserId: string; escalationState: EscalationState };

export type JamMapData = {
  status: "loading" | "ready" | "error";
  error: string | null;
  selfId: string | null;
  jam: MapJam | null;
  members: MapMember[];
  initialLocations: LiveLocationRow[];
  openAlerts: OpenAlert[];
  route: Route | null;
  alternativeRoute: Route | null;
  routeLoading: boolean;
  reload: () => void;
};

/** Destinations within this distance of the Campus Walk preset use the Campus Walk start. */
const PRESET_MATCH_M = 75;

function mockData(jamId: string): Omit<JamMapData, "route" | "alternativeRoute" | "routeLoading" | "reload"> {
  const host = campusWalk.members.find((m) => m.role === "host") ?? campusWalk.members[0]!;
  const now = new Date().toISOString();
  return {
    status: "ready",
    error: null,
    selfId: host.userId,
    jam: {
      id: jamId,
      name: campusWalk.jam.name,
      status: "active",
      travelMode: campusWalk.jam.travelMode,
      destination: campusWalk.destination,
    },
    members: campusWalk.members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      role: m.role,
      isActive: true,
      locationConsent: true,
      healthConsent: true,
    })),
    initialLocations: campusWalk.members
      .filter((m) => m.userId !== host.userId)
      .map((m) => ({
        id: `mock-${m.userId}`,
        jam_id: jamId,
        user_id: m.userId,
        latitude: m.position.latitude,
        longitude: m.position.longitude,
        accuracy: 8,
        activity: "walking",
        sharing_enabled: true,
        last_seen_at: now,
        created_at: now,
      })),
    openAlerts: [],
  };
}

/** Start of the planned route: the Campus Walk start for the preset, else a known position. */
export function routeOrigin(destination: LatLng, fallback: LatLng | null): LatLng | null {
  if (haversineM(destination, campusWalk.destination) <= PRESET_MATCH_M) return campusWalk.start;
  return fallback;
}

export function useJamMapData(jamId: string, fallbackOrigin: LatLng | null): JamMapData {
  const supabase = mockServicesEnabled ? null : getSupabaseClient();
  const [state, setState] = useState<Omit<JamMapData, "route" | "alternativeRoute" | "routeLoading" | "reload">>({
    status: "loading",
    error: null,
    selfId: null,
    jam: null,
    members: [],
    initialLocations: [],
    openAlerts: [],
  });
  const [routes, setRoutes] = useState<{ route: Route | null; alternativeRoute: Route | null; key: string | null }>({
    route: null,
    alternativeRoute: null,
    key: null,
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (quiet: boolean) => {
      if (!supabase) {
        setState(mockData(jamId));
        return;
      }
      if (!quiet) setState((s) => ({ ...s, status: "loading", error: null }));
      try {
        const { data: auth } = await supabase.auth.getUser();
        const selfId = auth.user?.id ?? null;
        if (!selfId) throw new Error("Sign in to see your Huddle's map.");

        const [jamRes, membersRes, locationsRes, alertsRes] = await Promise.all([
          supabase
            .from("jams")
            .select("id, name, status, travel_mode, destination_name, destination_lat, destination_lng")
            .eq("id", jamId)
            .maybeSingle(),
          supabase
            .from("jam_members")
            .select("user_id, role, is_active, location_consent, health_consent")
            .eq("jam_id", jamId),
          supabase.from("live_locations").select("*").eq("jam_id", jamId),
          supabase
            .from("alerts")
            .select("id, affected_user_id, escalation_state")
            .eq("jam_id", jamId)
            .is("resolved_at", null),
        ]);
        if (jamRes.error) throw jamRes.error;
        if (!jamRes.data) throw new Error("This Huddle isn't available. You may not be a member.");
        if (membersRes.error) throw membersRes.error;

        const rows = membersRes.data ?? [];
        const ids = rows.map((r) => r.user_id);
        const profiles = ids.length
          ? await supabase.from("member_profiles").select("id, display_name").in("id", ids)
          : { data: [], error: null };
        const names = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]));

        const j = jamRes.data;
        const hasDestination = j.destination_lat != null && j.destination_lng != null;
        setState({
          status: "ready",
          error: null,
          selfId,
          jam: {
            id: j.id,
            name: j.name,
            status: j.status,
            travelMode: j.travel_mode,
            destination: hasDestination
              ? { name: j.destination_name ?? "Destination", latitude: Number(j.destination_lat), longitude: Number(j.destination_lng) }
              : null,
          },
          members: rows.map((r) => ({
            userId: r.user_id,
            displayName: names.get(r.user_id) ?? "Huddle member",
            role: r.role,
            isActive: r.is_active,
            locationConsent: r.location_consent,
            healthConsent: r.health_consent,
          })),
          // Positions are optional; RLS hides members who aren't sharing.
          initialLocations: locationsRes.error ? [] : (locationsRes.data ?? []),
          openAlerts: alertsRes.error
            ? []
            : (alertsRes.data ?? []).map((a) => ({ id: a.id, affectedUserId: a.affected_user_id, escalationState: a.escalation_state })),
        });
        loadedOnce.current = true;
      } catch (error) {
        console.warn("[map] load failed", error);
        // A failed background refresh keeps the last good data on screen.
        if (quiet && loadedOnce.current) return;
        setState((s) => ({
          ...s,
          status: "error",
          error: error instanceof Error ? error.message : "The map couldn't load.",
        }));
      }
    },
    [jamId, supabase],
  );

  useEffect(() => {
    void load(false);
  }, [load, attempt]);

  // Jam ending, members joining/leaving, and consent changes arrive as row changes.
  useEffect(() => {
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(true), 300);
    };
    const channel = supabase
      .channel(`map-db:${jamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jams", filter: `id=eq.${jamId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_members", filter: `jam_id=eq.${jamId}` }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [jamId, load, supabase]);

  // Planned + alternative route, once per destination/origin.
  const destination = state.jam?.destination ?? null;
  const origin = destination ? routeOrigin(destination, fallbackOrigin) : null;
  const travelMode = state.jam?.travelMode ?? "walking";
  const routeKey =
    destination && origin
      ? [origin.latitude, origin.longitude, destination.latitude, destination.longitude].map((n) => n.toFixed(4)).join(",")
      : null;

  useEffect(() => {
    if (!routeKey || !origin || !destination || routes.key === routeKey) return;
    let cancelled = false;
    setRouteLoading(true);
    void Promise.all([
      routingService.getRoute(origin, destination, travelMode),
      routingService.getAlternativeRoute(origin, destination, travelMode),
    ])
      .then(([route, alternativeRoute]) => {
        if (!cancelled) setRoutes({ route, alternativeRoute, key: routeKey });
      })
      .catch((error) => console.warn("[map] routing failed", error))
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // origin/destination are derived from routeKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, travelMode]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, route: routes.route, alternativeRoute: routes.alternativeRoute, routeLoading, reload };
}

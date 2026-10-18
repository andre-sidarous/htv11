import { useEffect } from "react";
import { DEMO_ACTION_IDS, demoActions } from "@/features/demo/demoActions";
import { getDemoContext } from "@/features/demo/demoContext";
import { campusWalk } from "@/lib/demo/campusWalk";
import { distanceToPolylineM, haversineM } from "@/lib/geo";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { DemoAction, LatLng } from "@/lib/types";
import { realtimeService, routingService } from "@/services";
import { mapUi } from "./mapUiStore";
import { bearingDeg } from "./guidance";
import { nearestHelp, pickQuietSpot, straightPath, thinPath } from "./quietArea";

/**
 * P3's demo actions (owner "map"). They run on the phone that taps them, so every movement is
 * BROADCAST on jam:{jamId} for the affected user (ids from getDemoContext(), never hardcoded).
 * The affected user's own phone sees an update it didn't send and switches to the simulated
 * source (see useLocationSharing), so its real GPS doesn't snap it back.
 */

const STEP_MS = 1_500;

/** Where the scripted moves last put the affected user (the next move starts there). */
let lastAffectedPosition: LatLng | null = null;

/** Only one scripted movement at a time; a new one (or a stop/reset) cancels the previous. */
let runToken = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withChannel(run: (send: ReturnType<typeof sender>) => Promise<void>) {
  const { jamId, affectedUserId } = getDemoContext();
  const channel = realtimeService.join(jamId);
  try {
    await run(sender(channel, jamId, affectedUserId));
  } finally {
    channel.release();
  }
}

function sender(channel: ReturnType<typeof realtimeService.join>, jamId: string, userId: string) {
  return {
    location: (p: LatLng, activity = "walking") => {
      lastAffectedPosition = p;
      return channel.send("location_update", {
        jamId,
        userId,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: 8,
        activity,
        timestamp: new Date().toISOString(),
      });
    },
    /**
     * A presence hint for the affected phone only: "offline" makes it stop broadcasting,
     * "live" resumes. Other phones ignore broadcast presence and use their own timers.
     */
    presence: (presence: "live" | "offline") =>
      channel.send("member_status", { jamId, userId, presence, timestamp: new Date().toISOString() }),
  };
}

async function walk(path: LatLng[], activity?: string) {
  const token = ++runToken;
  await withChannel(async (send) => {
    for (const point of path) {
      if (token !== runToken) return;
      await send.location(point, activity);
      await sleep(STEP_MS);
    }
  });
}

/** The planned route from the point nearest the start of the off-route path to the destination. */
function pathTowardDestination(): LatLng[] {
  const route = campusWalk.plannedRoute;
  const from = campusWalk.affectedUserOffRoutePath[0] ?? campusWalk.start;
  let nearest = 0;
  route.forEach((p, i) => {
    if (haversineM(p, from) < haversineM(route[nearest]!, from)) nearest = i;
  });
  return route.slice(nearest);
}

/** The off-route point furthest from the planned route (> 350m: significant deviation). */
function deviationPoint(): LatLng {
  const path = campusWalk.affectedUserOffRoutePath;
  return path.reduce((best, p) =>
    distanceToPolylineM(p, campusWalk.plannedRoute) > distanceToPolylineM(best, campusWalk.plannedRoute) ? p : best,
  path[0] ?? campusWalk.start);
}

/** A real walking route from a to b, thinned to `steps` moves (straight line if routing is down). */
async function walkingPath(a: LatLng, b: LatLng, steps: number): Promise<LatLng[]> {
  const route = await routingService.getRoute(a, b, "walking").catch(() => null);
  const usable = route && !route.isDemoRoute && route.coordinates.length >= 2;
  return usable ? thinPath(route.coordinates, steps) : straightPath(a, b, steps);
}

// ---- moves relative to where the affected person REALLY is (works anywhere, not just on campus) ----

/** The scripted Campus Walk paths only apply this close to that campus. */
const CAMPUS_NEARBY_M = 3_000;
const nearCampus = (p: LatLng) => haversineM(p, campusWalk.start) <= CAMPUS_NEARBY_M;

/** Their position now: the last scripted move, else their last shared location, else the campus script. */
async function affectedNow(): Promise<LatLng> {
  if (lastAffectedPosition) return lastAffectedPosition;
  const { jamId, affectedUserId } = getDemoContext();
  const { data } = (await getSupabaseClient()
    ?.from("live_locations")
    .select("latitude, longitude")
    .eq("jam_id", jamId)
    .eq("user_id", affectedUserId)
    .maybeSingle()) ?? { data: null };
  return data ? { latitude: Number(data.latitude), longitude: Number(data.longitude) } : campusWalk.start;
}

/** Where the affected person is heading: their own destination, else the Huddle's (null if neither). */
async function huddleDestination(): Promise<LatLng | null> {
  const { jamId, affectedUserId } = getDemoContext();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const [{ data: mine }, { data: jam }] = await Promise.all([
    supabase.from("jam_members").select("destination_lat, destination_lng").eq("jam_id", jamId).eq("user_id", affectedUserId).maybeSingle(),
    supabase.from("jams").select("destination_lat, destination_lng").eq("id", jamId).maybeSingle(),
  ]);
  const d = mine?.destination_lat != null && mine.destination_lng != null ? mine : jam;
  return d?.destination_lat != null && d.destination_lng != null ? { latitude: Number(d.destination_lat), longitude: Number(d.destination_lng) } : null;
}

/** A point `metres` from `from` toward compass `bearing`. */
function offset(from: LatLng, bearing: number, metres: number): LatLng {
  const rad = (bearing * Math.PI) / 180;
  return {
    latitude: from.latitude + (metres * Math.cos(rad)) / 111_320,
    longitude: from.longitude + (metres * Math.sin(rad)) / (111_320 * Math.cos((from.latitude * Math.PI) / 180)),
  };
}

/** Sideways away from the way to the destination (or west with no destination): a real route deviation. */
async function awayPath(metres: number, steps: number): Promise<LatLng[]> {
  const from = await affectedNow();
  const dest = await huddleDestination();
  const heading = dest ? bearingDeg(from, dest) : 0;
  return straightPath(from, offset(from, heading + 90, metres), steps).slice(1);
}

/** The route line to judge "away from the route" against, for the quiet-area pick. */
async function routeLineFrom(from: LatLng): Promise<LatLng[]> {
  if (nearCampus(from)) return campusWalk.plannedRoute;
  const dest = await huddleDestination();
  return dest ? [from, dest] : [from, offset(from, 0, 100)];
}


const affectedStart = (): LatLng =>
  campusWalk.members.find((m) => m.demoRole === "affected_user")?.position ?? campusWalk.start;

export const MAP_DEMO_ACTIONS: DemoAction[] = [
  {
    id: DEMO_ACTION_IDS.moveAffectedUserAway,
    label: "Move affected user away",
    owner: "map",
    async run() {
      const from = await affectedNow();
      // On the Campus Walk campus, the scripted path; anywhere else, ~450 m sideways from their route.
      await walk(nearCampus(from) && !lastAffectedPosition ? campusWalk.affectedUserOffRoutePath : await awayPath(450, 6));
    },
  },
  {
    id: DEMO_ACTION_IDS.triggerRouteDeviation,
    label: "Trigger route deviation",
    owner: "map",
    run: async () => {
      ++runToken;
      const from = await affectedNow();
      const point = nearCampus(from) ? deviationPoint() : (await awayPath(380, 1)).at(-1)!;
      await withChannel((send) => send.location(point));
    },
  },
  {
    id: DEMO_ACTION_IDS.moveTowardDestination,
    label: "Move toward destination",
    owner: "map",
    async run() {
      const from = await affectedNow();
      const dest = await huddleDestination();
      await walk(nearCampus(from) || !dest ? pathTowardDestination() : await walkingPath(from, dest, 10));
    },
  },
  {
    id: DEMO_ACTION_IDS.stopLocationUpdates,
    label: "Stop location updates",
    owner: "map",
    run: async () => {
      ++runToken;
      // The affected phone goes quiet; every phone then shows Live → stale → offline on its own timers.
      await withChannel((send) => send.presence("offline"));
    },
  },
  {
    id: DEMO_ACTION_IDS.resetLocations,
    label: "Reset locations",
    owner: "map",
    run: async () => {
      ++runToken;
      const real = await affectedNow();
      lastAffectedPosition = null;
      mapUi.reset();
      await withChannel(async (send) => {
        await send.presence("live");
        // Only snap to the Campus Walk start on that campus; elsewhere their phone goes back to its GPS.
        if (nearCampus(real)) await send.location(affectedStart());
      });
    },
  },
  {
    id: DEMO_ACTION_IDS.walkToQuietArea,
    label: "Walk into a quiet area (few TTC stops)",
    owner: "map",
    async run() {
      const from = lastAffectedPosition ?? (await affectedNow());
      const spot = pickQuietSpot(from, await routeLineFrom(from));
      if (!spot) throw new Error("No quiet spot found near them.");
      await walk(await walkingPath(from, spot, 8));
    },
  },
  {
    id: DEMO_ACTION_IDS.walkTowardHelp,
    label: "Walk toward the nearest public place",
    owner: "map",
    async run() {
      const from = lastAffectedPosition ?? (await affectedNow());
      const help = nearestHelp(from);
      if (!help) throw new Error("No public place nearby.");
      await walk(await walkingPath(from, help, 16));
    },
  },
  {
    id: DEMO_ACTION_IDS.showDisruption,
    label: "Show transit disruption",
    owner: "map",
    run: async () => mapUi.set({ showDisruption: true }),
  },
  {
    id: DEMO_ACTION_IDS.showAlternativeRoute,
    label: "Show alternative route",
    owner: "map",
    run: async () => mapUi.set({ showAlternative: true }),
  },
];

/** Registers P3's demo actions while the map is mounted. */
export function useMapDemoActions() {
  useEffect(() => {
    const unregister = MAP_DEMO_ACTIONS.map((action) => demoActions.register(action));
    return () => unregister.forEach((off) => off());
  }, []);
}

import { useEffect } from "react";
import { DEMO_ACTION_IDS, demoActions } from "@/features/demo/demoActions";
import { getDemoContext } from "@/features/demo/demoContext";
import { campusWalk } from "@/lib/demo/campusWalk";
import { distanceToPolylineM, haversineM } from "@/lib/geo";
import type { DemoAction, LatLng } from "@/lib/types";
import { realtimeService } from "@/services";
import { mapUi } from "./mapUiStore";

/**
 * P3's demo actions (owner "map"). They run on the phone that taps them, so every movement is
 * BROADCAST on jam:{jamId} for the affected user (ids from getDemoContext(), never hardcoded).
 * The affected user's own phone sees an update it didn't send and switches to the simulated
 * source (see useLocationSharing), so its real GPS doesn't snap it back.
 */

const STEP_MS = 1_500;

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
    location: (p: LatLng, activity = "walking") =>
      channel.send("location_update", {
        jamId,
        userId,
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: 8,
        activity,
        timestamp: new Date().toISOString(),
      }),
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

const affectedStart = (): LatLng =>
  campusWalk.members.find((m) => m.demoRole === "affected_user")?.position ?? campusWalk.start;

export const MAP_DEMO_ACTIONS: DemoAction[] = [
  {
    id: DEMO_ACTION_IDS.moveAffectedUserAway,
    label: "Move affected user away",
    owner: "map",
    run: () => walk(campusWalk.affectedUserOffRoutePath),
  },
  {
    id: DEMO_ACTION_IDS.triggerRouteDeviation,
    label: "Trigger route deviation",
    owner: "map",
    run: async () => {
      ++runToken;
      await withChannel((send) => send.location(deviationPoint()));
    },
  },
  {
    id: DEMO_ACTION_IDS.moveTowardDestination,
    label: "Move toward destination",
    owner: "map",
    run: () => walk(pathTowardDestination()),
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
      mapUi.reset();
      await withChannel(async (send) => {
        await send.presence("live");
        await send.location(affectedStart());
      });
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

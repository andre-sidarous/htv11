import { campusWalk } from "@/lib/demo/campusWalk";

export type DestinationPreset = { name: string; latitude: number; longitude: number };

/** The Campus Walk preset used by the demo day script. Keep destination in sync with it. */
export const CAMPUS_WALK_DESTINATION: DestinationPreset = {
  name: campusWalk.destination.name,
  latitude: campusWalk.destination.latitude,
  longitude: campusWalk.destination.longitude,
};

/** Simple preset list (no map UI yet — P3 may enhance with a map-pick screen). */
export const DESTINATION_PRESETS: DestinationPreset[] = [
  CAMPUS_WALK_DESTINATION,
  ...campusWalk.supportPoints
    .filter((p) => p.category === "transit" || p.category === "library")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
];

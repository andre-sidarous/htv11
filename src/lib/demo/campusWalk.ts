import raw from "./campus-walk.json";
import type { LatLng, Route, SupportPoint, TravelMode } from "@/lib/types";
import { polylineLengthM } from "@/lib/geo";

export type DemoRole = "host" | "group_member" | "affected_user" | "emergency_contact";

/** Typed view of ./campus-walk.json. */
export const campusWalk = {
  jam: { ...raw.jam, travelMode: raw.jam.travelMode as TravelMode },
  start: raw.start,
  destination: raw.destination,
  members: raw.members.map((m) => ({
    ...m,
    role: m.role as "host" | "member",
    demoRole: m.demoRole as DemoRole,
  })),
  emergencyContact: raw.emergencyContact,
  plannedRoute: raw.plannedRoute as LatLng[],
  affectedUserOffRoutePath: raw.affectedUserOffRoutePath as LatLng[],
  alternativeRoute: raw.alternativeRoute as LatLng[],
  supportPoints: raw.supportPoints as SupportPoint[],
  mockDisruption: raw.mockDisruption,
  health: raw.health,
} as const;

const WALKING_SPEED_MPS = 1.3;

export function toDemoRoute(coordinates: LatLng[]): Route {
  const distanceM = polylineLengthM(coordinates);
  return {
    coordinates,
    distanceM,
    durationS: Math.round(distanceM / WALKING_SPEED_MPS),
    source: "demo",
    isDemoRoute: true,
  };
}

export const AFFECTED_USER_ID = campusWalk.members.find((m) => m.demoRole === "affected_user")!.userId;

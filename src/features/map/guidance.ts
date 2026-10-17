import { haversineM } from "@/lib/geo";
import type { LatLng, Route, SupportPoint } from "@/lib/types";
import { boxAround, loadAllSupportPoints, pointsInBox, streetsInBox, type Street } from "./civicData";

/**
 * Short spoken directions for P4's AI support call. Pure and deterministic.
 *
 *   getSpokenGuidance({ position, route, destination, supportPoints })
 *   → { guidance: "Head north on St. George Street for about 200 metres, toward Robarts Library.", nearestSupportPoint, supportNote }
 *
 * - Within 200m of the route: look ~100m ahead along the route for the direction, and say how far the
 *   route keeps going that way (capped so the line stays short).
 * - More than 200m off: guide back to the nearest point on the route, or to the nearest public
 *   support point if that's closer.
 * - supportNote: how much public support is around them, and how far the nearest one is
 *   ("You're in an area with few public support points. The nearest is Robarts Library, about 400 metres to the east.").
 * Never says a place or street is "safe".
 */

export type SpokenGuidanceInput = {
  position: LatLng;
  route: Route | null;
  destination: LatLng & { name?: string };
  supportPoints?: SupportPoint[];
  /** Street names for "on St. George Street". Defaults to the Toronto centreline (only streets near the person are checked). */
  streets?: Street[];
};

export type SpokenGuidance = { guidance: string; nearestSupportPoint?: string; supportNote?: string };

export const GUIDANCE_OFF_ROUTE_M = 200;
/** Spoken-category support points within this radius count as "nearby". */
export const SUPPORT_NEARBY_M = 300;
/** Fewer nearby support points than this → "an area with few public support points". */
export const FEW_SUPPORT_POINTS = 2;
/**
 * Never name a support point farther than this. The civic data only covers the Campus Walk area
 * (~2 km around U of T St. George), so elsewhere we say nothing rather than "25 kilometres to the north".
 */
export const MAX_SPOKEN_SUPPORT_M = 1_500;
const LOOK_AHEAD_M = 100;
/** The longest stretch spoken in one line ("for about 300 metres"). */
const MAX_SPOKEN_RUN_M = 300;
/** A bend sharper than this ends the current stretch. */
const TURN_DEGREES = 35;
const ARRIVED_M = 40;
const STREET_MATCH_M = 35;
const TOWARD_MATCH_M = 150;
/** Only look this far past the spoken stretch for a "toward …" landmark. */
const TOWARD_AHEAD_M = 350;
/**
 * Landmarks worth saying out loud: staffed or easy-to-find public places. Schools (mostly
 * university buildings here) and small parks are used only if nothing else is around.
 */
const SPOKEN_CATEGORIES = new Set<SupportPoint["category"]>([
  "library",
  "transit",
  "community_centre",
  "hospital",
  "police",
  "washroom",
]);

// ---------- geometry (local flat projection; fine at city scale) ----------

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Initial compass bearing from a to b, 0-360 (0 = north). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export const compassWord = (bearing: number) => COMPASS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8]!;

const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({
  latitude: a.latitude + (b.latitude - a.latitude) * t,
  longitude: a.longitude + (b.longitude - a.longitude) * t,
});

type Projection = { point: LatLng; distanceM: number; alongM: number };

/** Nearest point on the line, its distance from `p`, and how far along the line it is. */
function project(p: LatLng, line: LatLng[]): Projection | null {
  if (line.length === 0) return null;
  if (line.length === 1) return { point: line[0]!, distanceM: haversineM(p, line[0]!), alongM: 0 };
  const cosLat = Math.cos(toRad(p.latitude));
  const xy = (q: LatLng) => ({ x: toRad(q.longitude - p.longitude) * cosLat, y: toRad(q.latitude - p.latitude) });
  let best: Projection | null = null;
  let along = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const pa = xy(a);
    const pb = xy(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(pa.x * dx + pa.y * dy) / lenSq));
    const point = lerp(a, b, t);
    const distanceM = haversineM(p, point);
    const segmentM = haversineM(a, b);
    if (!best || distanceM < best.distanceM) best = { point, distanceM, alongM: along + segmentM * t };
    along += segmentM;
  }
  return best;
}

/** The point `alongM` metres along the line (clamped to its ends). */
function pointAlong(line: LatLng[], alongM: number): LatLng {
  let remaining = Math.max(0, alongM);
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const segmentM = haversineM(a, b);
    if (remaining <= segmentM) return segmentM === 0 ? a : lerp(a, b, remaining / segmentM);
    remaining -= segmentM;
  }
  return line[line.length - 1]!;
}

function lineLength(line: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += haversineM(line[i]!, line[i + 1]!);
  return total;
}

/** Distance (from `startM`) the route keeps heading within TURN_DEGREES of `bearing`. */
function straightRunM(line: LatLng[], startM: number, bearing: number, totalM: number): number {
  const STEP_M = 20;
  let s = startM;
  while (s < totalM) {
    const next = Math.min(totalM, s + STEP_M);
    const a = pointAlong(line, s);
    const b = pointAlong(line, next);
    if (haversineM(a, b) > 1 && angleBetween(bearingDeg(a, b), bearing) > TURN_DEGREES) break;
    s = next;
  }
  return s - startM;
}

// ---------- words ----------

/** "about 200 metres", "about 1.2 kilometres". */
export function spokenDistance(m: number): string {
  if (m >= 950) {
    const km = (Math.round(m / 100) / 10).toFixed(1).replace(/\.0$/, "");
    return `about ${km} ${km === "1" ? "kilometre" : "kilometres"}`;
  }
  const rounded = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
  return `about ${rounded} metres`;
}

const SUFFIXES: Record<string, string> = {
  St: "Street",
  Ave: "Avenue",
  Rd: "Road",
  Cres: "Crescent",
  Blvd: "Boulevard",
  Dr: "Drive",
  Pl: "Place",
  Ln: "Lane",
  Crt: "Court",
  Sq: "Square",
  Trl: "Trail",
  Gdns: "Gardens",
  Pkwy: "Parkway",
};
const DIRECTIONS: Record<string, string> = { N: "North", S: "South", E: "East", W: "West" };

/** Centreline abbreviations → spoken form: "St George St" → "St. George Street", "Bloor St W" → "Bloor Street West". */
export function spokenStreetName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length > 1 && DIRECTIONS[words[words.length - 1]!]) {
    words[words.length - 1] = DIRECTIONS[words[words.length - 1]!]!;
  }
  for (let i = words.length - 1; i >= 1; i--) {
    const suffix = SUFFIXES[words[i]!];
    if (suffix) {
      words[i] = suffix;
      break;
    }
  }
  if (words[0] === "St" && words.length > 1) words[0] = "St.";
  return words.join(" ");
}

function streetAlong(points: LatLng[], streets: Street[]): string | null {
  let best: { name: string; hits: number } | null = null;
  for (const street of streets) {
    const hits = points.filter((p) =>
      street.segments.some((segment) => (project(p, segment)?.distanceM ?? Infinity) <= STREET_MATCH_M),
    ).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { name: street.name, hits };
  }
  return best && best.hits >= Math.ceil(points.length / 2) ? spokenStreetName(best.name) : null;
}

function nearest(points: SupportPoint[], p: LatLng): { point: SupportPoint; distanceM: number } | null {
  let best: { point: SupportPoint; distanceM: number } | null = null;
  for (const point of points) {
    const distanceM = haversineM(point, p);
    if (!best || distanceM < best.distanceM) best = { point, distanceM };
  }
  return best;
}

/** "You're in an area with few public support points. The nearest is X, about 400 metres to the east." */
export function describeSupportNearby(position: LatLng, supportPoints: SupportPoint[]): string | undefined {
  const closest = nearest(supportPoints, position);
  if (!closest || closest.distanceM > MAX_SPOKEN_SUPPORT_M) return undefined;
  const where = `${closest.point.name}, ${spokenDistance(closest.distanceM)} to the ${compassWord(bearingDeg(position, closest.point))}`;
  const nearby = supportPoints.filter((p) => haversineM(p, position) <= SUPPORT_NEARBY_M).length;
  return nearby < FEW_SUPPORT_POINTS
    ? `You're in an area with few public support points. The nearest is ${where}.`
    : `The nearest public support point is ${where}.`;
}

const nameOf = (d: SpokenGuidanceInput["destination"]) => d.name?.trim() || "your destination";

// ---------- main ----------

/** Support points worth saying out loud (staffed / easy to find); all of them if none of those exist. */
export function spokenSupportPoints(allPoints: SupportPoint[] = loadAllSupportPoints()): SupportPoint[] {
  const preferred = allPoints.filter((p) => SPOKEN_CATEGORIES.has(p.category));
  return preferred.length ? preferred : allPoints;
}

export function getSpokenGuidance(input: SpokenGuidanceInput): SpokenGuidance {
  const { position, destination } = input;
  const supportPoints = spokenSupportPoints(input.supportPoints);
  // Citywide centreline: only check the streets around the points being named.
  const streetsNear = (points: LatLng[]) => input.streets ?? streetsInBox(boxAround(points, STREET_MATCH_M));
  const found = nearest(supportPoints, position);
  const closest = found && found.distanceM <= MAX_SPOKEN_SUPPORT_M ? found : null;
  const nearestSupportPoint = closest?.point.name;
  const supportNote = describeSupportNearby(position, supportPoints);
  const withNearest = (guidance: string): SpokenGuidance => ({
    guidance,
    ...(nearestSupportPoint ? { nearestSupportPoint } : {}),
    ...(supportNote ? { supportNote } : {}),
  });

  const toDestinationM = haversineM(position, destination);
  if (toDestinationM <= ARRIVED_M) return withNearest(`You're at ${nameOf(destination)}.`);

  const line = input.route?.coordinates ?? [];
  const onRoute = line.length >= 2 ? project(position, line) : null;

  // No usable route: point straight at the destination.
  if (!onRoute) {
    const dir = compassWord(bearingDeg(position, destination));
    return withNearest(`Head ${dir} for ${spokenDistance(toDestinationM)} toward ${nameOf(destination)}.`);
  }

  // Far from the route: back to it, or to a closer public support point.
  if (onRoute.distanceM > GUIDANCE_OFF_ROUTE_M) {
    if (closest && closest.distanceM < onRoute.distanceM) {
      const dir = compassWord(bearingDeg(position, closest.point));
      return withNearest(`Head ${dir} for ${spokenDistance(closest.distanceM)} to ${closest.point.name}.`);
    }
    const dir = compassWord(bearingDeg(position, onRoute.point));
    const street = streetAlong([onRoute.point], streetsNear([onRoute.point]));
    const target = street ? `back to your route on ${street}` : "back to your route";
    return withNearest(`Head ${dir} for ${spokenDistance(onRoute.distanceM)} to get ${target}.`);
  }

  // On or near the route: direction from ~100m ahead, distance until the route bends.
  const totalM = lineLength(line);
  const remainingM = Math.max(0, totalM - onRoute.alongM);
  if (remainingM <= ARRIVED_M) {
    const dir = compassWord(bearingDeg(position, destination));
    return withNearest(`${nameOf(destination)} is just ahead, ${spokenDistance(toDestinationM)} to the ${dir}.`);
  }
  const ahead = pointAlong(line, onRoute.alongM + Math.min(LOOK_AHEAD_M, remainingM));
  const bearing = bearingDeg(onRoute.point, ahead);
  const runM = Math.min(MAX_SPOKEN_RUN_M, Math.max(straightRunM(line, onRoute.alongM, bearing, totalM), Math.min(LOOK_AHEAD_M, remainingM)));
  const runEndM = onRoute.alongM + runM;
  const runEnd = pointAlong(line, runEndM);

  const samples = [0.15, 0.4, 0.65, 0.9].map((f) => pointAlong(line, onRoute.alongM + runM * f));
  const street = streetAlong(samples, streetsNear(samples));

  // "toward …": the destination if this stretch reaches it, else a support point near the end of it.
  let toward: string | null = null;
  if (remainingM - runM <= TOWARD_MATCH_M) toward = nameOf(destination);
  else {
    // Only support points around the stretch ahead (sampled every 50m), not the whole city.
    const window: LatLng[] = [];
    for (let m = onRoute.alongM; m <= runEndM + TOWARD_AHEAD_M; m += 50) window.push(pointAlong(line, m));
    const candidates = pointsInBox(supportPoints, boxAround(window, TOWARD_MATCH_M)).filter((p) => {
      const proj = project(p, line);
      return (
        proj !== null &&
        proj.distanceM <= TOWARD_MATCH_M &&
        proj.alongM > onRoute.alongM + 30 &&
        proj.alongM <= runEndM + TOWARD_AHEAD_M
      );
    });
    toward = nearest(candidates, runEnd)?.point.name ?? null;
  }

  const parts = [`Head ${compassWord(bearing)}`];
  if (street) parts.push(`on ${street}`);
  parts.push(`for ${spokenDistance(runM)}`);
  return withNearest(`${parts.join(" ")}${toward ? `, toward ${toward}` : ""}.`);
}

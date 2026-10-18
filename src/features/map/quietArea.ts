import { distanceToPolylineM, haversineM } from "@/lib/geo";
import type { LatLng, SupportPoint } from "@/lib/types";
import { boxAround, linesInBox, loadPedestrianNetwork, loadTransitStops, pointsInBox } from "./civicData";
import { spokenSupportPoints } from "./guidance";

/**
 * City-data helpers for the demo story (and the AI call's "you're away from public support" line):
 *   pickQuietSpot   — a sidewalk point near them, away from the route, with the fewest public
 *                     support places and TTC stops around it (Toronto Open Data).
 *   transitNearby   — TTC stops within walking distance.
 *   nearestHelp     — the closest place worth walking to (library, station, hospital, ...).
 * Pure (no react-native), so it's unit-tested.
 */

export const NEARBY_M = 300;

export function transitNearby(at: LatLng, withinM = NEARBY_M) {
  const stops = pointsInBox(loadTransitStops(), boxAround([at], withinM))
    .map((s) => ({ stop: s, distanceM: haversineM(at, s) }))
    .filter((s) => s.distanceM <= withinM)
    .sort((a, b) => a.distanceM - b.distanceM);
  return { count: stops.length, nearest: stops[0] ?? null };
}

/** "There are no TTC stops within 300 metres." / null when transit is close by. */
export function describeTransitNearby(at: LatLng): string | null {
  const { count } = transitNearby(at);
  if (count > 1) return null;
  return count === 0 ? `There are no TTC stops within ${NEARBY_M} metres.` : `There’s only one TTC stop within ${NEARBY_M} metres.`;
}

function supportCount(at: LatLng, points: SupportPoint[]) {
  return pointsInBox(points, boxAround([at], NEARBY_M)).filter((p) => haversineM(at, p) <= NEARBY_M).length;
}

/**
 * A walkable spot 250 m–1 km from `from`, at least 300 m off the route, with the fewest support
 * places (weighted ×2) and TTC stops within 300 m. Deterministic for the same inputs.
 */
export function pickQuietSpot(from: LatLng, route: LatLng[], options: { maxM?: number; minFromRouteM?: number } = {}): LatLng | null {
  const maxM = options.maxM ?? 1_000;
  const minFromRouteM = options.minFromRouteM ?? 300;
  const support = spokenSupportPoints();
  const candidates = linesInBox(loadPedestrianNetwork(), boxAround([from], maxM))
    .flat()
    .filter((p, i) => i % 3 === 0)
    .filter((p) => {
      const d = haversineM(from, p);
      return d >= 250 && d <= maxM && distanceToPolylineM(p, route) >= minFromRouteM;
    });
  let best: { p: LatLng; score: number } | null = null;
  for (const p of candidates) {
    const score = supportCount(p, support) * 2 + transitNearby(p).count + haversineM(from, p) / 1_000;
    if (!best || score < best.score) best = { p, score };
  }
  return best?.p ?? null;
}

/**
 * The closest public place worth walking to. Staffed / easy-to-find places (library, station,
 * hospital, community centre, police) win unless a washroom is much closer.
 */
export function nearestHelp(at: LatLng): (SupportPoint & { distanceM: number }) | null {
  let best: { p: SupportPoint & { distanceM: number }; score: number } | null = null;
  for (const p of pointsInBox(spokenSupportPoints(), boxAround([at], 2_000))) {
    const distanceM = haversineM(at, p);
    const score = distanceM * (p.category === "washroom" ? 3 : 1);
    if (!best || score < best.score) best = { p: { ...p, distanceM }, score };
  }
  return best?.p ?? null;
}

/** Evenly spaced points from a to b (straight line), for scripted walking when routing is down. */
export function straightPath(a: LatLng, b: LatLng, steps: number): LatLng[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    latitude: a.latitude + ((b.latitude - a.latitude) * i) / steps,
    longitude: a.longitude + ((b.longitude - a.longitude) * i) / steps,
  }));
}

/** Thin a route to about `steps` points so a scripted walk takes a predictable time. */
export function thinPath(line: LatLng[], steps: number): LatLng[] {
  if (line.length <= steps + 1) return line;
  const out: LatLng[] = [];
  for (let i = 0; i <= steps; i++) out.push(line[Math.round((i * (line.length - 1)) / steps)]!);
  return out;
}

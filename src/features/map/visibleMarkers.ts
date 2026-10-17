import { haversineM } from "@/lib/geo";
import type { LatLng, SupportPoint } from "@/lib/types";
import { inBox, type Box } from "./civicData";

/**
 * Which civic markers to draw for the current map view. The data covers all of Toronto
 * (thousands of points), and every marker is a native view, so only what's on screen is drawn,
 * capped, with the most useful places first. Pure, so it's unit-tested.
 */

export type MapRegion = LatLng & { latitudeDelta: number; longitudeDelta: number };

export const MAX_SUPPORT_MARKERS = 120;
export const MAX_STOP_MARKERS = 150;
/** Zoomed out past this (degrees of latitude, ≈9 km), only the route's highlighted support points show. */
export const SUPPORT_MARKERS_MAX_SPAN = 0.08;
/** Surface stops (small dots) only when zoomed in to roughly a neighbourhood. */
export const STOP_MARKERS_MAX_SPAN = 0.025;

/** The visible region plus `pad` (fraction of the span) on each side, so markers don't pop at the edges. */
export function regionBox(region: MapRegion, pad = 0.2): Box {
  const lat = region.latitudeDelta * (0.5 + pad);
  const lng = region.longitudeDelta * (0.5 + pad);
  return { south: region.latitude - lat, north: region.latitude + lat, west: region.longitude - lng, east: region.longitude + lng };
}

/** Staffed / easy-to-find places before schools and parks. */
const PRIORITY: Record<SupportPoint["category"], number> = {
  hospital: 0,
  police: 0,
  library: 1,
  community_centre: 1,
  transit: 1,
  washroom: 2,
  public_space: 3,
  school: 3,
};

export function visibleSupportPoints(
  points: readonly SupportPoint[],
  region: MapRegion,
  highlightedIds: ReadonlySet<string>,
): SupportPoint[] {
  const highlighted = points.filter((p) => highlightedIds.has(p.id));
  if (region.latitudeDelta > SUPPORT_MARKERS_MAX_SPAN) return highlighted;
  const box = regionBox(region);
  const rest = points
    .filter((p) => !highlightedIds.has(p.id) && inBox(box, p))
    .map((p) => ({ p, rank: PRIORITY[p.category] * 1e6 + haversineM(p, region) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, Math.max(0, MAX_SUPPORT_MARKERS - highlighted.length))
    .map(({ p }) => p);
  return [...highlighted, ...rest];
}

export function visibleStops<T extends LatLng>(stops: readonly T[], region: MapRegion): T[] {
  if (region.latitudeDelta > STOP_MARKERS_MAX_SPAN) return [];
  const box = regionBox(region);
  return stops
    .filter((s) => inBox(box, s))
    .sort((a, b) => haversineM(a, region) - haversineM(b, region))
    .slice(0, MAX_STOP_MARKERS);
}

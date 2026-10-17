import { campusWalk, toDemoRoute } from "@/lib/demo/campusWalk";
import { distanceToPolylineM, haversineM, polylineLengthM } from "@/lib/geo";
import type { LatLng, Route, RouteRecommendation, SupportPoint } from "@/lib/types";
import {
  loadAllSupportPoints,
  loadPedestrianNetwork,
  loadTransitDisruption,
  loadTransitStops,
  type TransitDisruption,
} from "./civicData";

/**
 * Support-aware route recommendation. Describes public support context (nearby support points,
 * TTC access, sidewalks, a current disruption, closeness to the group). It never labels streets
 * "safe" or "unsafe", and it is not a risk score (that's P4).
 *
 * P5's incident screen reuses this: `getRouteRecommendation()` with no arguments uses the
 * Campus Walk routes and data.
 */

export const SUPPORT_NEAR_ROUTE_M = 150;
export const TRANSIT_NEAR_ROUTE_M = 200;
export const DISRUPTION_NEAR_ROUTE_M = 250;
export const GROUP_NEAR_ROUTE_M = 150;
const SIDEWALK_MATCH_M = 30;
const SAMPLE_EVERY_M = 50;

export type RouteRecommendationInput = {
  route?: Route;
  alternativeRoute?: Route | null;
  supportPoints?: SupportPoint[];
  transitStops?: SupportPoint[];
  disruption?: TransitDisruption | null;
  pedestrianNetwork?: LatLng[][];
  /** Other members' positions, for "closer to your group". */
  groupPositions?: LatLng[];
  /** Used to order the returned support points (nearest first). */
  userPosition?: LatLng;
};

export type RouteContext = {
  supportPoints: SupportPoint[];
  hasTransitAccess: boolean;
  disrupted: boolean;
  /** Share of sampled points next to a mapped sidewalk/walkway; null when outside the mapped corridor. */
  sidewalkCoverage: number | null;
  nearGroup: boolean;
  score: number;
};

/** Points every ~50m along a polyline, so long segments are covered too. */
function sampleRoute(line: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const steps = Math.max(1, Math.ceil(haversineM(a, b) / SAMPLE_EVERY_M));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t });
    }
  }
  const last = line[line.length - 1];
  if (last) out.push(last);
  return out;
}

function boundsOf(lines: LatLng[][]) {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const line of lines)
    for (const p of line) {
      south = Math.min(south, p.latitude);
      north = Math.max(north, p.latitude);
      west = Math.min(west, p.longitude);
      east = Math.max(east, p.longitude);
    }
  return { south, north, west, east };
}

function sidewalkCoverage(line: LatLng[], network: LatLng[][]): number | null {
  if (!network.length) return null;
  const b = boundsOf(network);
  const inside = sampleRoute(line).filter(
    (p) => p.latitude >= b.south && p.latitude <= b.north && p.longitude >= b.west && p.longitude <= b.east,
  );
  if (inside.length < 3) return null;
  const covered = inside.filter((p) => network.some((seg) => distanceToPolylineM(p, seg) <= SIDEWALK_MATCH_M));
  return covered.length / inside.length;
}

export function describeRoute(
  route: Route,
  data: Required<Pick<RouteRecommendationInput, "supportPoints" | "transitStops" | "pedestrianNetwork">> & {
    disruption: TransitDisruption | null;
    groupPositions: LatLng[];
  },
): RouteContext {
  const line = route.coordinates;
  const near = (p: LatLng, m: number) => distanceToPolylineM(p, line) <= m;

  const supportPoints = data.supportPoints.filter((p) => p.category !== "transit" && near(p, SUPPORT_NEAR_ROUTE_M));
  const transitNearby = [
    ...data.transitStops,
    ...data.supportPoints.filter((p) => p.category === "transit"),
  ].filter((p) => near(p, TRANSIT_NEAR_ROUTE_M));

  // A disruption matters when the disrupted station is the route's only nearby subway station.
  const d = data.disruption;
  const disruptionNear = Boolean(d?.location && near(d.location, DISRUPTION_NEAR_ROUTE_M));
  const isStation = (p: SupportPoint) => /station$/i.test(p.name.trim());
  const otherStation = transitNearby.some(
    (p) => isStation(p) && !(d?.location && haversineM(p, d.location) < DISRUPTION_NEAR_ROUTE_M),
  );
  const disrupted = disruptionNear && !otherStation;
  const hasTransitAccess = transitNearby.length > 0;

  const coverage = sidewalkCoverage(line, data.pedestrianNetwork);
  const nearGroup = data.groupPositions.length > 0 && data.groupPositions.some((p) => near(p, GROUP_NEAR_ROUTE_M));

  const score =
    supportPoints.length +
    (hasTransitAccess ? 2 : 0) +
    (nearGroup ? 2 : 0) +
    (coverage === null ? 0 : coverage * 2) -
    (disrupted ? 3 : 0);

  return { supportPoints, hasTransitAccess, disrupted, sidewalkCoverage: coverage, nearGroup, score };
}

/** "a", "a and b", "a, b, and c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const CATEGORY_PHRASE: Record<SupportPoint["category"], string> = {
  library: "a public library",
  community_centre: "a community centre",
  hospital: "a hospital",
  police: "a police station",
  school: "a school",
  washroom: "a public washroom",
  public_space: "a public park",
  transit: "TTC access",
};
const HIGHLIGHT_ORDER: SupportPoint["category"][] = ["library", "community_centre", "hospital", "washroom", "police", "public_space", "school"];

function highlights(ctx: RouteContext): string[] {
  // Keep the sentence short: at most three items, counting TTC access and the group.
  const MAX_ITEMS = 3;
  const lead = ctx.hasTransitAccess ? [CATEGORY_PHRASE.transit] : [];
  const tail = ctx.nearGroup ? ["your group"] : [];
  const present = new Set(ctx.supportPoints.map((p) => p.category));
  const places = HIGHLIGHT_ORDER.filter((c) => present.has(c))
    .slice(0, Math.max(0, MAX_ITEMS - lead.length - tail.length))
    .map((c) => CATEGORY_PHRASE[c]);
  return [...lead, ...places, ...tail];
}

function sortedForUser(points: SupportPoint[], userPosition: LatLng | undefined, line: LatLng[]) {
  const key = (p: SupportPoint) => (userPosition ? haversineM(p, userPosition) : distanceToPolylineM(p, line));
  return [...points].sort((a, b) => key(a) - key(b)).slice(0, 6);
}

export function getRouteRecommendation(input: RouteRecommendationInput = {}): RouteRecommendation {
  const route = input.route ?? toDemoRoute(campusWalk.plannedRoute);
  const alternativeRoute =
    input.alternativeRoute === undefined ? toDemoRoute(campusWalk.alternativeRoute) : input.alternativeRoute;
  const data = {
    supportPoints: input.supportPoints ?? loadAllSupportPoints(),
    transitStops: input.transitStops ?? loadTransitStops(),
    pedestrianNetwork: input.pedestrianNetwork ?? loadPedestrianNetwork(),
    disruption: input.disruption === undefined ? loadTransitDisruption() : input.disruption,
    groupPositions: input.groupPositions ?? [],
  };

  const main = describeRoute(route, data);
  const alt = alternativeRoute && alternativeRoute.coordinates.length > 1 ? describeRoute(alternativeRoute, data) : null;

  // Recommend the alternative only when it's clearly better and not much longer.
  const altLengthOk =
    !alternativeRoute || polylineLengthM(alternativeRoute.coordinates) <= polylineLengthM(route.coordinates) * 1.6 + 300;
  if (alt && alternativeRoute && altLengthOk && (alt.score >= main.score + 1.5 || (main.disrupted && !alt.disrupted))) {
    const issues: string[] = [];
    if (main.supportPoints.length < alt.supportPoints.length) issues.push("fewer nearby public support points");
    if (main.disrupted) issues.push("a current transit disruption");
    if (main.sidewalkCoverage !== null && alt.sidewalkCoverage !== null && main.sidewalkCoverage + 0.2 < alt.sidewalkCoverage)
      issues.push("less sidewalk along the way");
    if (!main.nearGroup && alt.nearGroup) issues.push("more distance from your group");
    const explanation = issues.length
      ? `This route has ${joinList(issues)}. We recommend an alternative route.`
      : "An alternative route has more public support nearby. We recommend the alternative route.";
    return {
      explanation,
      supportPoints: sortedForUser(alt.supportPoints, input.userPosition, alternativeRoute.coordinates),
      alternativeRoute,
    };
  }

  const list = highlights(main);
  const explanation = list.length
    ? `This route keeps you closer to ${joinList(list)}.`
    : "Few public support points are mapped along this route. Stay close to your group where you can.";
  return {
    explanation,
    supportPoints: sortedForUser(main.supportPoints, input.userPosition, route.coordinates),
    alternativeRoute: null,
  };
}

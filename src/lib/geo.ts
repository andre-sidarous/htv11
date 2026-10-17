import type { LatLng } from "@/lib/types";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance (metres) from a point to a polyline. Uses a local equirectangular
 * projection around the point, which is accurate to well under 1% at city scale.
 */
export function distanceToPolylineM(point: LatLng, line: LatLng[]): number {
  const first = line[0];
  if (!first) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return haversineM(point, first);

  const cosLat = Math.cos(toRad(point.latitude));
  const project = (p: LatLng) => ({
    x: toRad(p.longitude - point.longitude) * cosLat * EARTH_RADIUS_M,
    y: toRad(p.latitude - point.latitude) * EARTH_RADIUS_M,
  });

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const a = project(line[i]!);
    const b = project(line[i + 1]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    // Point is the origin after projection.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lenSq));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    min = Math.min(min, Math.hypot(cx, cy));
  }
  return min;
}

/** Total polyline length in metres. */
export function polylineLengthM(line: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += haversineM(line[i]!, line[i + 1]!);
  return total;
}

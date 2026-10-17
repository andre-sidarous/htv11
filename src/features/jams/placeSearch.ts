import type { LatLng } from "@/lib/types";

/**
 * Place search for picking a Huddle destination, Google-Maps style: type anything (a place, an
 * address, a station) and pick a suggestion, or drop a pin and get its name. Uses Photon
 * (OpenStreetMap search built for search-as-you-type; free, no key). Pure: no react-native imports,
 * so it's unit-tested. Never throws; callers show "search unavailable" and the map pin still works.
 */

export type Place = LatLng & {
  /** "Robarts Library" */
  name: string;
  /** "130 St George Street, Toronto" */
  address: string;
};

const PHOTON = "https://photon.komoot.io";
const TIMEOUT_MS = 6_000;

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

const join = (parts: (string | undefined)[]) => parts.filter((p): p is string => Boolean(p && p.trim())).join(", ");

/** One Photon result → a Place, or null if it has no usable name or position. */
export function photonToPlace(feature: PhotonFeature): Place | null {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  const p = feature.properties ?? {};
  const streetLine = join([p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street]);
  const area = p.city ?? p.town ?? p.village ?? p.district ?? p.county;
  const name = p.name ?? (streetLine || area);
  if (!name) return null;
  const address = join([streetLine !== name ? streetLine : undefined, area !== name ? area : undefined, p.state ?? p.country]);
  return { name, address, latitude, longitude };
}

/** Drop near-duplicates (same name within ~50m), keeping order. */
export function dedupePlaces(places: Place[]): Place[] {
  return places.filter(
    (place, i) =>
      !places
        .slice(0, i)
        .some((p) => p.name === place.name && Math.abs(p.latitude - place.latitude) < 0.0005 && Math.abs(p.longitude - place.longitude) < 0.0005),
  );
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

async function photon(path: string, fetchImpl: Fetch, signal?: AbortSignal): Promise<PhotonFeature[] | null> {
  const timeout = AbortSignal.timeout?.(TIMEOUT_MS);
  const combined = signal && timeout && "any" in AbortSignal ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
  try {
    const res = await fetchImpl(`${PHOTON}${path}`, { signal: combined });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: PhotonFeature[] };
    return body.features ?? [];
  } catch {
    return null;
  }
}

/**
 * Suggestions for what they typed, biased toward `near` (their position, or the city).
 * Returns null when search is unreachable (offline, rate-limited), [] when nothing matched.
 */
export async function searchPlaces(
  query: string,
  near: LatLng | null,
  options: { fetchImpl?: Fetch; signal?: AbortSignal; limit?: number } = {},
): Promise<Place[] | null> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: String(options.limit ?? 8), lang: "en" });
  if (near) {
    params.set("lat", near.latitude.toFixed(5));
    params.set("lon", near.longitude.toFixed(5));
  }
  const features = await photon(`/api/?${params}`, options.fetchImpl ?? fetch, options.signal);
  if (!features) return null;
  return dedupePlaces(features.map(photonToPlace).filter((p): p is Place => p !== null));
}

/** The name of a dropped pin ("Robarts Library", "120 Harbord Street"), falling back to "Dropped pin". */
export async function placeAt(point: LatLng, options: { fetchImpl?: Fetch; signal?: AbortSignal } = {}): Promise<Place> {
  const params = new URLSearchParams({ lat: point.latitude.toFixed(6), lon: point.longitude.toFixed(6), lang: "en" });
  const features = await photon(`/reverse?${params}`, options.fetchImpl ?? fetch, options.signal);
  const found = features?.map(photonToPlace).find((p): p is Place => p !== null);
  // Keep the exact spot they tapped; only borrow the name and address.
  return found
    ? { ...point, name: found.name, address: found.address }
    : { ...point, name: "Dropped pin", address: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` };
}

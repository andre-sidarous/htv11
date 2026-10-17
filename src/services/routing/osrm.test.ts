import { describe, expect, it, vi } from "vitest";
import { campusWalk } from "@/lib/demo/campusWalk";
import { createOsrmRoutingService } from "./osrm";

const origin = campusWalk.start;
const destination = campusWalk.destination;

const okResponse = (routes: [number, number][][]) =>
  new Response(
    JSON.stringify({
      code: "Ok",
      routes: routes.map((coordinates, i) => ({ distance: 1_000 + i, duration: 700 + i, geometry: { coordinates } })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const line = (n: number): [number, number][] => [
  [-79.3972, 43.6597],
  [-79.398 - n / 1e4, 43.664],
  [-79.3997, 43.6683],
];

describe("createOsrmRoutingService", () => {
  it("parses OSRM GeoJSON ([lng, lat]) into routes and reuses one request for both calls", async () => {
    const fetchImpl = vi.fn(async () => okResponse([line(0), line(5)]));
    const service = createOsrmRoutingService({ baseUrl: "https://osrm.test/routed-foot/", fetchImpl });

    const route = await service.getRoute(origin, destination, "walking");
    const alternative = await service.getAlternativeRoute(origin, destination, "walking");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "https://osrm.test/routed-foot/route/v1/foot/-79.3972,43.6597;-79.3997,43.6683?overview=full&geometries=geojson&alternatives=true",
    );
    expect(route).toMatchObject({ source: "osrm", isDemoRoute: false, distanceM: 1_000, durationS: 700 });
    expect(route.coordinates[0]).toEqual({ latitude: 43.6597, longitude: -79.3972 });
    expect(alternative.distanceM).toBe(1_001);
  });

  it("returns the demo route when the URL is blank, without fetching", async () => {
    const fetchImpl = vi.fn();
    const service = createOsrmRoutingService({ baseUrl: "", fetchImpl });
    const route = await service.getRoute(origin, destination, "walking");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(route).toMatchObject({ source: "demo", isDemoRoute: true });
    expect(route.coordinates).toEqual(campusWalk.plannedRoute);
  });

  it("falls back to the demo routes on HTTP errors and network failures", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const http = createOsrmRoutingService({ baseUrl: "https://osrm.test", fetchImpl: async () => new Response("", { status: 503 }) });
    expect((await http.getRoute(origin, destination, "walking")).isDemoRoute).toBe(true);

    const offline = createOsrmRoutingService({
      baseUrl: "https://osrm.test",
      fetchImpl: async () => {
        throw new TypeError("Network request failed");
      },
    });
    expect((await offline.getRoute(origin, destination, "walking")).isDemoRoute).toBe(true);
    expect((await offline.getAlternativeRoute(origin, destination, "walking")).coordinates).toEqual(campusWalk.alternativeRoute);
  });

  it("times out slow servers and uses the demo route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = createOsrmRoutingService({
      baseUrl: "https://osrm.test",
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    });
    const route = await service.getRoute(origin, destination, "walking");
    expect(route.isDemoRoute).toBe(true);
  });

  it("uses the demo alternative when OSRM returns only one route", async () => {
    const service = createOsrmRoutingService({ baseUrl: "https://osrm.test", fetchImpl: async () => okResponse([line(0)]) });
    expect((await service.getRoute(origin, destination, "walking")).source).toBe("osrm");
    expect((await service.getAlternativeRoute(origin, destination, "walking")).isDemoRoute).toBe(true);
  });

  it("retries after a failure instead of caching it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let calls = 0;
    const service = createOsrmRoutingService({
      baseUrl: "https://osrm.test",
      fetchImpl: async () => (++calls === 1 ? new Response("", { status: 500 }) : okResponse([line(0)])),
    });
    expect((await service.getRoute(origin, destination, "walking")).isDemoRoute).toBe(true);
    expect((await service.getRoute(origin, destination, "walking")).source).toBe("osrm");
  });
});

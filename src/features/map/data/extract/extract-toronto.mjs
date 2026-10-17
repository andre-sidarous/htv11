#!/usr/bin/env node
/**
 * One-off preprocessing for the Campus Walk civic data. NOT bundled into the app.
 *
 * Pulls City of Toronto Open Data (CKAN) + OpenStreetMap hospitals, clips everything to the
 * Campus Walk area around UofT St. George, trims fields, and writes small JSON files next to
 * this folder (src/features/map/data/*.json). The app imports those statically, so nothing is
 * fetched or processed at runtime.
 *
 * Usage (raw downloads go to a cache dir OUTSIDE the repo; reused if already present):
 *   node src/features/map/data/extract/extract-toronto.mjs <cache-dir>
 *
 * Needs Node 20+ and `unzip` on PATH (for the TTC GTFS zip).
 */
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = process.argv[2];
if (!CACHE_DIR) {
  console.error("Usage: node extract-toronto.mjs <cache-dir>");
  process.exit(1);
}
mkdirSync(CACHE_DIR, { recursive: true });

/** Support points: UofT St. George plus Toronto Western Hospital and the Spadina/Bay stations. */
const AREA = { south: 43.652, north: 43.672, west: -79.41, east: -79.385 };
/** Line data (pedestrian network, centreline) stays to the walking corridor to keep files small. */
const CORRIDOR = { south: 43.6585, north: 43.67, west: -79.406, east: -79.39 };
/** City community centres are sparse downtown (nearest ~1.4 km), so this category looks wider. */
const WIDE_AREA = { south: 43.64, north: 43.682, west: -79.425, east: -79.37 };

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca";
const DOWNLOADS = {
  libraries: `${CKAN}/dataset/f5aa9b07-da35-45e6-b31f-d6790eb9bd9b/resource/5f4950b4-c727-4e54-8d0d-972e198268d6/download/tpl-branch-general-information-4326.geojson`,
  schools: `${CKAN}/dataset/1a714b5c-64c0-4cdf-9739-0086f80fb3ee/resource/f1160f3f-a651-40ed-914e-07b670ac5aec/download/school-locations-all-types-data-4326.geojson`,
  parks: `${CKAN}/dataset/cbea3a67-9168-4c6d-8186-16ac1a795b5b/resource/f6cdcd50-da7b-4ede-8e60-c3cdba70b559/download/parks-and-recreation-facilities-4326.geojson`,
  washrooms: `${CKAN}/dataset/394b9f09-d5d6-43dc-a7a0-660c99fc2318/resource/8a9905cf-1b5b-49ca-8359-ac7971099b24/download/washroom-facilities-4326.geojson`,
  police: `${CKAN}/dataset/9aeefa17-27e8-4dd9-b74d-80f7f9eb85ac/resource/c0176e24-8b76-4bb2-96fa-61cc1af2a065/download/police-facility-locations-4326.geojson`,
  pedestrian: `${CKAN}/dataset/4b5c7a84-dea1-4137-875d-71d7f662c83f/resource/33835def-35f2-4705-a348-b7983e8e66a1/download/pedestrian-network-data-4326.geojson`,
  centreline: `${CKAN}/dataset/1d079757-377b-4564-82df-eb5638583bfb/resource/7bc94ccf-7bcf-4a7d-88b1-bdfc8ec5aaf1/download/centreline-version-2-4326.geojson`,
  gtfs: `${CKAN}/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip`,
};
const FILES = {
  libraries: "libraries.geojson",
  schools: "schools.geojson",
  parks: "parks.geojson",
  washrooms: "washrooms.geojson",
  police: "police.geojson",
  pedestrian: "pedestrian.geojson",
  centreline: "centreline.geojson",
  gtfs: "ttc-gtfs.zip",
};

// ---------- helpers ----------

const round = (n) => Math.round(n * 1e5) / 1e5;
const inBox = (box, lat, lng) => lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;
const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/(^|[\s\-(/])([a-z])/g, (_, lead, c) => lead + c.toUpperCase())
    .replace(/\bOf\b/g, "of")
    .replace(/\bU Of T\b/g, "U of T")
    .trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function download(key) {
  const path = join(CACHE_DIR, FILES[key]);
  if (existsSync(path)) return path;
  console.log(`downloading ${key}…`);
  const response = await fetch(DOWNLOADS[key]);
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

const readGeoJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** First coordinate of a (Multi)Point. */
function pointOf(geometry) {
  if (!geometry) return null;
  const c = geometry.type === "MultiPoint" ? geometry.coordinates[0] : geometry.coordinates;
  return c ? { latitude: c[1], longitude: c[0] } : null;
}

/** Lines of a (Multi)LineString as [[lng, lat], ...]. */
function linesOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

/** Douglas-Peucker on [lng, lat] pairs, tolerance in metres (local flat projection). */
function simplify(line, toleranceM = 4) {
  if (line.length <= 2) return line;
  const lat0 = (line[0][1] * Math.PI) / 180;
  const xy = line.map(([lng, lat]) => [lng * 111_320 * Math.cos(lat0), lat * 110_540]);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
      if (d > max) [max, index] = [d, i];
    }
    if (max > toleranceM && index > 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Keep the runs of a line that fall inside the box. */
function clipLine(box, line) {
  const runs = [];
  let run = [];
  for (const [lng, lat] of line) {
    if (inBox(box, lat, lng)) run.push([round(lng), round(lat)]);
    else if (run.length) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const toLatLngs = (line) => line.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

function writeJson(name, data) {
  const path = join(OUT_DIR, name);
  const text = `${JSON.stringify(data)}\n`;
  writeFileSync(path, text);
  console.log(`wrote ${name} (${(text.length / 1024).toFixed(1)} KB)`);
}

/** Point dataset -> SupportPoint[] clipped to AREA. */
function supportPoints(path, { category, source, name, openNow, filter = () => true, idPrefix, area = AREA }) {
  const seen = new Set();
  const out = [];
  for (const feature of readGeoJson(path).features) {
    const p = feature.properties;
    if (!filter(p)) continue;
    const point = pointOf(feature.geometry);
    if (!point || !inBox(area, point.latitude, point.longitude)) continue;
    const label = name(p);
    const id = `${idPrefix}-${slug(label)}`;
    if (!label || seen.has(id)) continue;
    seen.add(id);
    const entry = {
      id,
      name: label,
      category: typeof category === "function" ? category(p) : category,
      latitude: round(point.latitude),
      longitude: round(point.longitude),
      source,
    };
    const open = openNow?.(p);
    if (open !== undefined) entry.openNow = open;
    out.push(entry);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- GTFS ----------

async function* csvRows(path) {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!line) continue;
    // TTC GTFS has no quoted commas in the columns we read, except stop/route names (handled below).
    const cells = [];
    let cell = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    if (!header) {
      header = cells.map((h) => h.replace(/^﻿/, "").trim());
      continue;
    }
    yield Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  }
}

async function extractGtfs(zipPath) {
  const dir = join(CACHE_DIR, "gtfs");
  if (!existsSync(join(dir, "stops.txt"))) {
    mkdirSync(dir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zipPath, "stops.txt", "routes.txt", "trips.txt", "shapes.txt", "-d", dir]);
  }

  // Subway platforms ("St George Station - Northbound Platform") collapse into one station point.
  const stations = new Map();
  // Surface stops in the area, deduped by name (both directions of a stop share a name).
  const stops = new Map();
  for await (const s of csvRows(join(dir, "stops.txt"))) {
    const lat = Number(s.stop_lat);
    const lng = Number(s.stop_lon);
    if (!inBox(AREA, lat, lng)) continue;
    const name = s.stop_name.trim();
    const station = /^(?!.* at )([^-]+ Station)( - .+ Platform)?$/.exec(name)?.[1]?.trim();
    if (station) {
      const entry = stations.get(station) ?? { name: station, lats: [], lngs: [] };
      entry.lats.push(lat);
      entry.lngs.push(lng);
      stations.set(station, entry);
      continue;
    }
    if (stops.has(name)) continue;
    stops.set(name, {
      id: `ttc-${s.stop_id}`,
      name,
      category: "transit",
      latitude: round(lat),
      longitude: round(lng),
      source: "TTC GTFS",
      kind: "surface_stop",
    });
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const { name, lats, lngs } of stations.values()) {
    stops.set(name, {
      id: `ttc-station-${slug(name)}`,
      name: name.replace(/^St /, "St. "),
      category: "transit",
      latitude: round(mean(lats)),
      longitude: round(mean(lngs)),
      source: "TTC GTFS",
      kind: "subway_station",
    });
  }

  // Rail routes (subway 1, streetcar 0) that pass through the corridor: their longest shape, clipped.
  const routes = new Map();
  for await (const r of csvRows(join(dir, "routes.txt"))) {
    if (r.route_type === "0" || r.route_type === "1") {
      routes.set(r.route_id, {
        id: `ttc-route-${r.route_short_name}`,
        shortName: r.route_short_name,
        name: r.route_long_name.trim(),
        mode: r.route_type === "1" ? "subway" : "streetcar",
        color: `#${r.route_color || "DA251D"}`,
      });
    }
  }
  const shapeToRoute = new Map();
  for await (const t of csvRows(join(dir, "trips.txt"))) {
    if (routes.has(t.route_id) && t.shape_id && !shapeToRoute.has(t.shape_id)) shapeToRoute.set(t.shape_id, t.route_id);
  }
  const shapes = new Map();
  for await (const p of csvRows(join(dir, "shapes.txt"))) {
    if (!shapeToRoute.has(p.shape_id)) continue;
    const list = shapes.get(p.shape_id) ?? [];
    list.push([Number(p.shape_pt_sequence), Number(p.shape_pt_lon), Number(p.shape_pt_lat)]);
    shapes.set(p.shape_id, list);
  }
  const best = new Map();
  for (const [shapeId, points] of shapes) {
    points.sort((a, b) => a[0] - b[0]);
    const line = points.map(([, lng, lat]) => [lng, lat]);
    const clipped = clipLine(AREA, line);
    const inside = clipped.reduce((n, run) => n + run.length, 0);
    if (!inside) continue;
    const routeId = shapeToRoute.get(shapeId);
    if ((best.get(routeId)?.inside ?? 0) < inside) best.set(routeId, { inside, clipped });
  }
  const routeLines = [...best].map(([routeId, { clipped }]) => ({
    ...routes.get(routeId),
    segments: clipped.map((run) => toLatLngs(simplify(run, 6))),
  }));

  return {
    stops: [...stops.values()].sort((a, b) => a.name.localeCompare(b.name)),
    routes: routeLines.sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true })),
  };
}

// ---------- pedestrian network + centreline ----------

const WALKABLE = /sidewalk on|city walkway|partial sidewalk|recreational trail|some sidewalk/i;
const NOT_WALKABLE = /no sidewalk|without any sidewalks/i;

function extractPedestrian(path) {
  const segments = [];
  for (const feature of readGeoJson(path).features) {
    const description = feature.properties.SIDEWALK_DESCRIPTION ?? "";
    if (!WALKABLE.test(description) || NOT_WALKABLE.test(description)) continue;
    for (const line of linesOf(feature.geometry)) {
      for (const run of clipLine(CORRIDOR, line)) segments.push(toLatLngs(simplify(run, 3)));
    }
  }
  return segments;
}

const STREET_TYPES = new Set(["Major Arterial", "Minor Arterial", "Collector", "Local", "Walkway", "Trail"]);

function extractCentreline(path) {
  const byName = new Map();
  for (const feature of readGeoJson(path).features) {
    const p = feature.properties;
    if (!STREET_TYPES.has(p.FEATURE_CODE_DESC) || !p.LINEAR_NAME_FULL || p.LINEAR_NAME_FULL === "None") continue;
    for (const line of linesOf(feature.geometry)) {
      for (const run of clipLine(CORRIDOR, line)) {
        const entry = byName.get(p.LINEAR_NAME_FULL) ?? { name: p.LINEAR_NAME_FULL, type: p.FEATURE_CODE_DESC, segments: [] };
        entry.segments.push(toLatLngs(simplify(run, 4)));
        byName.set(p.LINEAR_NAME_FULL, entry);
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- OpenStreetMap hospitals (not on the Toronto portal) ----------

async function extractHospitals() {
  const cached = join(CACHE_DIR, "osm-hospitals.json");
  if (!existsSync(cached)) {
    console.log("querying OSM Overpass for hospitals…");
    const query = `[out:json][timeout:30];nwr["amenity"="hospital"](${AREA.south},${AREA.west},${AREA.north},${AREA.east});out center tags;`;
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "jam-hackathon-preprocess/1.0" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
    writeFileSync(cached, await response.text());
  }
  const seen = new Set();
  return JSON.parse(readFileSync(cached, "utf8"))
    .elements.map((e) => ({ name: e.tags?.name, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon }))
    .filter((h) => h.name && h.lat && !seen.has(h.name) && seen.add(h.name))
    .map((h) => ({
      id: `osm-hospital-${slug(h.name)}`,
      name: h.name,
      category: "hospital",
      latitude: round(h.lat),
      longitude: round(h.lng),
      source: "OpenStreetMap",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- main ----------

const paths = {};
for (const key of Object.keys(DOWNLOADS)) paths[key] = await download(key);

writeJson(
  "libraries.json",
  supportPoints(paths.libraries, {
    category: "library",
    source: "Toronto Public Library",
    idPrefix: "tpl",
    filter: (p) => p.PhysicalBranch === 1,
    name: (p) => (/library/i.test(p.BranchName) ? p.BranchName : `${p.BranchName} Library`),
  }),
);
writeJson(
  "schools.json",
  supportPoints(paths.schools, {
    category: "school",
    source: "City of Toronto",
    idPrefix: "school",
    name: (p) => titleCase(p.NAME ?? ""),
  }),
);
writeJson(
  "community-centres.json",
  supportPoints(paths.parks, {
    category: "community_centre",
    source: "City of Toronto Parks & Recreation",
    idPrefix: "cc",
    area: WIDE_AREA,
    filter: (p) => p.TYPE === "Community Centre" || p.TYPE === "Civic Centre",
    name: (p) => titleCase(p.ASSET_NAME ?? ""),
  }),
);
writeJson(
  "parks.json",
  supportPoints(paths.parks, {
    category: "public_space",
    source: "City of Toronto Parks & Recreation",
    idPrefix: "park",
    filter: (p) => p.TYPE === "Park",
    name: (p) => titleCase(p.ASSET_NAME ?? ""),
  }),
);
writeJson(
  "washrooms.json",
  supportPoints(paths.washrooms, {
    category: "washroom",
    source: "City of Toronto Parks & Recreation",
    idPrefix: "washroom",
    name: (p) => titleCase(`${p.LOCATION ?? ""} washroom`).replace(/Washroom$/, "washroom"),
    // Status at extraction time: 1 open, 0 closed, 2 partially open.
    openNow: (p) => (p.Status === "1" ? true : p.Status === "0" ? false : undefined),
  }),
);
writeJson(
  "police.json",
  supportPoints(paths.police, {
    category: "police",
    source: "Toronto Police Service",
    idPrefix: "tps",
    name: (p) => (p.FACILITY ?? "").trim(),
  }),
);
writeJson("hospitals.json", await extractHospitals());

const gtfs = await extractGtfs(paths.gtfs);
writeJson("ttc-stops.json", gtfs.stops);
writeJson("ttc-routes.json", gtfs.routes);
writeJson("pedestrian-network.json", extractPedestrian(paths.pedestrian));
writeJson("centreline.json", extractCentreline(paths.centreline));
writeJson("extract-meta.json", { extractedAt: new Date().toISOString(), area: AREA, corridor: CORRIDOR });

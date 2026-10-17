#!/usr/bin/env node
/**
 * Copies the app's civic support points (the places worth saying out loud on a phone call) into a
 * compact file the Edge Functions can import: supabase/functions/_shared/support-points.json.
 * Rows: [name, category, lat e5, lng e5]. Run after extract-toronto.mjs:
 *   node src/features/map/data/extract/server-support-points.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(DATA, "..", "..", "..", "..", "supabase", "functions", "_shared", "support-points.json");
const read = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));
const e5 = (n) => Math.round(n * 1e5);

const rows = [];
for (const file of ["libraries.json", "community-centres.json", "hospitals.json", "police.json", "washrooms.json"]) {
  for (const p of read(file)) rows.push([p.name, p.category, e5(p.latitude), e5(p.longitude)]);
}
// Subway stations only (surface stops are too many and too small to send someone to).
for (const [, name, lat, lng, station] of read("ttc-stops.json")) if (station) rows.push([name, "transit", lat, lng]);

writeFileSync(OUT, `${JSON.stringify(rows)}\n`);
console.log(`wrote ${rows.length} support points to ${OUT} (${(JSON.stringify(rows).length / 1024).toFixed(1)} KB)`);

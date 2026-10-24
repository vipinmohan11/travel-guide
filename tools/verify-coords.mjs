#!/usr/bin/env node
// Cross-checks a city's pins against OpenStreetMap (Nominatim) and lists the ones that look off.
// Run it on your own computer (needs internet; Node 18+):
//   node tools/verify-coords.mjs rome            → report only
//   node tools/verify-coords.mjs rome --max 250  → flag pins more than 250 m away (default 300)
// Respects Nominatim's usage policy: one request per second, an identifying User-Agent, results
// not stored. A flagged pin is not always wrong (big parks, food streets): look at both on a map.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { km } from "../planner/engine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cityId, ...rest] = process.argv.slice(2);
if (!cityId) {
  console.log("Usage: node tools/verify-coords.mjs <city-id> [--max metres]");
  process.exit(1);
}
const maxM = Number(rest[rest.indexOf("--max") + 1]) || 300;
const pack = JSON.parse(fs.readFileSync(path.join(root, "planner", "cities", `${cityId}.json`), "utf8"));
const [s, w, n, e] = pack.bbox;
const UA = "travel-guide-planner/1.0 (https://github.com/vipinmohan11/travel-guide)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lookup(name) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: name, format: "jsonv2", limit: "1", bounded: "1", viewbox: `${w},${n},${e},${s}`,
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
}

// Search with the name as written, then without the bracketed part ("Seine river cruise (Pont de l'Alma)").
const queries = (p) => [p.name, p.name.replace(/\s*\(.*?\)\s*/g, " ").trim()].filter((q, i, a) => a.indexOf(q) === i);

const rows = [];
for (const p of pack.pois) {
  let hit = null;
  for (const q of queries(p)) {
    try { hit = await lookup(q); } catch (err) { console.log(`  ${p.id}: lookup failed (${err.message})`); }
    await sleep(1100);
    if (hit) break;
  }
  const d = hit ? Math.round(km(p, hit) * 1000) : null;
  const verdict = d === null ? "not found" : d > 1000 ? "WRONG?" : d > maxM ? "check" : "ok";
  rows.push({ id: p.id, verdict, d });
  console.log(`${verdict.padEnd(9)} ${String(d ?? "-").padStart(6)} m  ${p.id}${hit && verdict !== "ok" ? `  → OSM: ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)} (${hit.label.slice(0, 70)})` : ""}`);
}

const bad = rows.filter((r) => r.verdict !== "ok");
console.log(`\n${pack.name}: ${rows.length - bad.length} of ${rows.length} pins within ${maxM} m of OpenStreetMap; ${bad.length} to look at.`);

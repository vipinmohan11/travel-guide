#!/usr/bin/env node
// Checks every city pack before it ships:
//   1. JSON Schema (schema/city.schema.json), with a small built-in validator (no dependencies)
//   2. Data sanity: unique ids, known areas, pins inside the city box, pins near their area
//   3. Engine sanity: hundreds of plans per city, no repeats, no closed places on closed days
//   4. cities/index.json matches the packs
// Usage: node tools/validate.mjs            (all cities)
//        node tools/validate.mjs rome      (one city)
// Exit code 1 on any error; warnings are printed but don't fail.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan, km, PACES, INTERESTS, addDays, weekdayOf, encodeInputs, decodeInputs, normalise } from "../planner/engine.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const citiesDir = path.join(root, "planner", "cities");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schema", "city.schema.json"), "utf8"));

let errors = 0;
let warnings = 0;
const err = (city, msg) => { errors++; console.log(`  ✗ ${city}: ${msg}`); };
const warn = (city, msg) => { warnings++; console.log(`  ! ${city}: ${msg}`); };

// ---------- 1. minimal JSON Schema validator (the subset our schema uses) ----------
function resolve(node) {
  if (node && node.$ref) {
    const parts = node.$ref.replace(/^#\//, "").split("/");
    return parts.reduce((n, k) => n[k], schema);
  }
  return node;
}

function check(value, node, where, out) {
  node = resolve(node);
  if (!node) return;
  if ("const" in node && value !== node.const) out.push(`${where}: must be ${JSON.stringify(node.const)}`);
  if (node.enum && !node.enum.includes(value)) out.push(`${where}: ${JSON.stringify(value)} not in ${JSON.stringify(node.enum)}`);
  const t = node.type;
  if (t) {
    const ok =
      (t === "object" && value && typeof value === "object" && !Array.isArray(value)) ||
      (t === "array" && Array.isArray(value)) ||
      (t === "string" && typeof value === "string") ||
      (t === "number" && typeof value === "number" && Number.isFinite(value)) ||
      (t === "integer" && Number.isInteger(value)) ||
      (t === "boolean" && typeof value === "boolean");
    if (!ok) { out.push(`${where}: expected ${t}`); return; }
  }
  if (typeof value === "string" && node.pattern && !new RegExp(node.pattern).test(value)) out.push(`${where}: "${value}" doesn't match ${node.pattern}`);
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) out.push(`${where}: below ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) out.push(`${where}: above ${node.maximum}`);
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) out.push(`${where}: needs at least ${node.minItems} items`);
    if (node.maxItems !== undefined && value.length > node.maxItems) out.push(`${where}: at most ${node.maxItems} items`);
    if (node.items) value.forEach((v, i) => check(v, node.items, `${where}[${i}]`, out));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of node.required || []) if (!(k in value)) out.push(`${where}: missing "${k}"`);
    const props = node.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) check(v, props[k], `${where}.${k}`, out);
      else if (node.additionalProperties === false) out.push(`${where}: unknown field "${k}"`);
    }
  }
}

// ---------- 2. data sanity ----------
function sanity(pack) {
  const c = pack.id;
  // Areas are their own namespace; places and day trips share one (both appear in plans).
  for (const list of [pack.areas, [...pack.pois, ...pack.dayTrips]]) {
    const ids = new Set();
    for (const x of list) {
      if (ids.has(x.id)) err(c, `duplicate id "${x.id}"`);
      ids.add(x.id);
    }
  }
  const areas = new Map(pack.areas.map((a) => [a.id, a]));
  const [s, w, n, e] = pack.bbox;
  const inBox = (p) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
  if (!inBox({ lat: pack.center[0], lng: pack.center[1] })) err(c, "center is outside bbox");
  for (const a of pack.areas) {
    if (!inBox(a)) err(c, `area ${a.id} centre outside bbox`);
    if (!pack.pois.some((p) => p.area === a.id)) warn(c, `area ${a.id} has no places`);
  }
  for (const p of pack.pois) {
    const a = areas.get(p.area);
    if (!a) { err(c, `${p.id}: unknown area "${p.area}"`); continue; }
    if (!inBox(p)) err(c, `${p.id}: pin outside the city box`);
    const d = km(a, p);
    if (d > 4.5) err(c, `${p.id}: ${d.toFixed(1)} km from its area centre (${a.id})`);
    else if (d > 3) warn(c, `${p.id}: ${d.toFixed(1)} km from its area centre (${a.id})`);
    if (p.site && /^https?:|\/\/|\?|utm_/i.test(p.site)) err(c, `${p.id}: site must be a bare domain`);
    if (p.rank && p.priority !== 1) warn(c, `${p.id}: has a rank but is not a must-see`);
  }
  const ranks = pack.pois.filter((p) => p.rank).map((p) => p.rank);
  if (new Set(ranks).size !== ranks.length) err(c, "two places share the same rank");
  // Twin pins with different names are usually a copy-paste slip.
  for (let i = 0; i < pack.pois.length; i++) {
    for (let j = i + 1; j < pack.pois.length; j++) {
      const a = pack.pois[i], b = pack.pois[j];
      if (km(a, b) < 0.03 && a.area === b.area) warn(c, `${a.id} and ${b.id} are under 30 m apart (intended?)`);
    }
  }
  if (!pack.pois.some((p) => p.type === "food" || p.type === "market")) warn(c, "no food or market places for lunch");
  for (const t of pack.dayTrips) if (km({ lat: pack.center[0], lng: pack.center[1] }, t) < 8) warn(c, `day trip ${t.id} is inside the city`);
  if (pack.status !== "reviewed") warn(c, "status is draft: needs a human review before launch");
}

// ---------- 3. engine sanity ----------
function engineChecks(pack) {
  const c = pack.id;
  const poiById = new Map(pack.pois.map((p) => [p.id, p]));
  const starts = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", null];
  const groups = [[], [5], [9, 12], [16]];
  const interestSets = [[], ["museums"], ["kids", "parks"], Object.keys(INTERESTS)];
  let plans = 0;
  for (const days of [1, 2, 3, 5, 7, 10]) {
    for (const pace of Object.keys(PACES)) {
      for (const kids of groups) {
        for (const start of starts) {
          for (const interests of interestSets) {
            for (const stepFree of [false, true]) {
              const input = { days, pace, kids, start, interests, stepFree };
              const plan = buildPlan(pack, input);
              plans++;
              const where = `${JSON.stringify(input)}`;
              if (plan.days.length !== days) { err(c, `${where}: ${plan.days.length} days planned`); continue; }
              const seen = new Set();
              plan.days.forEach((d, i) => {
                if (start && d.date !== addDays(start, i)) err(c, `${where}: day ${i + 1} has the wrong date`);
                if (d.kind === "city") {
                  if (!d.stops.length) err(c, `${where}: day ${i + 1} is empty`);
                  for (const s of d.stops) {
                    if (s.poi.generic) continue;
                    const p = poiById.get(s.poi.id);
                    if (!p) { err(c, `${where}: unknown place ${s.poi.id}`); continue; }
                    if (seen.has(p.id)) err(c, `${where}: ${p.id} appears twice`);
                    seen.add(p.id);
                    if (d.weekday && (p.closedDays || []).includes(d.weekday)) err(c, `${where}: ${p.id} is closed on ${d.weekday}`);
                    if (stepFree && p.stepFree === false) err(c, `${where}: ${p.id} has steps but step-free was asked`);
                  }
                  if (d.activityMin > PACES[pace].budget + 60 + d.stops.filter((s) => s.evening).reduce((n, s) => n + s.poi.durationMin, 0)) {
                    err(c, `${where}: day ${i + 1} is ${d.activityMin} min of activity`);
                  }
                }
                if (d.kind === "trip" && d.weekday && (d.trip.closedDays || []).includes(d.weekday)) err(c, `${where}: trip ${d.trip.id} closed on ${d.weekday}`);
              });
              // Same input → same plan; the share link must round-trip.
              const again = buildPlan(pack, input);
              if (JSON.stringify(again) !== JSON.stringify(plan)) err(c, `${where}: plan is not deterministic`);
              const back = decodeInputs(encodeInputs(pack.id, normalise(input)));
              if (!back || JSON.stringify(back.opts) !== JSON.stringify(normalise(input))) err(c, `${where}: share link doesn't round-trip`);
            }
          }
        }
      }
    }
  }
  // Must-sees should make it into a 3-day normal plan for two adults.
  const plan = buildPlan(pack, { days: 3 });
  const planned = new Set(plan.days.flatMap((d) => (d.stops || []).map((s) => s.poi.id)));
  const top3 = pack.pois.filter((p) => p.rank && p.rank <= 3);
  for (const p of top3) if (!planned.has(p.id)) warn(c, `top-3 sight ${p.id} is missing from a 3-day plan`);
  return plans;
}

// ---------- run ----------
const only = process.argv[2];
const files = fs.readdirSync(citiesDir).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
const index = JSON.parse(fs.readFileSync(path.join(citiesDir, "index.json"), "utf8"));
let totalPlans = 0;

for (const f of files) {
  const id = f.replace(/\.json$/, "");
  if (only && only !== id) continue;
  console.log(`• ${id}`);
  let pack;
  try { pack = JSON.parse(fs.readFileSync(path.join(citiesDir, f), "utf8")); }
  catch (e) { err(id, `invalid JSON: ${e.message}`); continue; }
  const out = [];
  check(pack, schema, id, out);
  out.forEach((m) => err(id, m));
  if (out.length) continue;
  if (pack.id !== id) err(id, `id "${pack.id}" doesn't match the file name`);
  sanity(pack);
  totalPlans += engineChecks(pack);
  const entry = index.cities.find((x) => x.id === id);
  if (!entry) err(id, "missing from cities/index.json (run: node tools/build-index.mjs)");
  else if (entry.name !== pack.name || entry.status !== pack.status || entry.country !== pack.country) err(id, "cities/index.json is out of date (run: node tools/build-index.mjs)");
}
if (!only) {
  for (const e of index.cities) if (!files.includes(`${e.id}.json`)) err("index", `lists ${e.id} but there's no file`);
}

console.log(`\n${totalPlans} plans checked · ${errors} error(s) · ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);

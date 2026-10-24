#!/usr/bin/env node
// Rebuilds planner/cities/index.json (the city list the app loads first) from the packs.
// Run after adding or editing a city: node tools/build-index.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "planner", "cities");
const cities = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
  .map((p) => ({
    id: p.id,
    name: p.name,
    aliases: p.aliases || [],
    country: p.country,
    countryCode: p.countryCode,
    center: p.center,
    cityDays: p.cityDays,
    places: p.pois.length,
    dayTrips: p.dayTrips.length,
    status: p.status,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ version: 1, cities }, null, 2) + "\n");
console.log(`index.json: ${cities.length} cities`);

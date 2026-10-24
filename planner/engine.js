// Trip planner engine: turns a city pack + trip inputs into a day-by-day plan.
// Pure and deterministic: same inputs → same plan. No network, no randomness.
// Works in the browser (ES module) and in Node (tests, validation).

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const PACES = {
  relaxed: { label: "Relaxed", budget: 240, start: 600, maxStops: 4, lunch: 75 },
  normal: { label: "Normal", budget: 330, start: 570, maxStops: 6, lunch: 60 },
  packed: { label: "Packed", budget: 430, start: 540, maxStops: 8, lunch: 50 },
};

export const INTERESTS = {
  sights: { label: "Sights", types: ["sight"] },
  museums: { label: "Museums", types: ["museum"] },
  food: { label: "Food & markets", types: ["market", "food"] },
  parks: { label: "Parks & beaches", types: ["park", "beach"] },
  views: { label: "Viewpoints", types: ["view"] },
  kids: { label: "Kids' fun", types: ["kids"] },
};

export const DEFAULTS = {
  days: 3,
  start: null, // "YYYY-MM-DD" or null
  adults: 2,
  kids: [], // ages
  pace: "normal",
  interests: [],
  stepFree: false,
};

const MEAL_TYPES = new Set(["food"]);
const TIME_BUCKET = { morning: 0, any: 1, afternoon: 2, evening: 3 };

// ---------- geometry ----------
export function km(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Street distance ≈ straight line × 1.3. Returns how to get from a to b.
export function leg(a, b, opts) {
  const straight = km(a, b);
  const street = straight * 1.3;
  const young = (opts.kids || []).some((age) => age < 8);
  const speed = young ? 3.5 : 4.5; // km/h
  const walkLimit = young ? 1.5 : 2.2; // km of street walking before we suggest transit
  const walkMin = Math.max(2, Math.round((street / speed) * 60));
  if (street <= walkLimit) return { mode: "walk", km: round1(street), min: walkMin };
  // Rough public-transport estimate: wait + ride at ~18 km/h + walking to and from stops.
  const transitMin = Math.round(12 + (straight / 18) * 60);
  return { mode: "transit", km: round1(street), min: Math.min(walkMin, transitMin) };
}

const round1 = (x) => Math.round(x * 10) / 10;

// ---------- time helpers ----------
export function hhmm(mins) {
  const m = Math.round(mins);
  const h = Math.floor(m / 60) % 24;
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// ---------- inputs ----------
export function normalise(input) {
  const o = { ...DEFAULTS, ...(input || {}) };
  o.days = clampInt(o.days, 1, 10, DEFAULTS.days);
  o.adults = clampInt(o.adults, 1, 9, DEFAULTS.adults);
  o.kids = (Array.isArray(o.kids) ? o.kids : [])
    .map((a) => clampInt(a, 0, 17, null))
    .filter((a) => a !== null)
    .slice(0, 8);
  if (!PACES[o.pace]) o.pace = DEFAULTS.pace;
  o.interests = (Array.isArray(o.interests) ? o.interests : []).filter((i) => INTERESTS[i]);
  o.start = typeof o.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.start) ? o.start : null;
  o.stepFree = !!o.stepFree;
  return o;
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

// Share-link format: c=rome&d=4&s=2026-11-02&a=2&k=7,10&p=normal&i=sights,food&sf=1
export function encodeInputs(cityId, o) {
  const p = new URLSearchParams();
  p.set("c", cityId);
  p.set("d", String(o.days));
  if (o.start) p.set("s", o.start);
  p.set("a", String(o.adults));
  if (o.kids.length) p.set("k", o.kids.join(","));
  p.set("p", o.pace);
  if (o.interests.length) p.set("i", o.interests.join(","));
  if (o.stepFree) p.set("sf", "1");
  return p.toString();
}

export function decodeInputs(str) {
  const p = new URLSearchParams(str.replace(/^[#?]/, ""));
  const city = p.get("c");
  if (!city) return null;
  const o = normalise({
    days: p.get("d"),
    start: p.get("s"),
    adults: p.get("a"),
    kids: (p.get("k") || "").split(",").filter(Boolean),
    pace: p.get("p"),
    interests: (p.get("i") || "").split(",").filter(Boolean),
    stepFree: p.get("sf") === "1",
  });
  return { city, opts: o };
}

// ---------- scoring ----------
function scorePoi(poi, o) {
  let s = { 1: 30, 2: 18, 3: 8 }[poi.priority] || 8;
  // rank = the city's top-sights order (1 = the one place everyone comes for)
  if (poi.rank) s += Math.max(0, 16 - poi.rank);
  if (o.interests.length) {
    const wanted = o.interests.flatMap((i) => INTERESTS[i].types);
    if (wanted.includes(poi.type)) s += 12;
    else if (poi.priority !== 1) s -= 5;
    if (o.interests.includes("kids")) s += poi.kidScore * 3;
  }
  if (o.kids.length) {
    s += poi.kidScore * 4;
    if (poi.kidScore === 0) s -= 10;
  }
  return s;
}

function closedOn(item, weekday) {
  return !!weekday && Array.isArray(item.closedDays) && item.closedDays.includes(weekday);
}

// ---------- main ----------
export function buildPlan(pack, input) {
  const o = normalise(input);
  const pace = PACES[o.pace];
  const young = o.kids.some((a) => a < 6);
  const budget = pace.budget - (young ? 45 : 0);
  const areas = new Map(pack.areas.map((a) => [a.id, a]));

  const pois = pack.pois
    .filter((p) => !(o.stepFree && p.stepFree === false))
    // Places marked "not for kids" (kidScore 0) are skipped when a child under 10 comes.
    .filter((p) => !(p.kidScore === 0 && o.kids.some((age) => age < 10)))
    // Without dates we can't place a once-a-week market on the right day: leave it out.
    .filter((p) => o.start || (p.closedDays || []).length < 5)
    .map((p) => ({ ...p, score: scorePoi(p, o) }));

  const sights = pois.filter((p) => !MEAL_TYPES.has(p.type));
  const meals = pois.filter((p) => MEAL_TYPES.has(p.type) || p.type === "market");
  const used = new Set();

  const cityDayCap = Math.min(o.days, pack.cityDays);
  const days = [];

  for (let d = 0; d < cityDayCap; d++) {
    const date = o.start ? addDays(o.start, d) : null;
    const weekday = date ? weekdayOf(date) : null;
    const open = sights.filter((p) => !used.has(p.id) && !closedOn(p, weekday));
    if (!open.length) break;

    // Area value: must-sees count in full, other places only a little.
    const daytime = open.filter((p) => p.bestTime !== "evening");
    if (!daytime.length) break;
    const byArea = groupBy(daytime, (p) => p.area);
    const valueOf = (list) =>
      (list || [])
        .map((p) => (p.priority === 1 ? p.score : p.score * 0.35))
        .sort((a, b) => b - a)
        .slice(0, 5)
        .reduce((a, b) => a + b, 0);
    // Anchor = the area of the best must-see still to visit, so top sights come
    // first. When only non-must-sees are left, the richest area leads.
    const mustSees = daytime.filter((p) => p.priority === 1);
    const anchorId = mustSees.length
      ? sortByScore(mustSees)[0].area
      : [...byArea.keys()].sort(
          (a, b) => valueOf(byArea.get(b)) - valueOf(byArea.get(a)) || a.localeCompare(b)
        )[0];
    // A day of only small extras is not worth a city day; day trips take over.
    if (days.length >= 2 && valueOf(byArea.get(anchorId)) < 10) break;

    const chosen = [];
    let minutes = 0;
    let weight = 0; // short stops (≤ 15 min) count as half a stop
    const tryAdd = (list) => {
      for (const p of list) {
        const w = p.durationMin <= 15 ? 0.5 : 1;
        if (weight + w > pace.maxStops) break;
        if (minutes + p.durationMin > budget + 15) continue;
        // Extras only when kids will love them, or the day is still thin.
        if (p.priority === 3 && weight >= 2 && !(o.kids.length && p.kidScore >= 3)) continue;
        chosen.push(p);
        minutes += p.durationMin;
        weight += w;
      }
    };
    tryAdd(sortByScore(byArea.get(anchorId)));

    // Room left? Add a neighbouring area: first one within walking range,
    // then, only if the day is still thin, one a short metro ride away.
    const areaIds = [anchorId];
    const anchor = areas.get(anchorId);
    for (const [maxDist, maxPlace] of [[2.1, 3], [2.1, 3], [5, 6]]) {
      if (budget - minutes < 45 || weight >= pace.maxStops || areaIds.length >= 3) break;
      // One metro hop at most, and only to rescue a thin single-area day.
      if (maxDist > 2.1 && (areaIds.length > 1 || minutes >= budget * 0.6)) break;
      const near = [...byArea.entries()]
        .filter(([id]) => !areaIds.includes(id))
        .map(([id, list]) => {
          const dist = km(anchor, areas.get(id));
          const close = list.filter((p) => !chosen.includes(p) && km(anchor, p) <= maxPlace);
          return { id, dist, close, worth: valueOf(close) };
        })
        .filter((x) => x.dist <= maxDist && x.close.length && x.worth >= 8)
        .sort((a, b) => b.worth - b.dist * 5 - (a.worth - a.dist * 5) || a.id.localeCompare(b.id))[0];
      if (near) {
        const before = chosen.length;
        tryAdd(sortByScore(near.close));
        if (chosen.length > before) areaIds.push(near.id);
      }
    }
    if (!chosen.length) break;

    // An evening show or sunset spot near today's areas rounds off the day
    // (after a break, so it does not count against the daytime budget).
    const evening = sortByScore(
      open.filter((p) => p.bestTime === "evening" && areaIds.some((id) => km(areas.get(id), p) <= 3))
    )[0];
    if (evening && evening.score >= 20) chosen.push(evening);
    chosen.forEach((p) => used.add(p.id));

    const stops = orderStops(chosen, areaIds);
    const day = scheduleDay(stops, { o, pace, meals, used, weekday });
    day.n = d + 1;
    day.kind = "city";
    day.date = date;
    day.weekday = weekday;
    day.areas = areaIds.map((id) => areas.get(id));
    day.title = day.areas[0].name;
    day.rainSwap = pickRainSwap(sights, used, areaIds, areas, weekday);
    days.push(day);
  }

  // Remaining days → day trips, then free days.
  const trips = (pack.dayTrips || [])
    .map((t) => ({
      ...t,
      score: ({ 1: 30, 2: 18, 3: 8 }[t.priority || 2] || 18) + (o.kids.length ? t.kidScore * 4 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const usedTrips = new Set();
  for (let d = days.length; d < o.days; d++) {
    const date = o.start ? addDays(o.start, d) : null;
    const weekday = date ? weekdayOf(date) : null;
    const trip = trips.find((t) => !usedTrips.has(t.id) && !closedOn(t, weekday));
    if (trip) {
      usedTrips.add(trip.id);
      days.push({ n: d + 1, kind: "trip", date, weekday, trip, title: trip.name });
    } else {
      const left = sortByScore(sights.filter((p) => !used.has(p.id))).slice(0, 4);
      left.forEach((p) => used.add(p.id));
      days.push({ n: d + 1, kind: "free", date, weekday, title: "Free day", suggestions: left });
    }
  }

  // "If you have time": unplanned places close to each city day's stops.
  for (const day of days) {
    if (day.kind !== "city") continue;
    const stops = day.stops.filter((s) => !s.meal && !s.poi.generic).map((s) => s.poi);
    day.extras = sortByScore(
      sights.filter(
        (p) =>
          !used.has(p.id) &&
          !closedOn(p, day.weekday) &&
          p.bestTime !== "evening" &&
          stops.some((s) => km(s, p) <= 1.2)
      )
    ).slice(0, 3);
  }

  const missed = sortByScore(
    sights.filter((p) => !used.has(p.id) && p.priority === 1)
  ).slice(0, 5);

  return {
    city: pack.id,
    inputs: o,
    days,
    missed,
    totals: {
      stops: days.reduce((n, d) => n + (d.stops ? d.stops.filter((s) => !s.meal).length : 0), 0),
      walkKm: round1(days.reduce((n, d) => n + (d.walkKm || 0), 0)),
    },
  };
}

function groupBy(list, key) {
  const m = new Map();
  for (const x of list) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function sortByScore(list) {
  return [...(list || [])].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// One area at a time (no back-and-forth across town). Inside an area: morning
// places first, afternoon places last, nearest-neighbour in between.
// The anchor area goes first unless only the second area has a morning place,
// or the anchor's places are all best in the afternoon.
function orderStops(list, areaIds) {
  const groups = areaIds.map((id) => list.filter((p) => p.area === id && p.bestTime !== "evening"));
  const rest = list.filter((p) => !areaIds.includes(p.area) && p.bestTime !== "evening");
  if (rest.length) groups[groups.length - 1].push(...rest);
  const has = (g, t) => g.some((p) => (p.bestTime || "any") === t);
  if (groups.length === 2) {
    const [a, b] = groups;
    if ((!has(a, "morning") && has(b, "morning")) || (has(a, "afternoon") && !has(a, "morning") && !has(b, "afternoon"))) {
      groups.reverse();
    }
  }
  const out = [];
  let prev = null;
  for (const g of groups) {
    for (let bucket = 0; bucket < 3; bucket++) {
      const items = sortByScore(g.filter((p) => TIME_BUCKET[p.bestTime || "any"] === bucket));
      while (items.length) {
        let i = 0;
        if (prev) {
          let best = Infinity;
          items.forEach((p, j) => {
            const dist = km(prev, p);
            if (dist < best) { best = dist; i = j; }
          });
        }
        prev = items.splice(i, 1)[0];
        out.push(prev);
      }
    }
  }
  return out.concat(list.filter((p) => p.bestTime === "evening"));
}

function scheduleDay(stops, { o, pace, meals, used, weekday }) {
  let clock = pace.start;
  const out = [];
  let walkKm = 0;
  let lunchDone = false;
  let prev = null;

  const addLunch = (near) => {
    const options = meals
      .filter((m) => !used.has(m.id) && !closedOn(m, weekday))
      .map((m) => ({ m, dist: km(near, m) }))
      .filter((x) => x.dist <= 1.2)
      .sort((a, b) => a.dist - b.dist || b.m.score - a.m.score);
    const pick = options.length ? options[0].m : null;
    if (pick) used.add(pick.id);
    const place = pick || { id: `lunch-${out.length}`, name: "Lunch break", lat: near.lat, lng: near.lng, generic: true };
    const move = pick ? leg(near, pick, o) : { mode: "walk", km: 0, min: 0 };
    clock += move.min;
    walkKm += move.mode === "walk" ? move.km : 0;
    out.push({ poi: place, meal: true, start: clock, end: clock + pace.lunch, move });
    clock += pace.lunch;
    prev = pick || prev;
    lunchDone = true;
  };

  const eveningStops = stops.filter((p) => p.bestTime === "evening");
  for (const p of stops.filter((x) => x.bestTime !== "evening")) {
    const move = prev ? leg(prev, p, o) : null;
    const arrive = clock + (move ? move.min : 0);
    // Lunch before a stop that would run past 13:30, once we've seen something.
    if (!lunchDone && prev && arrive + Math.min(p.durationMin, 60) > 13 * 60 + 30) {
      addLunch(prev);
    }
    const m = prev ? leg(prev, p, o) : null;
    clock += m ? m.min : 0;
    if (m && m.mode === "walk") walkKm += m.km;
    out.push({ poi: p, start: clock, end: clock + p.durationMin, move: m });
    clock += p.durationMin;
    prev = p;
  }
  if (!lunchDone && prev && clock > 12 * 60 && out.length) addLunch(prev);
  const dayEnd = clock;

  // Evening extras: after a break, timed by the place itself (shows, sunsets).
  for (const p of eveningStops) {
    const m = prev ? leg(prev, p, o) : null;
    out.push({ poi: p, evening: true, start: null, end: null, move: m });
    prev = p;
  }

  const activity = out.filter((s) => !s.meal).reduce((n, s) => n + s.poi.durationMin, 0);
  return {
    stops: out.map((s) => ({
      ...s,
      startLabel: s.evening ? "Evening" : hhmm(s.start),
      endLabel: s.evening ? "" : hhmm(s.end),
    })),
    walkKm: round1(walkKm),
    activityMin: activity,
    endLabel: hhmm(dayEnd),
    bookAhead: out.filter((s) => s.poi.bookAhead).map((s) => s.poi),
    cost: Math.max(0, ...out.filter((s) => !s.meal).map((s) => s.poi.cost || 0)),
  };
}

function pickRainSwap(sights, used, areaIds, areas, weekday) {
  const indoor = sights.filter((p) => p.indoor && !used.has(p.id) && !closedOn(p, weekday));
  // A real alternative fills an hour or more; a 10-minute courtyard is not one.
  const worth = (p) => p.score - (p.durationMin >= 45 ? 0 : 25);
  const local = indoor
    .filter((p) => areaIds.includes(p.area))
    .sort((a, b) => worth(b) - worth(a) || a.id.localeCompare(b.id))[0];
  if (local && local.durationMin >= 45) return local;
  const centre = areas.get(areaIds[0]);
  const nearby = indoor
    .filter((p) => p.durationMin >= 45 && km(centre, p) <= 5)
    .sort((a, b) => worth(b) - worth(a) - (km(centre, b) - km(centre, a)) * 3)[0];
  return nearby || local || null;
}

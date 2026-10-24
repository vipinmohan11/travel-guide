// Trip Planner app: wizard → plan → day views. No framework, no tracking.
// The whole plan lives in the URL hash, so a plan link can be shared and reopened offline.
import { buildPlan, encodeInputs, decodeInputs, normalise, PACES, INTERESTS, DEFAULTS } from "./engine.js";

const REPO = "https://github.com/vipinmohan11/travel-guide";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// One colour per day, like metro lines. ink = text colour on top of the line colour.
const LINES = [
  { c: "#d62839", ink: "#ffffff" },
  { c: "#1b8a7a", ink: "#ffffff" },
  { c: "#e9a23b", ink: "#2b1c00" },
  { c: "#2f6db5", ink: "#ffffff" },
  { c: "#8b4f80", ink: "#ffffff" },
  { c: "#4e8a2e", ink: "#ffffff" },
  { c: "#c1611a", ink: "#ffffff" },
  { c: "#2d3e59", ink: "#ffffff" },
  { c: "#0f86a6", ink: "#ffffff" },
  { c: "#9e3d5c", ink: "#ffffff" },
];
const line = (n) => LINES[(n - 1) % LINES.length];
const lineVars = (n) => `--line:${line(n).c};--line-ink:${line(n).ink}`;

const TYPE_LABEL = { sight: "Sight", museum: "Museum", food: "Food", market: "Market", park: "Park", view: "Viewpoint", beach: "Beach", kids: "Fun for kids" };
const DAY_NAME = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const PACE_TEXT = {
  relaxed: "About 4 hours of sightseeing a day, starting at 10:00.",
  normal: "About 5½ hours a day, starting at 09:30.",
  packed: "About 7 hours a day, starting at 09:00.",
};

const ICON = {
  walk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2" fill="currentColor"/><path d="M9.5 21l2-6 2.5 2.5V21M8 12l2-4.5 3.5 1 2 3.5 2.5.5M11.5 8l1 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  transit: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 10h14M8.5 21l1.5-4M15.5 21 14 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8.5" cy="13.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="13.5" r="1.2" fill="currentColor"/></svg>',
  train: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 10h14M8.5 21l1.5-4M15.5 21 14 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  fork: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 21V3c-2 1.5-3 4-3 7v2h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>',
  umbrella: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 18 0zM12 12v6.5a2 2 0 0 1-4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  free: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

// ---------- small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function store(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: settings just won't persist */ }
}

function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  if (m === 0) return `${h} h`;
  if (m === 30) return `${h}½ h`;
  return `${h} h ${m} min`;
}
function fmtDate(iso, withDay = true) {
  const [y, m, d] = iso.split("-").map(Number);
  const opts = { day: "numeric", month: "long", timeZone: "UTC" };
  if (withDay) opts.weekday = "long";
  return new Intl.DateTimeFormat("en-GB", opts).format(new Date(Date.UTC(y, m - 1, d)));
}
function costText(level, symbol) {
  return level ? (symbol || "€").repeat(level) : "Free";
}
function listText(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
function groupText(o) {
  const adults = `${o.adults} adult${o.adults > 1 ? "s" : ""}`;
  if (!o.kids.length) return adults;
  const ages = o.kids.map((a) => (a === 0 ? "a baby" : String(a)));
  if (o.kids.length === 1) return `${adults} and ${o.kids[0] === 0 ? "a baby" : `a child of ${o.kids[0]}`}`;
  return `${adults} and children aged ${listText(ages)}`;
}
function placeLink(p, city) {
  const q = p.generic ? `${p.lat},${p.lng}` : `${p.name}, ${city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function dirLink(a, b, mode) {
  return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;
}
function closedText(days) {
  if (!days || !days.length) return "";
  if (days.length >= 5) {
    const open = Object.keys(DAY_NAME).filter((d) => !days.includes(d));
    return `Open on ${listText(open.map((d) => DAY_NAME[d] + "s"))} only.`;
  }
  return `Closed on ${listText(days.map((d) => DAY_NAME[d] + "s"))}.`;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- settings: text size and theme ----------
const SCALES = [0.9, 1, 1.1, 1.2, 1.32, 1.45];
const settings = store("tp-settings", { scale: 1, theme: "auto" });

function applySettings() {
  document.documentElement.style.setProperty("--scale", settings.scale);
  if (settings.theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", settings.theme);
  $("#scaleOut").textContent = `${Math.round(settings.scale * 100)}%`;
  $$("#settings [data-theme]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.theme === settings.theme)));
  save("tp-settings", settings);
}

function bindSettings() {
  const pop = $("#settings");
  const btn = $("#settingsBtn");
  btn.addEventListener("click", () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute("aria-expanded", String(!pop.hidden));
    if (!pop.hidden) $("button", pop).focus();
  });
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pop.hidden) { pop.hidden = true; btn.focus(); }
  });
  $$("[data-scale]", pop).forEach((b) =>
    b.addEventListener("click", () => {
      const i = SCALES.indexOf(settings.scale);
      const j = Math.min(SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + Number(b.dataset.scale)));
      settings.scale = SCALES[j];
      applySettings();
      maps.forEach((m) => m.invalidateSize());
    })
  );
  $$("[data-theme]", pop).forEach((b) =>
    b.addEventListener("click", () => {
      settings.theme = b.dataset.theme;
      applySettings();
    })
  );
  applySettings();
}

// ---------- data ----------
let cityIndex = [];
const packs = new Map();

async function loadIndex() {
  const res = await fetch("cities/index.json");
  if (!res.ok) throw new Error("index");
  cityIndex = (await res.json()).cities;
}

async function loadPack(id) {
  if (packs.has(id)) return packs.get(id);
  if (!cityIndex.some((c) => c.id === id)) return null;
  const res = await fetch(`cities/${encodeURIComponent(id)}.json`);
  if (!res.ok) return null;
  const pack = await res.json();
  packs.set(id, pack);
  return pack;
}

// ---------- wizard ----------
const wiz = { city: null, opts: normalise(DEFAULTS) };

function showStep(n) {
  $$("#wizard .step").forEach((s) => (s.hidden = s.dataset.step !== String(n)));
  $$("#wizard .steps li").forEach((li) => {
    const k = Number(li.dataset.step);
    li.classList.toggle("done", k < n);
    li.classList.toggle("now", k === n);
    if (k === n) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
  const heading = $(`#wizard .step[data-step="${n}"] h1`);
  if (n === 2 && wiz.city) $("#whenTitle").textContent = `How long in ${wiz.city.name}?`;
  if (n === 2) renderDaysHint();
  heading?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function renderCityList() {
  const q = plain($("#cityInput").value.trim());
  const list = $("#cityList");
  // Every word typed must appear in the name, country or an alias, so "Tokyo, Japan" and "Japan Tokyo" both work.
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const matches = cityIndex.filter((c) => {
    const hay = plain([c.name, c.country, ...(c.aliases || [])].join(" "));
    return words.every((w) => hay.includes(w));
  });
  list.innerHTML = matches
    .map(
      (c) => `<li><button type="button" class="city-btn" role="option" data-city="${esc(c.id)}">
        <span class="city-name">${esc(c.name)}</span>
        <span class="city-meta">${esc(c.country)}, ${c.places} places, ${c.dayTrips} day trips</span>
        ${c.status === "draft" ? '<span class="city-tag" title="Places in this city have not been checked by a person yet">Unreviewed</span>' : ""}
      </button></li>`
    )
    .join("");
  const missing = $("#cityMissing");
  const raw = $("#cityInput").value.trim();
  if (q && !matches.length) {
    const title = encodeURIComponent(`City request: ${raw}`);
    missing.innerHTML = `<p><b>${esc(raw)}</b> isn't in the planner yet.</p>
      <a class="btn small" href="${REPO}/issues/new?template=city-request.yml&title=${title}" target="_blank" rel="noopener">Request ${esc(raw)}</a>
      <p class="hint">Requests are collected on GitHub (free account needed). Popular cities are added first.</p>`;
    missing.hidden = false;
  } else missing.hidden = true;
  $("#cityHint").textContent = cityIndex.length ? `${cityIndex.length} cities so far. More are being added.` : "";
}

function renderRecent() {
  const recent = store("tp-recent", []).filter((r) => cityIndex.some((c) => c.id === r.city));
  let box = $("#recent");
  if (!recent.length) { box?.remove(); return; }
  if (!box) {
    box = document.createElement("div");
    box.id = "recent";
    box.className = "aside-box";
    $('#wizard .step[data-step="1"]').append(box);
  }
  box.innerHTML = `<h2>Your recent plans</h2><ul>${recent
    .map((r) => `<li><a href="#${esc(r.hash)}"><b>${esc(r.name)}</b></a>, ${esc(r.label)}</li>`)
    .join("")}</ul>`;
}

function renderDaysHint() {
  const o = wiz.opts;
  $("#daysOut").textContent = o.days;
  if (!wiz.city) return;
  const extra = o.days - wiz.city.cityDays;
  $("#daysHint").textContent =
    extra > 0
      ? `${wiz.city.name} has about ${wiz.city.cityDays} days of sights; the other ${extra} become day trips by ${wiz.city.dayTrips ? "train or bus" : "public transport"}.`
      : `${wiz.city.name} has about ${wiz.city.cityDays} days of sights in the plan.`;
}

function renderKids() {
  $("#kidsList").innerHTML = wiz.opts.kids
    .map((age, i) => `<li>${age === 0 ? "Under 1" : `Age ${age}`}<button type="button" data-kid="${i}" aria-label="Remove child aged ${age}">×</button></li>`)
    .join("");
  $("#addKid").disabled = wiz.opts.kids.length >= 8;
}

function syncWizardControls() {
  const o = wiz.opts;
  $("#daysOut").textContent = o.days;
  $("#adultsOut").textContent = o.adults;
  $("#startInput").value = o.start || "";
  $$("#paceGroup input").forEach((r) => (r.checked = r.value === o.pace));
  $$("#interestGroup .chip").forEach((c) => c.setAttribute("aria-pressed", String(o.interests.includes(c.dataset.interest))));
  $("#stepFree").checked = o.stepFree;
  renderKids();
}

function bindWizard() {
  $("#cityInput").addEventListener("input", renderCityList);
  $("#cityInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#cityList .city-btn")?.click();
  });
  $("#cityList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-city]");
    if (!b) return;
    wiz.city = cityIndex.find((c) => c.id === b.dataset.city);
    showStep(2);
  });
  $$("#wizard [data-go]").forEach((b) => b.addEventListener("click", () => showStep(Number(b.dataset.go))));
  $$("[data-days]").forEach((b) =>
    b.addEventListener("click", () => {
      wiz.opts.days = Math.min(10, Math.max(1, wiz.opts.days + Number(b.dataset.days)));
      renderDaysHint();
    })
  );
  $$("[data-adults]").forEach((b) =>
    b.addEventListener("click", () => {
      wiz.opts.adults = Math.min(9, Math.max(1, wiz.opts.adults + Number(b.dataset.adults)));
      $("#adultsOut").textContent = wiz.opts.adults;
    })
  );
  const today = new Date().toISOString().slice(0, 10);
  $("#startInput").min = today;
  $("#startInput").addEventListener("change", (e) => (wiz.opts.start = e.target.value || null));

  $("#kidAge").innerHTML = Array.from({ length: 18 }, (_, a) => `<option value="${a}" ${a === 8 ? "selected" : ""}>${a === 0 ? "Under 1" : `Age ${a}`}</option>`).join("");
  $("#addKid").addEventListener("click", () => {
    wiz.opts.kids.push(Number($("#kidAge").value));
    renderKids();
  });
  $("#kidsList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kid]");
    if (!b) return;
    wiz.opts.kids.splice(Number(b.dataset.kid), 1);
    renderKids();
  });

  $("#paceGroup").innerHTML = Object.entries(PACES)
    .map(([id, p]) => `<label><input type="radio" name="pace" value="${id}"><b>${p.label}</b><span>${PACE_TEXT[id]}</span></label>`)
    .join("");
  $("#paceGroup").addEventListener("change", (e) => (wiz.opts.pace = e.target.value));

  $("#interestGroup").innerHTML = Object.entries(INTERESTS)
    .map(([id, i]) => `<button type="button" class="chip" data-interest="${id}" aria-pressed="false">${i.label}</button>`)
    .join("");
  $("#interestGroup").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const id = c.dataset.interest;
    const list = wiz.opts.interests;
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    c.setAttribute("aria-pressed", String(i < 0));
  });
  $("#stepFree").addEventListener("change", (e) => (wiz.opts.stepFree = e.target.checked));

  $("#makePlan").addEventListener("click", () => {
    if (!wiz.city) return showStep(1);
    location.hash = encodeInputs(wiz.city.id, normalise(wiz.opts));
  });
  syncWizardControls();
}

// ---------- plan ----------
let current = null; // { pack, plan, hash }
let maps = [];
let installPrompt = null;

function clearMaps() {
  maps.forEach((m) => m.remove());
  maps = [];
}

function newMap(el) {
  if (!window.L) {
    el.innerHTML = '<div class="map-off">The map needs a connection the first time. Your plan below works offline.</div>';
    return null;
  }
  const m = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, tap: true });
  m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_CREDIT }).addTo(m);
  maps.push(m);
  return m;
}

function pinIcon(n, label, kind) {
  const inner = kind === "meal" ? ICON.fork : kind === "eve" ? ICON.moon : esc(label);
  return L.divIcon({
    className: "",
    html: `<div class="pin ${kind || ""}" style="${lineVars(n)}">${inner}</div>`,
    iconSize: kind === "meal" ? [24, 24] : [30, 30],
    iconAnchor: kind === "meal" ? [12, 12] : [15, 15],
  });
}

function drawDay(m, day, pack, { fit = true, meals = true } = {}) {
  const pts = [];
  let num = 0;
  let prev = null;
  for (const s of day.stops) {
    const p = s.poi;
    if (s.meal && !meals) continue;
    const kind = s.meal ? "meal" : s.evening ? "eve" : "";
    if (!s.meal && !s.evening) num++;
    const mk = L.marker([p.lat, p.lng], { icon: pinIcon(day.n, num, kind), title: p.name, keyboard: true }).addTo(m);
    mk.bindPopup(`<b>${esc(p.name)}</b><br>${s.startLabel}${s.endLabel ? `–${s.endLabel}` : ""}<br><a href="${placeLink(p, pack.name)}" target="_blank" rel="noopener">Open in Maps</a>`);
    if (prev && !(s.meal && p.generic)) {
      L.polyline([[prev.lat, prev.lng], [p.lat, p.lng]], {
        color: line(day.n).c, weight: 5, opacity: 0.9, lineCap: "round",
        dashArray: s.move && s.move.mode === "walk" ? "1 9" : null,
      }).addTo(m);
    }
    pts.push([p.lat, p.lng]);
    if (!p.generic) prev = p;
  }
  if (fit && pts.length) m.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
  return pts;
}

function planSummary(pack, o) {
  const when = o.start ? ` from ${fmtDate(o.start)}` : "";
  return `${o.days} day${o.days > 1 ? "s" : ""}${when} for ${groupText(o)}, at a ${PACES[o.pace].label.toLowerCase()} pace${o.stepFree ? ", step-free" : ""}.`;
}

function dayWhen(day) {
  if (day.date) return fmtDate(day.date);
  return `Day ${day.n}`;
}

function dayFacts(day, pack) {
  if (day.kind === "trip") return `Day trip by ${day.trip.by}, about ${fmtDuration(day.trip.travelMin)} each way.`;
  if (day.kind === "free") return "A free day for favourites, shopping or a slow wander.";
  const stops = day.stops.filter((s) => !s.meal).length;
  const parts = [`${stops} stop${stops > 1 ? "s" : ""}`, `${day.walkKm} km on foot`, `done by ${day.endLabel}`];
  return `${parts.join(", ")}.`;
}

function headerHTML(pack, plan, view) {
  const o = plan.inputs;
  const draft = pack.status === "draft"
    ? `<p class="notice">${esc(pack.name)}'s places haven't been checked by a person yet. Check opening hours and prices before you go.</p>`
    : "";
  const base = encodeInputs(pack.id, o);
  const tab = (v, label) => `<a href="#${base}${v === "days" ? "" : `&v=${v}`}" ${view === v ? 'aria-current="page"' : ""}>${label}</a>`;
  return `<div class="plan-head">
      <h1>${esc(pack.name)}</h1>
      <p class="plan-sum">${esc(planSummary(pack, o))}</p>
      ${draft}
      <div class="actions">
        <button type="button" class="btn" data-act="share">${ICON.share}Share</button>
        <button type="button" class="btn" data-act="print">${ICON.print}Print</button>
        <button type="button" class="btn" data-act="install" ${installPrompt ? "" : "hidden"}>${ICON.install}Install app</button>
        <button type="button" class="btn ghost" data-act="edit">${ICON.edit}Change trip</button>
      </div>
    </div>
    <nav class="tabs" aria-label="Plan views">${tab("days", "Days")}${tab("map", "Map")}${tab("tips", "Tips")}</nav>`;
}

function overviewHTML(pack, plan) {
  const base = encodeInputs(pack.id, plan.inputs);
  const rows = plan.days
    .map((d) => {
      const badge = d.kind === "trip" ? ICON.train : d.kind === "free" ? ICON.free : d.n;
      const also = d.kind === "city" && d.areas.length > 1 ? `<span class="day-also">and ${esc(listText(d.areas.slice(1).map((a) => a.name)))}</span>` : "";
      const title = d.kind === "trip" ? `Day trip: ${d.trip.name}` : d.title;
      const book = d.kind === "city" && d.bookAhead.length ? ` <span class="book-flag">Book ahead.</span>` : "";
      return `<li class="day-row" style="${lineVars(d.n)}">
        <a class="day-link" href="#${base}&v=day${d.n}">
          <span class="badge" aria-hidden="true">${badge}</span>
          <span class="day-when">${esc(d.date ? `Day ${d.n}, ${fmtDate(d.date)}` : `Day ${d.n}`)}</span>
          <span class="day-title">${esc(title)}</span>
          ${also}
          <span class="day-facts">${esc(dayFacts(d, pack))}${book}</span>
          <span class="day-chev" aria-hidden="true">${ICON.next}</span>
        </a></li>`;
    })
    .join("");
  const missed = plan.missed.length
    ? `<div class="missed"><h2>Didn't fit</h2><p>${esc(listText(plan.missed.map((p) => p.name)))} ${plan.missed.length > 1 ? "are" : "is"} on most people's list but didn't fit. Add a day or choose a packed pace to include ${plan.missed.length > 1 ? "them" : "it"}.</p></div>`
    : "";
  return `<ol class="days" aria-label="Days">${rows}</ol>${missed}`;
}

function stopHTML(s, i, day, pack, kids) {
  const p = s.poi;
  const cls = ["stop", s.meal ? "meal" : "", s.evening ? "eve" : ""].join(" ");
  if (s.meal) {
    const body = p.generic
      ? `<h3>Lunch break</h3><p class="r-meta">Find a place near your last stop.</p><div class="r-links"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`restaurants near ${p.lat},${p.lng}`)}" target="_blank" rel="noopener">${ICON.pin}Restaurants nearby</a></div>`
      : `<h3>Lunch: ${esc(p.name)}</h3><p class="r-meta">${esc(TYPE_LABEL[p.type])}, ${esc(costText(p.cost, pack.currencySymbol))}</p><p>${esc(p.why)}</p>${p.tip ? `<p class="r-tip"><b>Tip:</b> ${esc(p.tip)}</p>` : ""}<div class="r-links"><a href="${placeLink(p, pack.name)}" target="_blank" rel="noopener">${ICON.pin}Open in Maps</a></div>`;
    return `<li class="${cls}"><span class="r-time">${s.startLabel}</span><span class="r-rail"><span class="r-dot"></span></span><div class="r-body">${body}</div></li>`;
  }
  const meta = [TYPE_LABEL[p.type], `about ${fmtDuration(p.durationMin)}`, p.costNote || costText(p.cost, pack.currencySymbol)];
  const closed = closedText(p.closedDays);
  const inside = p.inside && p.inside.length
    ? `<details class="inside"><summary>What's inside</summary><ul>${p.inside.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`
    : "";
  return `<li class="${cls}">
    <span class="r-time">${s.evening ? ICON.moon.replace("<svg", '<svg style="width:20px;height:20px;margin-left:auto"') : s.startLabel}</span>
    <span class="r-rail"><span class="r-dot"></span></span>
    <div class="r-body">
      <h3>${esc(p.name)}</h3>
      <p class="r-meta">${esc(meta.join(", "))}${s.evening ? ", in the evening" : ""}${p.bookAhead ? ". <b>Book ahead</b>" : ""}</p>
      <p>${esc(p.why)}</p>
      ${kids && p.kid ? `<p class="r-kid"><b>For kids:</b> ${esc(p.kid)}</p>` : ""}
      ${p.tip ? `<p class="r-tip"><b>Tip:</b> ${esc(p.tip)}</p>` : ""}
      ${closed ? `<p class="r-tip">${esc(closed)}</p>` : ""}
      ${p.transitStop ? `<p class="r-tip"><b>Nearest stop:</b> ${esc(p.transitStop)}</p>` : ""}
      ${inside}
      <div class="r-links">
        <a href="${placeLink(p, pack.name)}" target="_blank" rel="noopener">${ICON.pin}Open in Maps</a>
        ${p.site ? `<a href="https://${esc(p.site)}" target="_blank" rel="noopener">${ICON.link}${esc(p.site)}</a>` : ""}
      </div>
    </div></li>`;
}

function legHTML(s, prev) {
  if (!s.move || !prev || s.poi.generic) return "";
  const m = s.move;
  const walk = m.mode === "walk";
  const what = walk ? `${m.min} min walk (${m.km} km)` : `About ${m.min} min by public transport`;
  return `<li class="leg ${walk ? "walk" : "transit"}"><span></span><span class="r-rail"></span>
    <div class="r-body"><span class="leg-what">${walk ? ICON.walk : ICON.transit}${what}</span>
    <a href="${dirLink(prev, s.poi, walk ? "walking" : "transit")}" target="_blank" rel="noopener">Directions</a></div></li>`;
}

function cityDayHTML(day, pack, plan) {
  const kids = plan.inputs.kids.length > 0;
  let prev = null;
  const items = [];
  day.stops.forEach((s, i) => {
    items.push(legHTML(s, prev));
    items.push(stopHTML(s, i, day, pack, kids));
    if (!s.poi.generic) prev = s.poi;
  });
  const evening = day.stops.find((s) => s.evening);
  const book = day.bookAhead.length
    ? `<p class="callout"><b>Book ahead:</b> ${day.bookAhead.map((p) => (p.site ? `${esc(p.name)} (<a href="https://${esc(p.site)}" target="_blank" rel="noopener">${esc(p.site)}</a>)` : esc(p.name))).join(", ")}.</p>`
    : "";
  const rain = day.rainSwap
    ? `<div class="aside-box"><h2>${ICON.umbrella}If it rains</h2><p>Swap an outdoor stop for <b>${esc(day.rainSwap.name)}</b> (${esc(TYPE_LABEL[day.rainSwap.type].toLowerCase())}, about ${fmtDuration(day.rainSwap.durationMin)}). ${esc(day.rainSwap.why)}</p><div class="r-links"><a href="${placeLink(day.rainSwap, pack.name)}" target="_blank" rel="noopener">${ICON.pin}Open in Maps</a></div></div>`
    : "";
  const extras = day.extras && day.extras.length
    ? `<div class="aside-box"><h2>If you have time</h2><ul>${day.extras
        .map((p) => `<li><b>${esc(p.name)}</b>. ${esc(p.why)} <a href="${placeLink(p, pack.name)}" target="_blank" rel="noopener">Open in Maps</a></li>`)
        .join("")}</ul></div>`
    : "";
  const sum = `Start at ${day.stops[0].startLabel} and finish around ${day.endLabel}${evening ? `, then ${evening.poi.name} in the evening` : ""}. About ${day.walkKm} km on foot.`;
  // mark last real stop so the rail ends at its dot
  const html = items.join("").replace(/<li class="stop([^"]*)"(?![\s\S]*<li class="stop)/, '<li class="stop$1 last"');
  return `<p class="day-sum">${esc(sum)}</p>${book}<ol class="route" aria-label="Stops in order">${html}</ol>${rain}${extras}`;
}

function tripDayHTML(day, pack) {
  const t = day.trip;
  const closed = closedText(t.closedDays);
  return `<div class="trip-card">
    <p class="day-sum">${esc(t.why)}</p>
    <h2>Getting there</h2>
    <p>${esc(t.from)}. About ${fmtDuration(t.travelMin)} each way.</p>
    <h2>Highlights</h2>
    <ul>${t.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
    ${t.tip ? `<p class="callout">${esc(t.tip)}</p>` : ""}
    ${closed ? `<p>${esc(closed)}</p>` : ""}
    <div class="r-links">
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.name}`)}" target="_blank" rel="noopener">${ICON.pin}Open in Maps</a>
      <a href="${dirLink({ lat: pack.center[0], lng: pack.center[1] }, t, "transit")}" target="_blank" rel="noopener">${ICON.train}Directions from ${esc(pack.name)}</a>
    </div></div>`;
}

function freeDayHTML(day, pack) {
  if (!day.suggestions.length) return `<p class="day-sum">A free day: revisit a favourite place or explore a neighbourhood at your own pace.</p>`;
  return `<p class="day-sum">A free day. Ideas from places not yet in your plan:</p>
    <div class="aside-box"><ul>${day.suggestions
      .map((p) => `<li><b>${esc(p.name)}</b>. ${esc(p.why)} <a href="${placeLink(p, pack.name)}" target="_blank" rel="noopener">Open in Maps</a></li>`)
      .join("")}</ul></div>`;
}

function dayViewHTML(day, pack, plan) {
  const base = encodeInputs(pack.id, plan.inputs);
  const badge = day.kind === "trip" ? ICON.train : day.kind === "free" ? ICON.free : day.n;
  const title = day.kind === "trip" ? day.trip.name : day.title;
  const also = day.kind === "city" && day.areas.length > 1 ? `Then ${listText(day.areas.slice(1).map((a) => a.name))}` : "";
  const prevD = day.n > 1 ? `<a class="btn" href="#${base}&v=day${day.n - 1}">${ICON.back}Day ${day.n - 1}</a>` : `<a class="btn" href="#${base}">${ICON.back}All days</a>`;
  const nextD = day.n < plan.days.length ? `<a class="btn" href="#${base}&v=day${day.n + 1}">Day ${day.n + 1}${ICON.next}</a>` : `<a class="btn" href="#${base}">All days${ICON.next}</a>`;
  const body = day.kind === "city" ? cityDayHTML(day, pack, plan) : day.kind === "trip" ? tripDayHTML(day, pack) : freeDayHTML(day, pack);
  return `<div style="${lineVars(day.n)}">
    <div class="day-nav"><a class="btn ghost" href="#${base}">${ICON.back}All days</a><span></span></div>
    <div class="day-head">
      <span class="badge" aria-hidden="true">${badge}</span>
      <h1>${esc(day.kind === "trip" ? `Day trip: ${title}` : title)}</h1>
      <span class="day-when">${esc(day.date ? `Day ${day.n}, ${fmtDate(day.date)}` : `Day ${day.n}`)}</span>
      ${also ? `<span class="day-when">${esc(also)}</span>` : ""}
    </div>
    <div class="day-grid">
      <div class="map" id="dayMap" role="region" aria-label="Map of day ${day.n}"></div>
      <div class="day-main">${body}</div>
    </div>
    <div class="day-nav">${prevD}${nextD}</div>
  </div>`;
}

function mapViewHTML(plan) {
  const legend = plan.days
    .filter((d) => d.kind === "city")
    .map((d) => `<button type="button" aria-pressed="true" data-day="${d.n}" style="${lineVars(d.n)}"><i>${d.n}</i>${esc(d.title)}</button>`)
    .join("");
  return `<div class="legend" role="group" aria-label="Show or hide days">${legend}</div><div class="map tall" id="allMap" role="region" aria-label="Map of all days"></div>
    <p class="hint">Dotted lines are walks, solid lines are public transport. Day trips aren't shown.</p>`;
}

function tipsHTML(pack) {
  const transit = pack.transit
    ? `<p class="callout"><b>Ticket to get:</b> ${esc(pack.transit.card || "local public transport ticket")}. ${esc(pack.transit.note || "")}</p>`
    : "";
  return `<div class="tips">
    <p class="day-sum">${esc(pack.intro)}</p>
    ${transit}
    ${pack.tips.map((t) => `<h2>${esc(t.title)}</h2><p>${esc(t.text)}</p>`).join("")}
    <h2>About this plan</h2>
    <p>Walking times assume about 4.5 km/h (3.5 km/h with young children) and street distances. Public transport times are rough estimates: use the Directions links for live times.</p>
  </div>`;
}

function bindPlanActions(pack, plan) {
  $("#plan").addEventListener("click", onPlanClick);
  function onPlanClick(e) {
    const b = e.target.closest("[data-act]");
    if (b) {
      const act = b.dataset.act;
      if (act === "share") sharePlan(pack, plan);
      if (act === "print") printPlan(pack, plan);
      if (act === "install" && installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.finally(() => { installPrompt = null; b.hidden = true; });
      }
      if (act === "edit") {
        wiz.city = cityIndex.find((c) => c.id === pack.id);
        wiz.opts = normalise(plan.inputs);
        wiz.opts.kids = [...wiz.opts.kids];
        wiz.opts.interests = [...wiz.opts.interests];
        syncWizardControls();
        location.hash = "";
        showWizard(3);
      }
    }
    const lg = e.target.closest(".legend button");
    if (lg) {
      const on = lg.getAttribute("aria-pressed") !== "true";
      lg.setAttribute("aria-pressed", String(on));
      drawAllMap(pack, plan);
    }
  }
  // replace previous listener each render
  $("#plan")._handler && $("#plan").removeEventListener("click", $("#plan")._handler);
  $("#plan")._handler = onPlanClick;
}

async function sharePlan(pack, plan) {
  const url = location.href.replace(/&v=[^&]*/, "");
  const data = { title: `${pack.name} trip plan`, text: planSummary(pack, plan.inputs), url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
  } catch (e) {
    if (e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    prompt("Copy this link", url);
  }
}

function printPlan(pack, plan) {
  const days = plan.days
    .map((d) => {
      const head = `<h2 style="${lineVars(d.n)}">Day ${d.n}${d.date ? `, ${fmtDate(d.date)}` : ""}: ${esc(d.kind === "trip" ? `Day trip to ${d.trip.name}` : d.title)}</h2>`;
      if (d.kind === "trip") return `<div class="p-day">${head}<p>${esc(d.trip.why)}</p><p><b>Getting there:</b> ${esc(d.trip.from)}, about ${fmtDuration(d.trip.travelMin)} each way.</p><p><b>Highlights:</b> ${esc(d.trip.highlights.join(", "))}.</p></div>`;
      if (d.kind === "free") return `<div class="p-day">${head}<p>${esc(d.suggestions.map((p) => p.name).join(", ") || "Free time")}</p></div>`;
      const rows = d.stops
        .map((s) => {
          const leg = s.move && !s.poi.generic && s.move.min ? `<tr class="p-leg"><td></td><td>${s.move.mode === "walk" ? `${s.move.min} min walk` : `About ${s.move.min} min by public transport`}</td></tr>` : "";
          const name = s.meal ? (s.poi.generic ? "Lunch break" : `Lunch: ${s.poi.name}`) : s.poi.name;
          const detail = s.meal ? "" : `<br>${esc(s.poi.why)}${s.poi.bookAhead ? " <b>Book ahead.</b>" : ""}`;
          return `${leg}<tr><td>${s.evening ? "Evening" : s.startLabel}</td><td><b>${esc(name)}</b>${detail}</td></tr>`;
        })
        .join("");
      return `<div class="p-day">${head}<table>${rows}</table>${d.rainSwap ? `<p><b>If it rains:</b> ${esc(d.rainSwap.name)}</p>` : ""}</div>`;
    })
    .join("");
  $("#printArea").innerHTML = `<h1>${esc(pack.name)}</h1><p>${esc(planSummary(pack, plan.inputs))}</p>${days}
    <p style="margin-top:16pt;font-size:9pt">Plans are suggestions: check opening hours and prices before you go. Map data © OpenStreetMap contributors. Plan link: ${esc(location.href.replace(/&v=[^&]*/, ""))}</p>`;
  window.print();
}

function drawAllMap(pack, plan) {
  clearMaps();
  const el = $("#allMap");
  const m = newMap(el);
  if (!m) return;
  const on = new Set($$(".legend button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => Number(b.dataset.day)));
  const pts = [];
  plan.days.filter((d) => d.kind === "city" && on.has(d.n)).forEach((d) => pts.push(...drawDay(m, d, pack, { fit: false, meals: false })));
  if (pts.length) m.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
  else m.setView(pack.center, 12);
}

function drawDayMap(day, pack) {
  clearMaps();
  const el = $("#dayMap");
  const m = newMap(el);
  if (!m) return;
  if (day.kind === "city") drawDay(m, day, pack);
  else if (day.kind === "trip") {
    L.marker([day.trip.lat, day.trip.lng], { icon: pinIcon(day.n, "★", ""), title: day.trip.name }).addTo(m);
    m.setView([day.trip.lat, day.trip.lng], 12);
  } else {
    const pts = day.suggestions.map((p, i) => {
      L.marker([p.lat, p.lng], { icon: pinIcon(day.n, i + 1, ""), title: p.name }).addTo(m).bindPopup(esc(p.name));
      return [p.lat, p.lng];
    });
    if (pts.length) m.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
    else m.setView(pack.center, 12);
  }
}

function rememberPlan(pack, plan) {
  const hash = encodeInputs(pack.id, plan.inputs);
  const label = planSummary(pack, plan.inputs).replace(/\.$/, "");
  const recent = store("tp-recent", []).filter((r) => r.hash !== hash);
  recent.unshift({ city: pack.id, name: pack.name, hash, label });
  save("tp-recent", recent.slice(0, 5));
}

async function showPlan(parsed, view) {
  const planEl = $("#plan");
  $("#wizard").hidden = true;
  planEl.hidden = false;
  const pack = await loadPack(parsed.city);
  if (!pack) {
    clearMaps();
    planEl.innerHTML = `<div class="plan-head"><h1>City not found</h1><p class="plan-sum">This link points to a city the planner doesn't have.</p><a class="btn primary" href="#">Start a new plan</a></div>`;
    return;
  }
  const hash = encodeInputs(pack.id, parsed.opts);
  if (!current || current.hash !== hash) {
    current = { pack, plan: buildPlan(pack, parsed.opts), hash };
    rememberPlan(pack, current.plan);
  }
  const { plan } = current;
  document.title = `${pack.name} plan · Trip Planner`;
  const dayMatch = /^day(\d+)$/.exec(view || "");
  const day = dayMatch ? plan.days[Number(dayMatch[1]) - 1] : null;
  $("main").classList.toggle("wide", !!day);
  clearMaps();
  if (day) {
    planEl.innerHTML = dayViewHTML(day, pack, plan);
    drawDayMap(day, pack);
    document.title = `Day ${day.n}: ${day.kind === "trip" ? day.trip.name : day.title} · Trip Planner`;
  } else {
    const v = view === "map" || view === "tips" ? view : "days";
    const body = v === "map" ? mapViewHTML(plan) : v === "tips" ? tipsHTML(pack) : overviewHTML(pack, plan);
    planEl.innerHTML = headerHTML(pack, plan, v) + `<div class="plan-body">${body}</div>`;
    if (v === "map") drawAllMap(pack, plan);
  }
  bindPlanActions(pack, plan);
  window.scrollTo({ top: 0 });
  $("h1", planEl)?.setAttribute("tabindex", "-1");
  $("h1", planEl)?.focus({ preventScroll: true });
}

function showWizard(step = 1) {
  clearMaps();
  $("main").classList.remove("wide");
  $("#plan").hidden = true;
  $("#wizard").hidden = false;
  document.title = "Trip Planner";
  renderRecent();
  showStep(step);
}

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const parsed = h ? decodeInputs(h) : null;
  if (parsed) {
    const view = new URLSearchParams(h).get("v");
    showPlan(parsed, view);
  } else if (!$("#wizard").hidden && $("#plan").hidden) {
    // already on the wizard (e.g. "Change trip"): keep the current step
  } else {
    showWizard(1);
  }
}

// ---------- start ----------
async function start() {
  bindSettings();
  $$("#wizard .step h1").forEach((h) => h.setAttribute("tabindex", "-1"));
  try {
    await loadIndex();
  } catch {
    $("#cityHint").textContent = "The city list couldn't load. Check your connection and reload.";
  }
  bindWizard();
  renderCityList();
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    const b = $('[data-act="install"]');
    if (b) b.hidden = false;
  });
  $("#plan").hidden = true;
  route();
  if (!location.hash || location.hash === "#") showWizard(1);
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();

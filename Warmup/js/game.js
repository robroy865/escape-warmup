// Game logic for the Traveling Salesman puzzle

// ---------- Settings ----------
// The levels of a run: places to visit (home not counted) and bridges over the river (0 = no river)
// Full run with rivers (kept for later; switch LEVELS back to this to use it)
const LEVELS_WITH_RIVERS = [
  { places: 5, bridges: 0 }, { places: 6, bridges: 0 }, { places: 7, bridges: 0 },
  { places: 5, bridges: 1 }, { places: 6, bridges: 1 }, { places: 7, bridges: 1 },
  { places: 8, bridges: 2 }, { places: 9, bridges: 2 }, { places: 10, bridges: 2 },
  { places: 8, bridges: 1 }, { places: 9, bridges: 1 }, { places: 10, bridges: 1 },
];
// Current run: five puzzles, the last three with a river and one bridge
const LEVELS = [
  { places: 8, bridges: 0 }, { places: 9, bridges: 0 },
  { places: 10, bridges: 1 }, { places: 8, bridges: 1 }, { places: 10, bridges: 1 },
];
const NUM_LEVELS = LEVELS.length;
const SHOW_ALL_CONNECTIONS = false;   // draw every possible connection faintly (no numbers) before play

// Stars: each map is worth 5 stars, 3 for the route and 2 for speed
const ROUTE_STARS = [[100, 3], [95, 2], [90, 1]]; // route score (%) needed for 3, 2 and 1 route stars
const TIME_LIMITS = [15, 30];                     // seconds: one speed star is lost after each limit
const TIME_STARS_NEED_ROUTE_STAR = true;          // speed stars only count if the route earned at least 1 star
const STARS_PER_MAP = 3 + TIME_LIMITS.length;

const TRAVEL_SPEED = 450;    // salesman animation speed (board units per second)
const SALESMAN_SIZE = 0.8;   // salesman size relative to the buildings
const BOARD_SIZE = 1000;     // SVG coordinate system (same on every screen)
const MARGIN = 80;           // keep places away from the board sides and bottom
const MARGIN_TOP = 140;      // more room at the top for tall buildings and their number badge
const DISTANCE_SCALE = 10;   // board units per distance unit shown to the player
const LINE_CLEARANCE = 80;   // try to keep lines between two places this far from any third place
const HOME_AREA = 0.3;       // home: middle part of the board (this share of its width and height); everything else is random

// River: crosses the whole board through (roughly) the middle, at a random angle and with a gentle bend.
// Routes between places on opposite banks always go over a bridge (the one giving the shorter way).
const RIVER_WIDTH = 46;
const RIVER_OFFSET = [50, 140];   // how far the river's middle line passes from the board centre
const RIVER_AMPLITUDE = [20, 45]; // how much the river bends
const RIVER_CLEAR = 40;           // gap between the water and the centre of a building (beyond its size)
const BRIDGE_CLEAR = 110;         // no building closer than this to a bridge
const BRIDGE_GAP = 260;           // two bridges are at least this far apart
const MIN_PER_BANK = 2;           // at least this many buildings (home not counted) on each bank

const BUILDING_COLORS = ['#4f7cac', '#3a9d9a', '#8a6fbf', '#d98c4a', '#c86b98', '#5aa469',
                         '#b8925a', '#4fa3d1', '#6c7fd8', '#9b6b4f', '#7a8699', '#d4706a', '#5f9ea0'];

// Spacing, building size and label size shrink a little on boards with many places
function layoutFor(total) {
  return {
    spacing: total <= 8 ? 200 : 200 - (total - 8) * 12,
    scale: total <= 8 ? 1.25 : 1.25 - (total - 8) * 0.05,
    labelSize: total <= 8 ? 28 : 28 - (total - 8) * 1.6,
  };
}

// ---------- State ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
let level = 0;              // index into LEVELS
let toVisit = LEVELS[0].places; // places to visit on the current level
let seed = 0;               // map number: the same seed and level always give the same map (for a daily challenge later)
let levelResults = Array(NUM_LEVELS).fill(null); // first try of each level: {route, time, total, seconds, places, bridges}
let startTime = 0;          // when the current map was shown
let endTime = 0;            // when it was submitted (0 while playing)
let timerId = null;
let travelAnim = null;      // running salesman animation
let places = [];            // [{x, y, hw, hh}]  hw/hh: half width/height of the building, for line ends
let river = null;           // the river and its bridges (null = no river)
let bank = [];              // which bank each place is on (+1 or -1)
let dist = [];              // dist[i][j], whole numbers, used everywhere so shown numbers add up
let home = 0;               // index of the home place
let route = [];             // visiting order: starts at home, each place once, home again at the end when closed
let submitted = false;
let buildingScale = 1;      // building size on the current map

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const startScreen = $('start-screen'), gameScreen = $('game-screen'), summaryScreen = $('summary-screen');
const board = $('board'), levelEl = $('level-info'), statusEl = $('status'), resultEl = $('result');
const clearBtn = $('clear-btn'), submitBtn = $('submit-btn');
const newMapBtn = $('newmap-btn'), nextBtn = $('next-btn'), summaryBtn = $('summary-btn');

let riverLayer, routeLayer, optLayer, labelLayer, placesLayer;
let placeEls = [];

// ---------- Helpers ----------
function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

// Seeded random numbers: the same seed always gives the same sequence (and so the same map)
function makeRng(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const between = (rand, [lo, hi]) => lo + rand() * (hi - lo);
const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const d10 = (p, q) => Math.round(gap(p, q) / DISTANCE_SCALE);   // distance shown to the player

// Shortest distance from point p to the segment a-b
function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Playable area of the board and its centre
const AREA = { x0: MARGIN, x1: BOARD_SIZE - MARGIN, y0: MARGIN_TOP, y1: BOARD_SIZE - MARGIN };
const CENTRE = { x: (AREA.x0 + AREA.x1) / 2, y: (AREA.y0 + AREA.y1) / 2 };
const insideArea = (p, m = 0) => p.x >= AREA.x0 + m && p.x <= AREA.x1 - m && p.y >= AREA.y0 + m && p.y <= AREA.y1 - m;

// Random point in a centred box covering `share` of the playable area
function centrePoint(rand, share) {
  const w = (AREA.x1 - AREA.x0) * share, h = (AREA.y1 - AREA.y0) * share;
  return { x: CENTRE.x - w / 2 + rand() * w, y: CENTRE.y - h / 2 + rand() * h };
}

// ---------- River ----------
// The river runs along direction `dir` through the board, bending gently: across-offset = f(along).
// "along" (u) and "across" (v) are measured from the board centre.
function makeRiver(rand, bridges) {
  const angle = rand() * Math.PI;
  const r = {
    dir: { x: Math.cos(angle), y: Math.sin(angle) },
    nrm: { x: -Math.sin(angle), y: Math.cos(angle) },
    c: (rand() < 0.5 ? -1 : 1) * between(rand, RIVER_OFFSET),
    A: between(rand, RIVER_AMPLITUDE),
    w: (0.6 + rand() * 0.8) * Math.PI / BOARD_SIZE,
    phi: rand() * 2 * Math.PI,
  };
  // The part of the river that lies inside the playable area (where bridges can go)
  let uMin = Infinity, uMax = -Infinity;
  for (let u = -900; u <= 900; u += 5) if (insideArea(riverPoint(r, u), 50)) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); }
  const span = uMax - uMin;
  const spots = bridges === 2 ? [[0.15, 0.4], [0.6, 0.85]] : [[0.3, 0.7]];
  r.bridges = spots.map(([a, b]) => { const u = uMin + span * between(rand, [a, b]); return { u, p: riverPoint(r, u) }; });
  if (r.bridges.length === 2 && gap(r.bridges[0].p, r.bridges[1].p) < BRIDGE_GAP) return null;
  return r;
}
const riverF = (r, u) => r.c + r.A * Math.sin(r.w * u + r.phi);
const riverSlope = (r, u) => r.A * r.w * Math.cos(r.w * u + r.phi);
const riverPoint = (r, u) => {
  const v = riverF(r, u);
  return { x: CENTRE.x + u * r.dir.x + v * r.nrm.x, y: CENTRE.y + u * r.dir.y + v * r.nrm.y };
};
// Signed distance across the river (the sign tells which bank)
function riverOffset(r, p) {
  const dx = p.x - CENTRE.x, dy = p.y - CENTRE.y;
  return dx * r.nrm.x + dy * r.nrm.y - riverF(r, dx * r.dir.x + dy * r.dir.y);
}
const bankOf = (r, p) => (!r || riverOffset(r, p) >= 0 ? 1 : -1);

// Outline points of a building (incl. its number badge) relative to its centre, at scale 1
const BUILDING_OUTLINE = [[0, -84], [0, 52], [-34, 0], [34, 0], [-34, -50], [34, -50], [-34, 45], [34, 45]];

// Is a building at p (drawn at scale s) clear of the water and the bridges?
function clearOfRiver(r, p, s) {
  if (!r) return true;
  const o = riverOffset(r, p), half = RIVER_WIDTH / 2;
  if (Math.abs(o) < half + RIVER_CLEAR) return false;
  for (const [dx, dy] of BUILDING_OUTLINE) {
    const q = riverOffset(r, { x: p.x + dx * s, y: p.y + dy * s });
    if (Math.sign(q) !== Math.sign(o) || Math.abs(q) < half + 8) return false;
  }
  return r.bridges.every(b => gap(p, b.p) >= BRIDGE_CLEAR);
}

// Does the segment a-b stay on one bank, away from the water? (Optionally ignore the part near bridge point b.)
function staysOnBank(r, a, b, endsAtBridge) {
  const side = bankOf(r, a), steps = Math.max(1, Math.ceil(gap(a, b) / 10)), half = RIVER_WIDTH / 2;
  for (let s = 0; s <= steps; s++) {
    const p = { x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps };
    if (endsAtBridge && gap(p, b) < half + 18) continue;
    const o = riverOffset(r, p);
    if (Math.sign(o) !== side || Math.abs(o) < half + 4) return false;
  }
  return true;
}

// Which bridge gives the shortest way between a and b on opposite banks, and that distance
function crossing(r, a, b) {
  let best = null;
  for (const br of r.bridges) {
    const d = d10(a, br.p) + d10(br.p, b);
    if (!best || d < best.d) best = { d, p: br.p };
  }
  return best;
}

// The straight pieces a connection is drawn with: direct, or via a bridge when it crosses the river
function legs(r, a, b) {
  if (!r || bankOf(r, a) === bankOf(r, b)) return [[a, b]];
  const br = crossing(r, a, b).p;
  return [[a, br], [br, b]];
}

// Every connection must be possible: same-bank lines never touch the water,
// crossings reach their bridge cleanly, and each bank has enough buildings
function riverOk(r, pts) {
  if (!r) return true;
  const banks = pts.map(p => bankOf(r, p));
  const others = banks.slice(1);   // home (index 0) not counted
  if (others.filter(b => b > 0).length < MIN_PER_BANK || others.filter(b => b < 0).length < MIN_PER_BANK) return false;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      if (banks[i] === banks[j]) { if (!staysOnBank(r, pts[i], pts[j], false)) return false; }
      else {
        const br = crossing(r, pts[i], pts[j]).p;
        if (!staysOnBank(r, pts[i], br, true) || !staysOnBank(r, pts[j], br, true)) return false;
      }
    }
  return true;
}

// How many connection lines pass too close to a building that is not one of their ends
function lineProblems(pts, r) {
  let bad = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      for (const [a, b] of legs(r, pts[i], pts[j]))
        for (let k = 0; k < pts.length; k++)
          if (k !== i && k !== j && pointSegDist(pts[k], a, b) < LINE_CLEARANCE) bad++;
  return bad;
}

// ---------- Layout ----------
// One try: home near the middle, everything else random. Returns null if the places did not fit.
function tryLayout(n, spacing, scale, rand, r) {
  const pts = [];
  const fits = p => insideArea(p) && clearOfRiver(r, p, scale) && pts.every(q => gap(p, q) >= spacing);
  const place = (gen, tries) => {
    for (let a = 0; a < tries; a++) { const p = gen(); if (fits(p)) { pts.push(p); return true; } }
    return false;
  };
  if (!place(() => centrePoint(rand, HOME_AREA), 100)) return null;   // home
  const anywhere = () => ({ x: AREA.x0 + rand() * (AREA.x1 - AREA.x0), y: AREA.y0 + rand() * (AREA.y1 - AREA.y0) });
  for (let a = 0; a < 3000 && pts.length < n; a++) { const p = anywhere(); if (fits(p)) pts.push(p); }
  return pts.length === n && riverOk(r, pts) ? pts : null;
}

// Makes the river and the places. Tries many layouts and keeps the one with the fewest
// lines passing too close to a building. Makes a new river if one does not work out.
function makeBoard(n, bridges, spacing, scale, rand) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = bridges ? makeRiver(rand, bridges) : null;
    if (bridges && !r) continue;
    let best = null, bestBad = Infinity;
    for (let tries = 0; tries < 150; tries++) {
      const pts = tryLayout(n, spacing, scale, rand, r);
      if (!pts) continue;
      const bad = lineProblems(pts, r);
      if (bad < bestBad) { best = pts; bestBad = bad; }
      if (bad === 0) break;
    }
    if (best) return { pts: best, r };
  }
  throw new Error('Could not fit the places. Lower the spacing or the number of places.');
}

// Put a distance label on the line a-b, away from every building and bridge if possible
function labelPos(a, b) {
  const avoid = river ? [...places, ...river.bridges.map(br => br.p)] : places;
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (avoid.every(q => gap(p, q) > 95 * buildingScale / 1.25)) return p;
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const isClosed = () => route.length > 1 && route[route.length - 1] === home;
const visitedCount = () => route.filter(i => i !== home).length;
const allVisited = () => visitedCount() === toVisit;

function walkLength(w) {
  let s = 0;
  for (let k = 0; k < w.length - 1; k++) s += dist[w[k]][w[k + 1]];
  return s;
}

// ---------- Shortest route (Held-Karp, exact) ----------
// Best order to visit every place once, starting and ending at home.
// Uses the same distances as the player (including the way over the bridge).
function shortestRoute() {
  const others = places.map((_, i) => i).filter(i => i !== home);
  const m = others.length, FULL = (1 << m) - 1;
  const dp = new Float64Array((1 << m) * m).fill(Infinity);
  const par = new Int16Array((1 << m) * m).fill(-1);
  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = dist[home][others[j]];
  for (let mask = 1; mask <= FULL; mask++) {
    for (let j = 0; j < m; j++) {
      if (!(mask & (1 << j))) continue;
      const v = dp[mask * m + j];
      if (v === Infinity) continue;
      for (let k = 0; k < m; k++) {
        if (mask & (1 << k)) continue;
        const nm = mask | (1 << k), nv = v + dist[others[j]][others[k]];
        if (nv < dp[nm * m + k]) { dp[nm * m + k] = nv; par[nm * m + k] = j; }
      }
    }
  }
  let best = Infinity, last = -1;
  for (let j = 0; j < m; j++) {
    const v = dp[FULL * m + j] + dist[others[j]][home];
    if (v < best) { best = v; last = j; }
  }
  const order = [];
  for (let mask = FULL, j = last; j >= 0; ) {
    order.push(others[j]);
    const p = par[mask * m + j];
    mask &= ~(1 << j);
    j = p;
  }
  return { length: best, walk: [home, ...order.reverse(), home] };
}

// ---------- Buildings ----------
// Make a colour lighter (amt > 0) or darker (amt < 0)
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.round(Math.min(255, Math.max(0, amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('');
}

// Simple building centred on (0,0). Returns its half width/height and the top edge.
function drawBuilding(g, color, h) {
  const w = 46;
  svg('ellipse', { cx: 0, cy: h / 2 + 3, rx: 32, ry: 6, fill: 'rgba(0,0,0,0.3)' }, g);
  svg('rect', { class: 'body', x: -w / 2, y: -h / 2, width: w, height: h, rx: 3, fill: color }, g);
  svg('rect', { x: -w / 2 - 3, y: -h / 2 - 6, width: w + 6, height: 8, rx: 2, fill: shade(color, -0.35) }, g);
  for (let y = -h / 2 + 8; y < h / 2 - 16; y += 14)
    for (const x of [-15, 5]) svg('rect', { x, y, width: 10, height: 8, rx: 1, fill: shade(color, 0.6) }, g);
  svg('rect', { x: -5, y: h / 2 - 12, width: 10, height: 12, fill: shade(color, -0.45) }, g);
  return { hw: w / 2 + 3, hh: h / 2 + 6, top: -h / 2 - 6 };
}

// The home: a small house centred on (0,0)
function drawHouse(g) {
  svg('ellipse', { cx: 0, cy: 25, rx: 38, ry: 6, fill: 'rgba(0,0,0,0.3)' }, g);
  svg('rect', { x: 12, y: -40, width: 9, height: 18, fill: '#8c3f2e' }, g);                      // chimney
  svg('rect', { class: 'body', x: -28, y: -10, width: 56, height: 34, rx: 2, fill: '#efe6d2' }, g); // walls
  svg('polygon', { points: '-36,-8 0,-40 36,-8', fill: '#b5523b' }, g);                               // roof
  svg('rect', { x: -6, y: 6, width: 12, height: 18, rx: 1, fill: '#7a5a3c' }, g);                     // door
  svg('rect', { x: 12, y: -2, width: 10, height: 10, fill: '#9fd3f0' }, g);                           // window
  svg('rect', { x: -22, y: -2, width: 10, height: 10, fill: '#9fd3f0' }, g);                          // window
  return { hw: 36, hh: 32, top: -40 };
}

// Distance from a building's centre to its edge along the direction (ux, uy)
function edgeDist(p, ux, uy) {
  return Math.min(ux ? p.hw / Math.abs(ux) : Infinity, uy ? p.hh / Math.abs(uy) : Infinity);
}

// River band and its bridges (bridges are not clickable)
function drawRiver(layer, r) {
  const d = [];
  for (let u = -1000; u <= 1000; u += 10) { const p = riverPoint(r, u); d.push(`${d.length ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
  svg('path', { class: 'river-bank', d: d.join(' '), 'stroke-width': RIVER_WIDTH + 10 }, layer);
  svg('path', { class: 'river-water', d: d.join(' '), 'stroke-width': RIVER_WIDTH }, layer);

  for (const br of r.bridges) {
    // Bridge deck across the river, at right angles to the water
    const s = riverSlope(r, br.u);
    const tx = r.dir.x + s * r.nrm.x, ty = r.dir.y + s * r.nrm.y;   // river direction at the bridge
    const angle = Math.atan2(tx, -ty) * 180 / Math.PI;
    const len = RIVER_WIDTH + 40, wid = 28;
    const g = svg('g', { class: 'bridge', transform: `translate(${br.p.x} ${br.p.y}) rotate(${angle})` }, layer);
    svg('rect', { x: -len / 2, y: -wid / 2, width: len, height: wid, rx: 4, fill: '#9a7650', stroke: '#5e452c', 'stroke-width': 2 }, g);
    for (let x = -len / 2 + 7; x < len / 2 - 3; x += 8) svg('line', { x1: x, y1: -wid / 2 + 3, x2: x, y2: wid / 2 - 3, stroke: '#7d5e3e', 'stroke-width': 2 }, g);
    svg('rect', { x: -len / 2, y: -wid / 2 - 3, width: len, height: 4, rx: 2, fill: '#5e452c' }, g);   // railings
    svg('rect', { x: -len / 2, y: wid / 2 - 1, width: len, height: 4, rx: 2, fill: '#5e452c' }, g);
  }
}

// Start screen illustration: a few buildings joined by a dashed route
function drawHero() {
  const hero = $('hero');
  const spots = [[90, 170, 'home'], [215, 95, 70], [330, 175, 54], [440, 90, 80], [520, 185, 60]];
  const colors = shuffle(BUILDING_COLORS.slice(), Math.random);
  svg('path', { class: 'hero-route', d: 'M90,170 L215,95 L330,175 L440,90 L520,185 Q300,250 90,170' }, hero);
  spots.forEach(([x, y, h], k) => {
    const g = svg('g', { transform: `translate(${x} ${y})` }, hero);
    if (h === 'home') drawHouse(g); else drawBuilding(g, colors[k], h);
  });
}

// ---------- Maps and runs ----------
// Start a new random map for level index `lv`. Pass a seed to replay a known map.
function newMap(lv, mapSeed) {
  level = lv;
  toVisit = LEVELS[lv].places;
  seed = mapSeed || 1 + Math.floor(Math.random() * 99999);
  buildBoard();
  startTimer();
}

// Start a new run from level 1 with no stars
function newRun() {
  levelResults = Array(NUM_LEVELS).fill(null);
  showScreen(gameScreen);
  newMap(0);
}

const totalStars = () => levelResults.reduce((a, b) => a + (b ? b.total : 0), 0);
const starText = (n, of) => '★'.repeat(n) + '☆'.repeat(of - n);

// Build the board from (toVisit, seed): river, positions, colours and heights all come from the seed
function buildBoard() {
  const rand = makeRng(seed * 100 + level);
  const total = toVisit + 1;
  const { spacing, scale, labelSize } = layoutFor(total);
  buildingScale = scale;
  const made = makeBoard(total, LEVELS[level].bridges, spacing, scale, rand);
  places = made.pts; river = made.r;
  console.info(`Level ${level + 1}, map ${seed}: ${toVisit} places, ${LEVELS[level].bridges} bridge(s)`);
  home = 0;   // the first position, near the middle
  bank = places.map(p => bankOf(river, p));
  // Distances: straight on the same bank, over the best bridge across the river (each half rounded, so labels add up)
  dist = places.map((a, i) => places.map((b, j) =>
    bank[i] === bank[j] ? d10(a, b) : crossing(river, a, b).d));
  const colors = shuffle(BUILDING_COLORS.slice(), rand);

  stopTraveller();
  board.innerHTML = '';
  const defs = svg('defs', {}, board);
  const marker = svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }, marker);
  const optMarker = svg('marker', { id: 'arrow-opt', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head-opt' }, optMarker);

  riverLayer = svg('g', { class: 'river' }, board);
  if (river) drawRiver(riverLayer, river);
  // Every possible connection, drawn faintly before any click
  const allLayer = svg('g', { class: 'all-connections' }, board);
  if (SHOW_ALL_CONNECTIONS)
    for (let i = 0; i < places.length; i++)
      for (let j = i + 1; j < places.length; j++)
        for (const [a, b] of legs(river, places[i], places[j]))
          svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, allLayer);
  routeLayer = svg('g', {}, board);
  optLayer = svg('g', {}, board);
  placesLayer = svg('g', {}, board);
  labelLayer = svg('g', { class: 'labels', style: `font-size:${labelSize}px` }, board);   // distance labels on top
  placeEls = places.map((p, i) => {
    const height = 52 + rand() * 32;
    const g = svg('g', { class: 'place' + (i === home ? ' home' : ''), transform: `translate(${p.x} ${p.y}) scale(${scale})` }, placesLayer);
    const box = i === home ? drawHouse(g) : drawBuilding(g, colors[i % colors.length], height);
    p.hw = box.hw * scale; p.hh = box.hh * scale;
    svg('rect', { x: -40, y: box.top - 38, width: 80, height: box.hh - box.top + 46, fill: 'transparent' }, g); // tap area
    const badge = svg('g', { class: 'badge', transform: `translate(0 ${box.top - 18})` }, g);
    svg('circle', { r: 17 }, badge);
    const num = svg('text', {}, badge);
    g.addEventListener('click', () => onPlaceClick(i));
    return { g, num };
  });

  resetRoute();
}

// Clear the route and the result, keep the same map
function resetRoute() {
  route = [home];
  submitted = false;
  resultEl.innerHTML = '';
  showButtons('play');
  update();
}

function showButtons(mode) {
  const play = mode === 'play', last = level >= NUM_LEVELS - 1;
  clearBtn.classList.toggle('hidden', !play);
  submitBtn.classList.toggle('hidden', !play);
  newMapBtn.classList.toggle('hidden', play);
  nextBtn.classList.toggle('hidden', play || last);
  summaryBtn.classList.toggle('hidden', play || !last || !levelResults[level]);
}

function showScreen(screen) {
  for (const s of [startScreen, gameScreen, summaryScreen]) s.classList.toggle('hidden', s !== screen);
  window.scrollTo(0, 0);
}

// ---------- Timer and speed stars ----------
function startTimer() {
  stopTimer();
  startTime = performance.now();
  endTime = 0;
  timerId = setInterval(showStatus, 250);
  showStatus();
}
function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}
const seconds = () => ((endTime || performance.now()) - startTime) / 1000;
const formatTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const timeStarsFor = s => TIME_LIMITS.filter(limit => s < limit).length;

// ---------- Interaction ----------
// The route starts at home automatically.
// Tap an unvisited place to go there. Tap a visited place to remove it.
// Tap home once every place is visited to return; tap home again to undo that.
function onPlaceClick(i) {
  if (submitted) return;
  if (i === home) {
    if (isClosed()) route.pop();
    else if (allVisited()) route.push(home);
  } else {
    const k = route.indexOf(i);
    if (k === -1) {
      route.push(i);
    } else {
      if (isClosed()) route.pop();   // no longer all visited, so reopen
      route.splice(k, 1);
    }
  }
  update();
}

function onSubmit() {
  if (!isClosed()) return;
  submitted = true;
  endTime = performance.now();
  stopTimer();
  const secs = seconds();
  const yours = walkLength(route);
  const opt = shortestRoute();
  const score = yours <= opt.length ? 100 : opt.length / yours * 100;
  const routeStars = (ROUTE_STARS.find(([min]) => score >= min) || [0, 0])[1];
  const timeStars = TIME_STARS_NEED_ROUTE_STAR && routeStars === 0 ? 0 : timeStarsFor(secs);
  const stars = routeStars + timeStars;

  // Only the first try on each level counts; later maps on the same level are practice
  const first = levelResults[level] === null;
  if (first) levelResults[level] = { route: routeStars, time: timeStars, total: stars, seconds: secs, places: toVisit, bridges: LEVELS[level].bridges };
  const kept = levelResults[level];

  const praise = ['No route stars this time.', 'Good route!', 'So close!', 'Perfect route!'][routeStars];
  let verdict;
  if (!first) verdict = `Practice map: your stars for this level stay at ${kept.total} of ${STARS_PER_MAP} from your first try.`;
  else if (level >= NUM_LEVELS - 1) verdict = `Run complete! You collected ${totalStars()} of ${NUM_LEVELS * STARS_PER_MAP} stars.`;
  else verdict = '';
  const speedNote = routeStars === 0 && TIME_STARS_NEED_ROUTE_STAR ? ' (needs a route star)' : '';

  resultEl.innerHTML =
    `<div class="stars"><span>${starText(routeStars, 3)}</span><span class="time-stars">${starText(timeStars, TIME_LIMITS.length)}</span></div>` +
    `<div class="praise">${praise}</div>` +
    `<div class="breakdown">Route ${starText(routeStars, 3)} &nbsp;·&nbsp; Speed ${starText(timeStars, TIME_LIMITS.length)}${speedNote} &nbsp;·&nbsp; ${formatTime(secs)}</div>` +
    `<div>Your route: ${yours} &nbsp;|&nbsp; Shortest: ${opt.length}</div>` +
    `<div class="legend"><span class="key yours"></span>Your route <span class="key opt"></span>Shortest route</div>` +
    (verdict ? `<div class="verdict">${verdict}</div>` : '');
  showButtons('result');
  update();
  drawWalk(optLayer, opt.walk, 'opt-line', false, 'arrow-opt');
  startTraveller(route);   // runs on its own; the buttons work straight away
  document.querySelector('.buttons').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const riverText = n => (n === 0 ? '\u2013' : n === 1 ? '1 bridge' : `${n} bridges`);

// ---------- Run summary ----------
function showSummary() {
  const rows = levelResults.map((r, k) => r
    ? `<tr><td>${k + 1}</td><td>${r.places}</td><td>${riverText(r.bridges)}</td><td class="st">${starText(r.route, 3)}</td><td class="st time-stars">${starText(r.time, TIME_LIMITS.length)}</td><td>${formatTime(r.seconds)}</td><td><b>${r.total}</b></td></tr>`
    : `<tr><td>${k + 1}</td><td>${LEVELS[k].places}</td><td>${riverText(LEVELS[k].bridges)}</td><td colspan="4">not played</td></tr>`).join('');
  $('summary-total').textContent = `${totalStars()} of ${NUM_LEVELS * STARS_PER_MAP} stars`;
  $('summary-table').innerHTML =
    '<tr><th>Level</th><th>Places</th><th>River</th><th>Route</th><th>Speed</th><th>Time</th><th>Stars</th></tr>' + rows;
  stopTraveller();
  showScreen(summaryScreen);
}

// ---------- Drawing ----------
function update() {
  const last = route[route.length - 1];
  placeEls.forEach((el, i) => {
    const k = route.indexOf(i);
    el.g.classList.toggle('visited', k !== -1 && i !== home);
    el.g.classList.toggle('current', !submitted && i === last && i !== home);
    if (i !== home) el.num.textContent = k === -1 ? '' : k;
  });
  routeLayer.innerHTML = '';
  optLayer.innerHTML = '';
  labelLayer.innerHTML = '';
  drawWalk(routeLayer, route, 'route-line', true, 'arrow');

  levelEl.textContent = `Level ${level + 1} of ${NUM_LEVELS} · ★ ${totalStars()} of ${NUM_LEVELS * STARS_PER_MAP}`;
  const b = LEVELS[level].bridges;
  $('river-note').textContent = b === 0 ? '' : b === 1 ? 'Routes across the river go over the bridge.' : 'Routes across the river use whichever bridge is shorter.';
  showStatus();
  submitBtn.disabled = !isClosed();
  clearBtn.disabled = route.length === 1;
}

function showStatus() {
  const s = seconds();
  let text = `Visited ${visitedCount()} of ${toVisit} · Time ${formatTime(s)} · Speed ${starText(timeStarsFor(s), TIME_LIMITS.length)}`;
  if (!submitted && allVisited() && !isClosed()) text += ' · Now return home';
  if (statusEl.textContent !== text) statusEl.textContent = text;   // only touch the page when the text changes
}

// Draw a walk as lines with arrows (over the bridge where it crosses the river);
// optionally with one distance label per connection
function drawWalk(layer, w, cls, labels, arrow) {
  for (let k = 0; k < w.length - 1; k++) {
    const pieces = legs(river, places[w[k]], places[w[k + 1]]);
    pieces.forEach(([a, b], n) => {
      const lastPiece = n === pieces.length - 1;
      let ex = b.x, ey = b.y;
      if (lastPiece) {   // end the line just before the building, with an arrow
        const len = gap(a, b), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const stop = edgeDist(b, ux, uy) + 8;
        ex = b.x - ux * stop; ey = b.y - uy * stop;
      }
      svg('line', { class: cls, x1: a.x, y1: a.y, x2: ex, y2: ey, 'marker-end': lastPiece ? `url(#${arrow})` : '' }, layer);
    });
    if (labels) {
      const [a, b] = pieces.reduce((best, p) => (gap(p[0], p[1]) > gap(best[0], best[1]) ? p : best));
      const lp = labelPos(a, b);
      const t = svg('text', { class: 'dist-label', x: lp.x, y: lp.y }, labelLayer);
      t.textContent = dist[w[k]][w[k + 1]];
    }
  }
}

// ---------- Salesman animation ----------
// A small salesman walks the player's route after Submit (over the bridge too). It never blocks the buttons.
function drawSalesman(parent) {
  const g = svg('g', {}, parent);
  svg('ellipse', { cx: 0, cy: 2, rx: 14, ry: 4, fill: 'rgba(0,0,0,0.35)' }, g);
  svg('rect', { x: -7, y: -18, width: 5, height: 18, rx: 2, fill: '#2b2f3a' }, g);   // legs
  svg('rect', { x: 2, y: -18, width: 5, height: 18, rx: 2, fill: '#2b2f3a' }, g);
  svg('rect', { x: -10, y: -42, width: 20, height: 26, rx: 5, fill: '#3d5a99' }, g); // jacket
  svg('circle', { cx: 0, cy: -51, r: 9, fill: '#f1c27d' }, g);                        // head
  svg('rect', { x: -10, y: -63, width: 20, height: 6, rx: 2, fill: '#2b2f3a' }, g);  // hat
  svg('rect', { x: -6, y: -69, width: 12, height: 8, rx: 2, fill: '#2b2f3a' }, g);
  svg('rect', { x: 9, y: -26, width: 14, height: 11, rx: 2, fill: '#8a5a2b' }, g);   // briefcase
  return g;
}

function startTraveller(w) {
  stopTraveller();
  const layer = svg('g', { class: 'traveller' }, board);
  const man = drawSalesman(layer);
  const pts = [places[w[0]]];
  for (let k = 0; k < w.length - 1; k++)
    for (const [, b] of legs(river, places[w[k]], places[w[k + 1]])) pts.push(b);
  const lens = pts.slice(1).map((p, k) => gap(p, pts[k]));
  const total = lens.reduce((a, b) => a + b, 0);
  const t0 = performance.now();
  const step = now => {
    let d = Math.min(total, (now - t0) / 1000 * TRAVEL_SPEED);
    let k = 0;
    while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
    const a = pts[k], b = pts[k + 1], t = lens[k] ? Math.min(1, d / lens[k]) : 1;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    const face = b.x < a.x ? -1 : 1;
    const bob = Math.abs(Math.sin(now / 90)) * 4;
    const sc = buildingScale * SALESMAN_SIZE;
    man.setAttribute('transform', `translate(${x} ${y + 20 * sc - bob}) scale(${sc * face} ${sc})`);
    travelAnim = (now - t0) / 1000 * TRAVEL_SPEED < total ? requestAnimationFrame(step) : null;
  };
  travelAnim = requestAnimationFrame(step);
}

function stopTraveller() {
  if (travelAnim) cancelAnimationFrame(travelAnim);
  travelAnim = null;
}

// ---------- Buttons ----------
$('start-btn').addEventListener('click', newRun);
clearBtn.addEventListener('click', resetRoute);
submitBtn.addEventListener('click', onSubmit);
newMapBtn.addEventListener('click', () => newMap(level));
nextBtn.addEventListener('click', () => newMap(level + 1));
summaryBtn.addEventListener('click', showSummary);
$('again-btn').addEventListener('click', newRun);
$('home-btn').addEventListener('click', () => { location.href = 'index.html'; });
$('back-btn').addEventListener('click', () => { stopTimer(); stopTraveller(); location.href = 'index.html'; });

drawHero();

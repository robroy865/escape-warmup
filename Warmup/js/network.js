// Road network mode for the Traveling Salesman puzzle.
// The player can only travel along roads. From where you stand, the roads leading out are
// highlighted; tap one of them (or the dot / building at its far end) to walk along it.
// Roads may be used more than once. Visit every building, then return home.
// (The earlier straight-line game is in game.js.)

// ---------- Settings ----------
const LEVELS = [
  // 15 nodes: 1 house + 5 buildings + 9 junctions. remove: share of the possible roads that is removed (random in this range)
  { buildings: 5, junctions: 9, remove: [0.3, 0.6] },
];
const NUM_LEVELS = LEVELS.length;

// Stars: each map is worth 5 stars, 3 for the route and 2 for speed
const ROUTE_STARS = [[100, 3], [95, 2], [90, 1]]; // route score (%) needed for 3, 2 and 1 route stars
const TIME_LIMITS = [15, 30];                     // seconds: one speed star is lost after each limit
const TIME_STARS_NEED_ROUTE_STAR = true;          // speed stars only count if the route earned at least 1 star
const STARS_PER_MAP = 3 + TIME_LIMITS.length;

const BOARD_SIZE = 1000;      // SVG coordinate system (same on every screen)
const MARGIN = 80;            // keep nodes away from the board sides and bottom
const MARGIN_TOP = 140;       // more room at the top for buildings
const DISTANCE_SCALE = 10;    // board units per distance unit
const HOME_AREA = 0.3;        // home: middle part of the board
const BUILDING_SPACING = 220; // minimum distance between buildings (and home)
const JUNCTION_SPACING = 140; // minimum distance from a junction to any other node
const ROAD_CLEARANCE = 55;    // a road may not pass closer than this to another node
const BUILDING_SCALE = 1.0;
const TAP_RANGE = 70;         // how far from a road or node a tap still counts
const TRAVEL_SPEED = 450;     // salesman animation speed (board units per second)
const SALESMAN_SIZE = 0.8;    // salesman size relative to the buildings

const BUILDING_COLORS = ['#4f7cac', '#3a9d9a', '#8a6fbf', '#d98c4a', '#c86b98', '#5aa469',
                         '#b8925a', '#4fa3d1', '#6c7fd8', '#9b6b4f', '#7a8699', '#d4706a', '#5f9ea0'];

// ---------- State ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
let level = 0;
let seed = 0;
let levelResults = Array(NUM_LEVELS).fill(null);
let startTime = 0, endTime = 0, timerId = null, travelAnim = null;
let nodes = [];      // [{x, y, kind: 'home' | 'building' | 'junction', hw, hh}]
let edges = [];      // [[i, j]]
let adj = [];        // adj[i] = [{to, edge}]
let len = [];        // len[e] = road length (whole number)
let home = 0;
let path = [];       // nodes in walking order, starts at home; may repeat
let submitted = false;
let nodeEls = [], roadEls = [];

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const startScreen = $('start-screen'), gameScreen = $('game-screen'), summaryScreen = $('summary-screen');
const board = $('board'), levelEl = $('level-info'), statusEl = $('status'), resultEl = $('result');
const undoBtn = $('undo-btn'), clearBtn = $('clear-btn'), submitBtn = $('submit-btn');
const newMapBtn = $('newmap-btn'), nextBtn = $('next-btn'), summaryBtn = $('summary-btn');
let roadLayer, routeLayer, optLayer, nodeLayer;

// ---------- Helpers ----------
function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
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
const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
// Do segments a-b and c-d cross (touching at a shared end does not count)?
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
const AREA = { x0: MARGIN, x1: BOARD_SIZE - MARGIN, y0: MARGIN_TOP, y1: BOARD_SIZE - MARGIN };
const CENTRE = { x: (AREA.x0 + AREA.x1) / 2, y: (AREA.y0 + AREA.y1) / 2 };
function centrePoint(rand, share) {
  const w = (AREA.x1 - AREA.x0) * share, h = (AREA.y1 - AREA.y0) * share;
  return { x: CENTRE.x - w / 2 + rand() * w, y: CENTRE.y - h / 2 + rand() * h };
}
const anywhere = rand => ({ x: AREA.x0 + rand() * (AREA.x1 - AREA.x0), y: AREA.y0 + rand() * (AREA.y1 - AREA.y0) });

// ---------- Network ----------
// Places home, buildings and junctions; returns null if they do not fit
function placeNodes(rand, lv) {
  const pts = [];
  const ok = (p, spacing) => pts.every(q => gap(p, q) >= Math.max(spacing, q.kind === 'junction' ? JUNCTION_SPACING : 0));
  const put = (gen, kind, spacing, tries = 400) => {
    for (let a = 0; a < tries; a++) { const p = gen(); if (ok(p, spacing)) { pts.push({ ...p, kind }); return true; } }
    return false;
  };
  if (!put(() => centrePoint(rand, HOME_AREA), 'home', 0)) return null;
  for (let k = 0; k < lv.buildings; k++) if (!put(() => anywhere(rand), 'building', BUILDING_SPACING)) return null;
  for (let k = 0; k < lv.junctions; k++) if (!put(() => anywhere(rand), 'junction', JUNCTION_SPACING)) return null;
  return pts;
}

function connected(n, es) {
  const seen = new Set([0]), stack = [0];
  while (stack.length) {
    const i = stack.pop();
    for (const [a, b] of es) for (const [u, v] of [[a, b], [b, a]]) if (u === i && !seen.has(v)) { seen.add(v); stack.push(v); }
  }
  return seen.size === n;
}

// Possible roads: every pair of nodes may be joined, shortest first, as long as the road does not
// cross another road or pass too close to another node. Inner nodes naturally end up with more roads.
// Then a random 30-60 % of the roads are removed, keeping everything connected and every junction
// on at least two roads.
function makeRoads(pts, rand, removeShare) {
  const n = pts.length;
  const cands = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cands.push([i, j]);
  cands.sort((a, b) => gap(pts[a[0]], pts[a[1]]) - gap(pts[b[0]], pts[b[1]]));
  const es = [];
  for (const [i, j] of cands) {
    const a = pts[i], b = pts[j];
    if (pts.some((p, k) => k !== i && k !== j && pointSegDist(p, a, b) < ROAD_CLEARANCE)) continue;
    if (es.some(([c, d]) => c !== i && c !== j && d !== i && d !== j && segmentsCross(a, b, pts[c], pts[d]))) continue;
    es.push([i, j]);
  }
  if (!connected(n, es)) return null;
  const deg0 = k => es.filter(([a, b]) => a === k || b === k).length;
  if (pts.some((p, k) => p.kind === 'junction' && deg0(k) < 2)) return null;   // no dead-end junctions

  const share = removeShare[0] + rand() * (removeShare[1] - removeShare[0]);
  const target = Math.max(n - 1, Math.round(es.length * (1 - share)));
  const degree = k => es.filter(([a, b]) => a === k || b === k).length;
  for (const e of shuffle(es.slice(), rand)) {
    if (es.length <= target) break;
    const rest = es.filter(x => x !== e);
    if (!connected(n, rest)) continue;
    if (e.some(k => pts[k].kind === 'junction' && degree(k) <= 2)) continue;
    es.splice(es.indexOf(e), 1);
  }
  return es;
}

function makeNetwork(rand, lv) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const pts = placeNodes(rand, lv);
    if (!pts) continue;
    const es = makeRoads(pts, rand, lv.remove);
    if (es) return { pts, es };
  }
  throw new Error('Could not build a road network.');
}

// ---------- Shortest route ----------
// Shortest road distance between all nodes (Floyd-Warshall), then the best order to
// visit the buildings from home and back (Held-Karp, exact), expanded into the full walk.
function shortestRoute() {
  const n = nodes.length, INF = 1e9;
  const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)));
  const nx = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => j));
  edges.forEach(([a, b], e) => { D[a][b] = D[b][a] = len[e]; });
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    if (D[i][k] + D[k][j] < D[i][j]) { D[i][j] = D[i][k] + D[k][j]; nx[i][j] = nx[i][k]; }

  const bs = nodes.map((_, i) => i).filter(i => nodes[i].kind === 'building');
  const m = bs.length, FULL = (1 << m) - 1;
  const dp = new Float64Array((1 << m) * m).fill(Infinity), par = new Int16Array((1 << m) * m).fill(-1);
  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = D[home][bs[j]];
  for (let mask = 1; mask <= FULL; mask++) for (let j = 0; j < m; j++) {
    if (!(mask & (1 << j))) continue;
    const v = dp[mask * m + j]; if (v === Infinity) continue;
    for (let k = 0; k < m; k++) {
      if (mask & (1 << k)) continue;
      const nm = mask | (1 << k), nv = v + D[bs[j]][bs[k]];
      if (nv < dp[nm * m + k]) { dp[nm * m + k] = nv; par[nm * m + k] = j; }
    }
  }
  let best = Infinity, last = -1;
  for (let j = 0; j < m; j++) { const v = dp[FULL * m + j] + D[bs[j]][home]; if (v < best) { best = v; last = j; } }
  const order = [];
  for (let mask = FULL, j = last; j >= 0; ) { order.push(bs[j]); const p = par[mask * m + j]; mask &= ~(1 << j); j = p; }
  const stops = [home, ...order.reverse(), home];
  const walk = [home];
  for (let k = 0; k < stops.length - 1; k++) { let a = stops[k]; while (a !== stops[k + 1]) { a = nx[a][stops[k + 1]]; walk.push(a); } }
  return { length: best, walk };
}

// ---------- Route helpers ----------
const current = () => path[path.length - 1];
const edgeBetween = (a, b) => adj[a].find(x => x.to === b);
const buildingIds = () => nodes.map((_, i) => i).filter(i => nodes[i].kind === 'building');
const visitedCount = () => buildingIds().filter(i => path.includes(i)).length;
const allVisited = () => visitedCount() === buildingIds().length;
const isDone = () => path.length > 1 && current() === home && allVisited();
function walkLength(w) { let s = 0; for (let k = 0; k < w.length - 1; k++) s += len[edgeBetween(w[k], w[k + 1]).edge]; return s; }

// ---------- Drawing: buildings ----------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.round(Math.min(255, Math.max(0, amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join('');
}
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
function drawHouse(g) {
  svg('ellipse', { cx: 0, cy: 25, rx: 38, ry: 6, fill: 'rgba(0,0,0,0.3)' }, g);
  svg('rect', { x: 12, y: -40, width: 9, height: 18, fill: '#8c3f2e' }, g);
  svg('rect', { class: 'body', x: -28, y: -10, width: 56, height: 34, rx: 2, fill: '#efe6d2' }, g);
  svg('polygon', { points: '-36,-8 0,-40 36,-8', fill: '#b5523b' }, g);
  svg('rect', { x: -6, y: 6, width: 12, height: 18, rx: 1, fill: '#7a5a3c' }, g);
  svg('rect', { x: 12, y: -2, width: 10, height: 10, fill: '#9fd3f0' }, g);
  svg('rect', { x: -22, y: -2, width: 10, height: 10, fill: '#9fd3f0' }, g);
  return { hw: 36, hh: 32, top: -40 };
}
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
function newMap(lv, mapSeed) {
  level = lv;
  seed = mapSeed || 1 + Math.floor(Math.random() * 99999);
  buildBoard();
  startTimer();
}
function newRun() {
  levelResults = Array(NUM_LEVELS).fill(null);
  showScreen(gameScreen);
  newMap(0);
}
const totalStars = () => levelResults.reduce((a, b) => a + (b ? b.total : 0), 0);
const starText = (n, of) => '★'.repeat(n) + '☆'.repeat(of - n);

function buildBoard() {
  const rand = makeRng(seed * 100 + level + 7);
  const net = makeNetwork(rand, LEVELS[level]);
  nodes = net.pts; edges = net.es;
  home = 0;
  len = edges.map(([a, b]) => Math.round(gap(nodes[a], nodes[b]) / DISTANCE_SCALE));
  adj = nodes.map(() => []);
  edges.forEach(([a, b], e) => { adj[a].push({ to: b, edge: e }); adj[b].push({ to: a, edge: e }); });
  console.info(`Network map ${seed}: ${nodes.length} nodes, ${edges.length} roads`);

  stopTraveller();
  board.innerHTML = '';
  const defs = svg('defs', {}, board);
  const marker = svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto' }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }, marker);

  roadLayer = svg('g', { class: 'roads' }, board);
  routeLayer = svg('g', {}, board);
  optLayer = svg('g', {}, board);
  nodeLayer = svg('g', {}, board);

  roadEls = edges.map(([a, b]) => svg('line', { class: 'road', x1: nodes[a].x, y1: nodes[a].y, x2: nodes[b].x, y2: nodes[b].y }, roadLayer));

  const colors = shuffle(BUILDING_COLORS.slice(), rand);
  nodeEls = nodes.map((p, i) => {
    const g = svg('g', { class: 'node ' + p.kind, transform: `translate(${p.x} ${p.y})` }, nodeLayer);
    if (p.kind === 'junction') {
      svg('circle', { class: 'junction-dot', r: 7 }, g);
      p.hw = p.hh = 10;
      return { g };
    }
    const inner = svg('g', { transform: `scale(${BUILDING_SCALE})` }, g);
    svg('ellipse', { class: 'avail-ring', cx: 0, cy: p.kind === 'home' ? 25 : 30, rx: 40, ry: 10 }, inner);
    const box = p.kind === 'home' ? drawHouse(inner) : drawBuilding(inner, colors[i % colors.length], 50 + rand() * 24);
    p.hw = box.hw * BUILDING_SCALE; p.hh = box.hh * BUILDING_SCALE; p.top = box.top * BUILDING_SCALE;
    const badge = svg('g', { class: 'badge', transform: `translate(0 ${box.top - 18})` }, inner);
    svg('circle', { r: 17 }, badge);
    const num = svg('text', {}, badge);
    return { g, num };
  });

  resetRoute();
}

function resetRoute() {
  path = [home];
  submitted = false;
  resultEl.innerHTML = '';
  showButtons('play');
  update();
}

function showButtons(mode) {
  const play = mode === 'play', last = level >= NUM_LEVELS - 1;
  for (const b of [undoBtn, clearBtn, submitBtn]) b.classList.toggle('hidden', !play);
  newMapBtn.classList.toggle('hidden', play);
  nextBtn.classList.toggle('hidden', play || last);
  summaryBtn.classList.toggle('hidden', play || !last || !levelResults[level]);
}
function showScreen(screen) {
  for (const s of [startScreen, gameScreen, summaryScreen]) s.classList.toggle('hidden', s !== screen);
  window.scrollTo(0, 0);
}

// ---------- Timer ----------
function startTimer() { stopTimer(); startTime = performance.now(); endTime = 0; timerId = setInterval(showStatus, 250); showStatus(); }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
const seconds = () => ((endTime || performance.now()) - startTime) / 1000;
const formatTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const timeStarsFor = s => TIME_LIMITS.filter(limit => s < limit).length;

// ---------- Interaction ----------
// One tap handler for the whole board: find the road out of the current node, or the node at
// its far end, that is closest to the tap. Anything else does nothing.
function boardPoint(evt) {
  const pt = board.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(board.getScreenCTM().inverse());
}
function onBoardTap(evt) {
  if (submitted) return;
  const p = boardPoint(evt), here = nodes[current()];
  let best = null, bestD = TAP_RANGE;
  for (const { to } of adj[current()]) {
    const q = nodes[to];
    // Tapping the node itself (buildings are tall, so also count the area above them)
    const onBuilding = q.kind !== 'junction' && Math.abs(p.x - q.x) <= q.hw + 10 && p.y >= q.y + q.top - 40 && p.y <= q.y + q.hh + 10;
    const dNode = onBuilding ? 0 : gap(p, q);
    // Tapping the road (not right next to where you stand, where all roads meet)
    const dRoad = gap(p, here) < 35 ? Infinity : pointSegDist(p, here, q);
    const d = Math.min(dNode, dRoad);
    if (d < bestD) { bestD = d; best = to; }
  }
  if (best === null) return;
  path.push(best);
  update();
}
function onUndo() { if (!submitted && path.length > 1) { path.pop(); update(); } }

function onSubmit() {
  if (!isDone()) return;
  submitted = true;
  endTime = performance.now();
  stopTimer();
  const secs = seconds();
  const yours = walkLength(path);
  const opt = shortestRoute();
  const score = yours <= opt.length ? 100 : opt.length / yours * 100;
  const routeStars = (ROUTE_STARS.find(([min]) => score >= min) || [0, 0])[1];
  const timeStars = TIME_STARS_NEED_ROUTE_STAR && routeStars === 0 ? 0 : timeStarsFor(secs);
  const stars = routeStars + timeStars;

  const first = levelResults[level] === null;
  if (first) levelResults[level] = { route: routeStars, time: timeStars, total: stars, seconds: secs, places: LEVELS[level].buildings };
  const kept = levelResults[level];
  const praise = ['No route stars this time.', 'Good route!', 'So close!', 'Perfect route!'][routeStars];
  let verdict = '';
  if (!first) verdict = `Practice map: your stars for this level stay at ${kept.total} of ${STARS_PER_MAP} from your first try.`;
  else if (level >= NUM_LEVELS - 1) verdict = `Run complete! You collected ${totalStars()} of ${NUM_LEVELS * STARS_PER_MAP} stars.`;
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
  drawWalk(optLayer, opt.walk, 'opt-line');
  startTraveller(path);
  document.querySelector('#game-screen .buttons').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Drawing ----------
function update() {
  const here = current();
  const open = submitted ? [] : adj[here];
  roadEls.forEach((el, e) => el.classList.toggle('available', open.some(x => x.edge === e)));
  const firstVisit = {};
  let n = 0;
  for (const i of path) if (nodes[i].kind === 'building' && !(i in firstVisit)) firstVisit[i] = ++n;
  nodeEls.forEach((el, i) => {
    el.g.classList.toggle('available', open.some(x => x.to === i));
    el.g.classList.toggle('current', !submitted && i === here);
    el.g.classList.toggle('visited', path.includes(i) && i !== home);
    if (el.num) el.num.textContent = firstVisit[i] || '';
  });
  routeLayer.innerHTML = '';
  optLayer.innerHTML = '';
  drawWalk(routeLayer, path, 'route-line');

  levelEl.textContent = `Level ${level + 1} of ${NUM_LEVELS} · ★ ${totalStars()} of ${NUM_LEVELS * STARS_PER_MAP}`;
  showStatus();
  submitBtn.disabled = !isDone();
  undoBtn.disabled = clearBtn.disabled = path.length === 1 || submitted;
}

function showStatus() {
  const s = seconds();
  let text = `Visited ${visitedCount()} of ${buildingIds().length} · Time ${formatTime(s)} · Speed ${starText(timeStarsFor(s), TIME_LIMITS.length)}`;
  if (!submitted && allVisited() && current() !== home) text += ' · Now return home';
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

// Draw a walk along the roads. A road used more than once gets its extra lines shifted
// slightly to the side so every pass is visible. Only the last step has an arrow.
function drawWalk(layer, w, cls) {
  const uses = {};
  for (let k = 0; k < w.length - 1; k++) {
    const a = nodes[w[k]], b = nodes[w[k + 1]];
    const e = edgeBetween(w[k], w[k + 1]).edge;
    const nth = uses[e] = (uses[e] || 0) + 1;
    const shift = nth === 1 ? 0 : (nth % 2 ? -1 : 1) * Math.ceil((nth - 1) / 2) * 8;
    const L = gap(a, b), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, ox = -uy * shift, oy = ux * shift;
    const lastStep = k === w.length - 2 && cls === 'route-line' && !submitted;
    let ex = b.x, ey = b.y;
    if (lastStep) { const stop = (b.kind === 'junction' ? 10 : Math.min(b.hw / Math.abs(ux || 1e-9), b.hh / Math.abs(uy || 1e-9))) + 6; ex = b.x - ux * stop; ey = b.y - uy * stop; }
    svg('line', { class: cls, x1: a.x + ox, y1: a.y + oy, x2: ex + ox, y2: ey + oy, 'marker-end': lastStep ? 'url(#arrow)' : '' }, layer);
  }
}

// ---------- Run summary ----------
function showSummary() {
  const rows = levelResults.map((r, k) => r
    ? `<tr><td>${k + 1}</td><td>${r.places}</td><td>roads</td><td class="st">${starText(r.route, 3)}</td><td class="st time-stars">${starText(r.time, TIME_LIMITS.length)}</td><td>${formatTime(r.seconds)}</td><td><b>${r.total}</b></td></tr>`
    : `<tr><td>${k + 1}</td><td>${LEVELS[k].buildings}</td><td>roads</td><td colspan="4">not played</td></tr>`).join('');
  $('summary-total').textContent = `${totalStars()} of ${NUM_LEVELS * STARS_PER_MAP} stars`;
  $('summary-table').innerHTML = '<tr><th>Level</th><th>Buildings</th><th>Map</th><th>Route</th><th>Speed</th><th>Time</th><th>Stars</th></tr>' + rows;
  stopTraveller();
  showScreen(summaryScreen);
}

// ---------- Salesman animation ----------
function drawSalesman(parent) {
  const g = svg('g', {}, parent);
  svg('ellipse', { cx: 0, cy: 2, rx: 14, ry: 4, fill: 'rgba(0,0,0,0.35)' }, g);
  svg('rect', { x: -7, y: -18, width: 5, height: 18, rx: 2, fill: '#2b2f3a' }, g);
  svg('rect', { x: 2, y: -18, width: 5, height: 18, rx: 2, fill: '#2b2f3a' }, g);
  svg('rect', { x: -10, y: -42, width: 20, height: 26, rx: 5, fill: '#3d5a99' }, g);
  svg('circle', { cx: 0, cy: -51, r: 9, fill: '#f1c27d' }, g);
  svg('rect', { x: -10, y: -63, width: 20, height: 6, rx: 2, fill: '#2b2f3a' }, g);
  svg('rect', { x: -6, y: -69, width: 12, height: 8, rx: 2, fill: '#2b2f3a' }, g);
  svg('rect', { x: 9, y: -26, width: 14, height: 11, rx: 2, fill: '#8a5a2b' }, g);
  return g;
}
function startTraveller(w) {
  stopTraveller();
  const man = drawSalesman(svg('g', { class: 'traveller' }, board));
  const pts = w.map(i => nodes[i]);
  const lens = pts.slice(1).map((p, k) => gap(p, pts[k]));
  const total = lens.reduce((a, b) => a + b, 0);
  const t0 = performance.now();
  const step = now => {
    let d = Math.min(total, (now - t0) / 1000 * TRAVEL_SPEED), k = 0;
    while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
    const a = pts[k], b = pts[k + 1], t = lens[k] ? Math.min(1, d / lens[k]) : 1;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    const sc = BUILDING_SCALE * SALESMAN_SIZE, bob = Math.abs(Math.sin(now / 90)) * 4;
    man.setAttribute('transform', `translate(${x} ${y + 20 * sc - bob}) scale(${sc * (b.x < a.x ? -1 : 1)} ${sc})`);
    travelAnim = (now - t0) / 1000 * TRAVEL_SPEED < total ? requestAnimationFrame(step) : null;
  };
  travelAnim = requestAnimationFrame(step);
}
function stopTraveller() { if (travelAnim) cancelAnimationFrame(travelAnim); travelAnim = null; }

// ---------- Buttons ----------
board.addEventListener('click', onBoardTap);
$('start-btn').addEventListener('click', newRun);
undoBtn.addEventListener('click', onUndo);
clearBtn.addEventListener('click', resetRoute);
submitBtn.addEventListener('click', onSubmit);
newMapBtn.addEventListener('click', () => newMap(level));
nextBtn.addEventListener('click', () => newMap(level + 1));
summaryBtn.addEventListener('click', showSummary);
$('again-btn').addEventListener('click', newRun);
$('home-btn').addEventListener('click', () => showScreen(startScreen));
$('back-btn').addEventListener('click', () => { stopTimer(); stopTraveller(); showScreen(startScreen); });

drawHero();

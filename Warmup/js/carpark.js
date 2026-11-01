// Escape the Car Park: slide the cars and vans out of the way so your yellow car can drive out.
// Cars only move along their own direction. One slide is one move, however far it goes.
// Every puzzle comes with the fewest moves needed, worked out in advance by trying every move.

// ---------- Settings ----------
const N = 6;                 // 6 x 6 car park
const EXIT_ROW = 2;          // the exit is on the right, in row 3 (counting from 1)
const LEVELS = [
  { name: 'Level 1', time: [30, 60] },
  { name: 'Level 2', time: [60, 120] },
  { name: 'Level 3', time: [90, 180] },
];
const NUM_LEVELS = LEVELS.length;
const STARS_PER_GAME = 5;    // 3 for moves + 2 for speed
// Moves stars: 3 = fewest possible, 2 = up to this many extra moves, 1 = escaped at all
const extraFor2 = best => Math.max(2, Math.ceil(best * 0.25));

// Puzzles: 36 letters, row by row. '.' = empty, 'A' = your car, other letters = cars (2 long) and vans (3 long).
// The number is the fewest moves needed to escape.
const PUZZLES = [
  [ // level 1
    [".D.....DBFF.AABH..C.BH.GCIEE.GCI....", 5], [".F.....FDDD.AABECHGIBECHGIBEC.......", 5], ["LL..EEB.IIJJBAA..GBHHC.G.K.C.D.KFF.D", 5],
    ["H.EE..H.FBBBAAF..G..DD.GC...IIC.....", 5], ["...D.G...DHGFAADH.F.EE...CCCJIBBB.JI", 5], ["EE.....FDDGGHFBAALHMB.CLIMB.CKI.JJ.K", 6],
    [".BBB.C.FF..CI.AA.CI..EEE....GG.HHDDD", 6], ["...JJKCCCLDK.AALDBEEFF.B.GGIIB....HH", 6], ["...HHG.D.EEG.DAA.JBBB..JIKKCCCI...FF", 6],
    ["...LDDBBBL.JAA..KJ.GGEK.IIFE.MHHFCCM", 6], [".BBBHH.CCFIIAA.FED....ED.....G.....G", 7], ["LE.DDDLECCC..AAFJ.MMGFJ...GHHIBBBKKI", 7],
    ["II...CHHBBBCG..AACGDDDJJ......EEFF..", 7], ["..GGKKCDD..EC.AABECI..B.HI..B.HJJ.FF", 7], ["GGHH.BKK...BAA...BCCC...FFJDLLIIJDEE", 7],
  ],
  [ // level 2
    ["....II..BGGDAAB..D..BKK.FFCCH.EEJJH.", 11], [".BBBG..CCCGE.AAKIEFD.KIEFD..HH.DLLJJ", 11], [".GG...HHLJJFAAL.EFIBBBE.I..CDDKK.CMM", 11],
    ["GGHH.B.KK..B..AA.B..JCCCFFJDLL.IIDEE", 11], [".BBB.KCCC..KAAJ.....JIIDH.FFGDH.EEG.", 11], [".KKCII.HHC.F.AAC.F..EEGG..DBBB..DJJ.", 11],
    ["KKG.FF..GH.JAA.H.J.DBBBE.DC..EIIC...", 11], ["...CG....CGBDAAC.BD.F..B.EFHH..E....", 11], ["...DJJ.GGDB.AA.LBIKK.LBIF.CCCEFHH..E", 11],
    ["..CEHHG.CEDJGAAIDJ...I.B...FFBKK...B", 11], ["..CBJJE.CBF.EAABF..DD..G.I.HHG.I....", 11], ["LDDD..LE.CCC.EAAJIMMGFJI..GFHHBBBKK.", 10],
    ["..B.JJ..BDDDAABFEIC..FEIC...G.C.HHG.", 10], ["D..HH.DFGGBEDFAABE.JJCB...KC....KCII", 10], ["HDMMLLHDEEII.AA.F.GG..F.BBBJJ.CCC.KK", 10],
  ],
  [ // level 3
    ["FF.C.....C...AAC..DI...BDIEHHBD.EGGB", 15], ["CGEEDLCG..DLCAAH.KBMMH.KB.IFJ.B.IFJ.", 15], ["M.EDD.MGEBBB.GAAJ..LLKJ..HHKFC..IIFC", 14],
    ["..DD.JBBBLKJAAFLKM..FGGM...EII.HHECC", 13], ["G.....GIIDEEAAFD.H..FD.H...CCC...BBB", 13], [".........CG.AA.CG....C.BDEFHHBDEF..B", 13],
    ["GGF...C.FEE.CAA.J.HH..J.DDBBB.IIKK..", 13], ["........FJB.AAFJB.GDDDB.GHIIEE.H.CCC", 13], ["...DJJ...DGGAA.LBIKK.LBIFCCCBEF..HHE", 13],
    ["CCCIIFHDDDBFHJAAB..J..B....EGG...EKK", 12], [".GGHHB...KKB..JAAB..JCCCFF.DLL.IIDEE", 12], ["BBBHH..FFGGC..AALC...ILC.DDIEE..JJKK", 12],
    ["..DIIB..D..BH.AA.BH..CFF...CEE...CGG", 12], ["K...JJK.FFC..AA.C.DDHHCGIE...GIE.BBB", 12], ["DDD...LECCCILEAAJIMMGFJ...GFHHBBB.KK", 12],
  ],
];

// ---------- State ----------
let level = 0, puzzleIndex = -1, best = 0;
let cars = [];            // {id, r, c, len, h}
let startCars = [];
let history = [];         // earlier positions, for Undo
let moves = 0, finished = false;
let levelResults = Array(NUM_LEVELS).fill(null);
let startTime = 0, endTime = 0, timerId = null;
let drag = null;

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const startScreen = $('start-screen'), gameScreen = $('game-screen'), summaryScreen = $('summary-screen');
const board = $('park-board'), levelEl = $('level-info'), statusEl = $('status'), resultEl = $('result');
const undoBtn = $('undo-btn'), restartBtn = $('restart-btn'), newBtn = $('new-btn'), nextBtn = $('next-btn'), summaryBtn = $('summary-btn');

const starText = (n, of) => '★'.repeat(n) + '☆'.repeat(of - n);
const totalStars = () => levelResults.reduce((a, b) => a + (b ? b.total : 0), 0);
const L = () => LEVELS[level];

// ---------- Drawing sizes ----------
const S = 60, M = 14;                 // cell size and wall width
const W = N * S + 2 * M;              // board size without the exit lane
const COLOURS = ['#4f7cac', '#3a9d9a', '#c86b98', '#8a8f99', '#6b7fd1', '#b5523b', '#5e8c4a', '#9a6fb0', '#a3825a', '#4a8fa8', '#c0794a', '#7d8ca3'];
const VAN_COLOURS = ['#5b6475', '#4a6a8a', '#6a5a7a', '#56705e'];

function parse(str) {
  const seen = {};
  for (let i = 0; i < N * N; i++) {
    const ch = str[i];
    if (ch === '.') continue;
    const r = Math.floor(i / N), c = i % N;
    if (!seen[ch]) seen[ch] = { id: ch, r, c, len: 0, h: str[i + 1] === ch && c < N - 1 };
    seen[ch].len++;
  }
  return Object.values(seen).sort((a, b) => (a.id === 'A' ? -1 : b.id === 'A' ? 1 : a.id < b.id ? -1 : 1));
}

function occupied(except) {
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  for (const v of cars) if (v !== except)
    for (let k = 0; k < v.len; k++) g[v.h ? v.r : v.r + k][v.h ? v.c + k : v.c] = v.id;
  return g;
}

// How far a car can slide either way: [lowest, highest] start cell along its lane
function range(v) {
  const g = occupied(v);
  let lo = v.h ? v.c : v.r, hi = lo;
  const free = p => (v.h ? !g[v.r][p] : !g[p][v.c]);
  while (lo - 1 >= 0 && free(lo - 1)) lo--;
  while (hi + v.len < N && free(hi + v.len)) hi++;
  return [lo, hi];
}

function carShape(v, i) {
  const w = (v.h ? v.len : 1) * S - 8, h = (v.h ? 1 : v.len) * S - 8;
  const you = v.id === 'A';
  const fill = you ? '#f2c94c' : v.len === 3 ? VAN_COLOURS[i % VAN_COLOURS.length] : COLOURS[i % COLOURS.length];
  const glass = you ? '#5e452c' : '#1d222b';
  // windows: front and back screens across the car
  let win = '';
  if (v.len === 2) {
    win = v.h
      ? `<rect x="${w - 30}" y="8" width="11" height="${h - 16}" rx="3" fill="${glass}" opacity="0.75"/><rect x="14" y="10" width="8" height="${h - 20}" rx="3" fill="${glass}" opacity="0.6"/>`
      : `<rect x="8" y="${h - 30}" width="${w - 16}" height="11" rx="3" fill="${glass}" opacity="0.75"/><rect x="10" y="14" width="${w - 20}" height="8" rx="3" fill="${glass}" opacity="0.6"/>`;
  } else {
    win = v.h
      ? `<rect x="${w - 26}" y="8" width="12" height="${h - 16}" rx="3" fill="${glass}" opacity="0.75"/><line x1="10" y1="${h / 2}" x2="${w - 34}" y2="${h / 2}" stroke="#000" stroke-opacity="0.18" stroke-width="2"/>`
      : `<rect x="8" y="${h - 26}" width="${w - 16}" height="12" rx="3" fill="${glass}" opacity="0.75"/><line x1="${w / 2}" y1="10" x2="${w / 2}" y2="${h - 34}" stroke="#000" stroke-opacity="0.18" stroke-width="2"/>`;
  }
  const arrow = you ? `<path d="M${w / 2 - 12},${h / 2 - 9} L${w / 2 + 2},${h / 2} L${w / 2 - 12},${h / 2 + 9}" fill="none" stroke="#14181f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  return `<rect width="${w}" height="${h}" rx="11" fill="${fill}" stroke="#14181f" stroke-opacity="0.5" stroke-width="2"/>${win}${arrow}`;
}

const carX = (v, c = v.c) => M + c * S + 4;
const carY = (v, r = v.r) => M + r * S + 4;

function drawFrame(svg, withExitSign = true) {
  let s = `<rect x="0" y="0" width="${W}" height="${W}" rx="16" fill="#3a404c"/>` +
    `<rect x="${M}" y="${M}" width="${N * S}" height="${N * S}" rx="6" fill="#232832"/>`;
  for (let k = 1; k < N; k++) {
    s += `<line x1="${M + k * S}" y1="${M + 6}" x2="${M + k * S}" y2="${M + N * S - 6}" stroke="#2f3541" stroke-width="2" stroke-dasharray="10 8"/>`;
    s += `<line x1="${M + 6}" y1="${M + k * S}" x2="${M + N * S - 6}" y2="${M + k * S}" stroke="#2f3541" stroke-width="2" stroke-dasharray="10 8"/>`;
  }
  // gap in the wall for the exit, and the sign outside
  const ey = M + EXIT_ROW * S;
  s += `<rect x="${W - M - 1}" y="${ey}" width="${M + 2}" height="${S}" fill="#232832"/>`;
  s += `<rect x="${W}" y="${ey}" width="${64}" height="${S}" fill="#1b1f27"/>`;
  if (withExitSign) s += `<text x="${W + 32}" y="${ey + S / 2 - 8}" class="exit-text">EXIT</text>` +
    `<path d="M${W + 18},${ey + S / 2 + 12} H${W + 44} M${W + 36},${ey + S / 2 + 4} L${W + 46},${ey + S / 2 + 12} L${W + 36},${ey + S / 2 + 20}" fill="none" stroke="#e9edf3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  svg.innerHTML = s;
}

function buildBoard() {
  drawFrame(board);
  cars.forEach((v, i) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('car');
    if (v.id === 'A') g.classList.add('you');
    g.dataset.id = v.id;
    g.innerHTML = carShape(v, i);
    g.addEventListener('pointerdown', e => startDrag(e, v, g));
    v.el = g;
    board.appendChild(g);
  });
  placeAll();
}

function place(v, pos) {          // pos: start cell along the lane (may be fractional while dragging)
  const x = v.h ? carX(v, pos) : carX(v), y = v.h ? carY(v) : carY(v, pos);
  v.el.setAttribute('transform', `translate(${x} ${y})`);
}
function placeAll() { for (const v of cars) place(v, v.h ? v.c : v.r); }

// ---------- Dragging ----------
function svgPoint(e) {
  const pt = board.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(board.getScreenCTM().inverse());
}

function startDrag(e, v, g) {
  if (finished || drag) return;
  e.preventDefault();
  g.setPointerCapture(e.pointerId);
  const p = svgPoint(e);
  drag = { v, g, id: e.pointerId, from: v.h ? v.c : v.r, at: v.h ? p.x : p.y, range: range(v), pos: v.h ? v.c : v.r };
  g.classList.add('dragging');
  g.addEventListener('pointermove', moveDrag);
  g.addEventListener('pointerup', endDrag);
  g.addEventListener('pointercancel', endDrag);
}

function moveDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const p = svgPoint(e), v = drag.v;
  const pos = drag.from + ((v.h ? p.x : p.y) - drag.at) / S;
  drag.pos = Math.min(drag.range[1], Math.max(drag.range[0], pos));
  place(v, drag.pos);
}

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { v, g, from } = drag;
  g.removeEventListener('pointermove', moveDrag);
  g.removeEventListener('pointerup', endDrag);
  g.removeEventListener('pointercancel', endDrag);
  g.classList.remove('dragging');
  const to = Math.round(drag.pos);
  drag = null;
  slide(v, to - from);
}

// Slide car v by d cells (used by dragging and by the tests)
function slide(v, d) {
  if (finished || !d) { place(v, v.h ? v.c : v.r); return false; }
  const [lo, hi] = range(v), from = v.h ? v.c : v.r, to = from + d;
  if (to < lo || to > hi) { place(v, from); return false; }
  history.push(cars.map(c => [c.r, c.c]));
  if (v.h) v.c = to; else v.r = to;
  moves++;
  place(v, to);
  if (v.id === 'A' && v.c === N - 2) escape();
  render();
  return true;
}

function undo() {
  if (finished || !history.length) return;
  const prev = history.pop();
  cars.forEach((v, i) => { [v.r, v.c] = prev[i]; });
  moves--;
  placeAll(); render();
}

function restart() {
  if (finished) return;
  cars.forEach((v, i) => { v.r = startCars[i].r; v.c = startCars[i].c; });
  history = []; moves = 0;
  placeAll(); render();
}

// ---------- Game flow ----------
function newRun() {
  levelResults = Array(NUM_LEVELS).fill(null);
  showScreen(gameScreen);
  newPuzzle(0);
}

function newPuzzle(lv) {
  level = lv;
  const list = PUZZLES[level];
  let k;
  do k = Math.floor(Math.random() * list.length); while (list.length > 1 && k === puzzleIndex);
  puzzleIndex = k;
  const [str, fewest] = list[k];
  best = fewest;
  cars = parse(str);
  startCars = cars.map(v => ({ r: v.r, c: v.c }));
  history = []; moves = 0; finished = false;
  resultEl.innerHTML = '';
  $('instructions').textContent = 'Drag the cars to clear a path, then drive the yellow car out through the exit.';
  buildBoard();
  startTimer();
  render();
}

function escape() {
  finished = true;
  endTime = performance.now();
  stopTimer();
  // drive out through the exit
  const v = cars[0], x0 = carX(v), y = carY(v), t0 = performance.now();
  v.el.classList.add('leaving');
  const step = now => {
    const f = Math.min(1, (now - t0) / 600);
    v.el.setAttribute('transform', `translate(${x0 + f * f * 3.6 * S} ${y})`);
    if (f < 1) requestAnimationFrame(step); else finish();
  };
  requestAnimationFrame(step);
}

function finish() {
  const secs = seconds();
  const moveStars = moves <= best ? 3 : moves <= best + extraFor2(best) ? 2 : 1;
  const timeStars = timeStarsFor(secs);
  const stars = moveStars + timeStars;
  const first = levelResults[level] === null;
  if (first) levelResults[level] = { moves, best, moveStars, time: timeStars, total: stars, seconds: secs };
  const kept = levelResults[level];

  let verdict = '';
  if (!first) verdict = `Practice car park: your stars for this level stay at ${kept.total} of ${STARS_PER_GAME} from your first try.`;
  else if (level >= NUM_LEVELS - 1) verdict = `Run complete! You collected ${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME} stars.`;
  const praise = ['', 'You got out!', 'Nice driving!', 'Perfect escape!'][moveStars];
  const extra = moves - best;
  const how = extra === 0 ? 'the fewest possible!' : `${extra} more than the fewest possible (${best}).`;

  resultEl.innerHTML =
    `<div class="stars"><span>${starText(moveStars, 3)}</span><span class="time-stars">${starText(timeStars, 2)}</span></div>` +
    `<div class="praise">${praise}</div>` +
    `<div class="breakdown">Moves ${starText(moveStars, 3)} &nbsp;·&nbsp; Speed ${starText(timeStars, 2)} &nbsp;·&nbsp; ${formatTime(secs)}</div>` +
    `<div>Escaped in ${moves} move${moves === 1 ? '' : 's'}: ${how}</div>` +
    `<div class="legend">3 stars: ${best} moves · 2 stars: up to ${best + extraFor2(best)} · 1 star: any escape</div>` +
    (verdict ? `<div class="verdict">${verdict}</div>` : '');
  render();
  document.querySelector('#game-screen .buttons').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function render() {
  const last = level >= NUM_LEVELS - 1;
  undoBtn.classList.toggle('hidden', finished);
  restartBtn.classList.toggle('hidden', finished);
  undoBtn.disabled = !history.length;
  restartBtn.disabled = !history.length;
  newBtn.classList.toggle('hidden', !finished);
  nextBtn.classList.toggle('hidden', !finished || last);
  summaryBtn.classList.toggle('hidden', !finished || !last || !levelResults[level]);
  levelEl.textContent = `Level ${level + 1} of ${NUM_LEVELS} · ★ ${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME}`;
  showStatus();
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
const timeStarsFor = s => L().time.filter(limit => s < limit).length;

function showStatus() {
  const s = seconds();
  const text = `Moves ${moves} · Fewest ${best} · Time ${formatTime(s)} · Speed ${starText(timeStarsFor(s), 2)}`;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

// ---------- Run summary ----------
function showSummary() {
  const rows = levelResults.map((r, k) => r
    ? `<tr><td>${k + 1}</td><td>${r.moves} (${r.best})</td><td class="st">${starText(r.moveStars, 3)}</td><td class="st time-stars">${starText(r.time, 2)}</td><td>${formatTime(r.seconds)}</td><td><b>${r.total}</b></td></tr>`
    : `<tr><td>${k + 1}</td><td colspan="5">not played</td></tr>`).join('');
  $('summary-total').textContent = `${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME} stars`;
  $('summary-table').innerHTML = '<tr><th>Level</th><th>Moves (fewest)</th><th>Stars</th><th>Speed</th><th>Time</th><th>Total</th></tr>' + rows;
  showScreen(summaryScreen);
}

// ---------- Start screen picture ----------
function drawHero() {
  const svg = $('park-hero');
  drawFrame(svg);
  const demo = parse('..B...C.B...CAA...D.EE..D...FF......');
  demo.forEach((v, i) => {
    svg.insertAdjacentHTML('beforeend', `<g transform="translate(${carX(v)} ${carY(v)})">${carShape(v, i + 1)}</g>`);
  });
}

// ---------- Buttons ----------
$('start-btn').addEventListener('click', newRun);
undoBtn.addEventListener('click', undo);
restartBtn.addEventListener('click', restart);
newBtn.addEventListener('click', () => newPuzzle(level));
nextBtn.addEventListener('click', () => newPuzzle(level + 1));
summaryBtn.addEventListener('click', showSummary);
$('again-btn').addEventListener('click', newRun);
$('home-btn').addEventListener('click', () => { location.href = 'index.html'; });
$('back-btn').addEventListener('click', () => { stopTimer(); location.href = 'index.html'; });

drawHero();

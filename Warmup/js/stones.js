// The Odd Stone.
//   Part 1: nine stones (A to I), one is heavier. Two weighings, then name the heavy stone.
//   Part 2 ("The Odder Stone"): twelve stones (A to L), one is heavier OR lighter. Three weighings,
//   then name the odd stone and say whether it is heavier or lighter.
//
// The odd stone (and in part 2 whether it is heavier or lighter) is picked at random when the puzzle
// starts and never changes; the scale simply shows the true result. The game keeps the list of
// possibilities the weighings still allow, and checks after each weighing whether the method would have
// worked whatever the scale showed. A right answer from a sure method gets 3 stars plus speed stars;
// a right answer that needed luck gets 2 stars and no speed stars.

// ---------- Settings ----------
const LEVELS = [
  { stones: 9,  weighings: 2, either: false, time: [40, 80] },   // part 1: the odd stone is heavier
  { stones: 12, weighings: 3, either: true,  time: [60, 120] },  // part 2: heavier or lighter (the classic)
];
const NUM_LEVELS = LEVELS.length;
const STARS_WORKED_OUT = 3;   // right answer, and a sure method found it
const STARS_LUCKY = 2;        // right answer, but luck was needed (no speed stars then)
const STARS_PER_GAME = 5;     // 3 for the answer + 2 for speed
const NORMAL = 10;            // weight of a normal stone; the odd one is 1 more or 1 less

// Scale geometry (board units)
const PIVOT = { x: 200, y: 60 };
const ARM = 120;              // half the beam length
const HANG = 95;              // how far the pans hang below the beam ends
const TILT = 0.17;            // beam angle when tipped (radians, about 10 degrees)
const STONE_R = 19;

// ---------- State ----------
let level = 0;
let LABELS = [];
let where = {};            // stone -> 'ground' | 'left' | 'right'
let order = { left: [], right: [] };
let home = {};             // stone -> {x, y} resting place on the ground
let pos = {};              // stone -> {x, y} drawn position
let angle = 0;             // current beam angle (positive: left side down)
let odd = null;            // the odd stone: {s: label, d: +1 heavier / -1 lighter}
let candidates = [];       // possibilities the weighings so far still allow: [{s, d}]
let sure = true;           // false once a weighing could have left too many possibilities to finish for certain
let luckNote = null;       // the first weighing that needed luck: which result would have left too many, and what
let weighCount = 0;
let phase = 'arrange';     // 'arrange' | 'weighed' | 'answer' | 'done'
let picked = null, pickedDir = 0;
let startTime = 0, endTime = 0, timerId = null, animId = null;
let levelResults = Array(NUM_LEVELS).fill(null);   // first try of each part

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const board = $('scale-board'), statusEl = $('status'), promptEl = $('prompt'), logEl = $('log'), resultEl = $('result');
const weighBtn = $('weigh-btn'), continueBtn = $('continue-btn'), submitBtn = $('submit-btn');
const againBtn = $('new-btn'), nextBtn = $('next-btn'), choiceEl = $('choice');
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
const starText = (n, of) => '★'.repeat(n) + '☆'.repeat(of - n);
const L = () => LEVELS[level];
const dirWord = d => (d > 0 ? 'heavier' : 'lighter');
const totalStars = () => levelResults.reduce((a, b) => a + (b ? b.total : 0), 0);

// ---------- Drawing the scale ----------
let beamG, leftHang, rightHang, stoneEls = {};

// A stone-like shape: a slightly irregular rounded outline, different for each stone
function stonePath(seed) {
  let a = seed * 9301 + 49297;
  const rnd = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  const pts = [];
  for (let k = 0; k < 9; k++) {
    const t = k / 9 * Math.PI * 2, r = STONE_R * (0.86 + rnd() * 0.24);
    pts.push([Math.cos(t) * r * 1.12, Math.sin(t) * r * 0.9]);
  }
  let d = '';
  for (let k = 0; k < pts.length; k++) {
    const p0 = pts[(k - 1 + pts.length) % pts.length], p1 = pts[k], p2 = pts[(k + 1) % pts.length], p3 = pts[(k + 2) % pts.length];
    if (k === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function drawStone(parent, label, k) {
  const g = svg('g', { class: 'stone' }, parent);
  const shades = ['#8b909a', '#959aa3', '#80868f', '#9a9488', '#8e8a84', '#878d96', '#9298a0', '#8a8378', '#7f858d', '#938f87', '#868b93', '#9c9690'];
  svg('ellipse', { cx: 2, cy: STONE_R * 0.85, rx: STONE_R * 1.05, ry: 5, fill: 'rgba(0,0,0,0.3)' }, g);
  svg('path', { class: 'stone-body', d: stonePath(k + 3), fill: shades[k % shades.length] }, g);
  svg('path', { d: 'M-9,-8 q6,-6 14,-3', stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
  const t = svg('text', { class: 'stone-label', y: 1 }, g);
  t.textContent = label;
  return g;
}

function drawScaleFrame(parent, withGround) {
  svg('rect', { x: 192, y: PIVOT.y, width: 16, height: 175, rx: 4, fill: '#5b6372' }, parent);
  svg('path', { d: 'M150,240 L250,240 L234,222 L166,222 Z', fill: '#5b6372' }, parent);
  svg('rect', { x: 130, y: 236, width: 140, height: 9, rx: 4, fill: '#4a5160' }, parent);
  const lh = svg('g', {}, parent), rh = svg('g', {}, parent), beam = svg('g', {}, parent);
  svg('rect', { x: -ARM - 8, y: -5, width: ARM * 2 + 16, height: 10, rx: 5, fill: '#c9a227' }, beam);
  svg('circle', { cx: 0, cy: 0, r: 9, fill: '#e2bd45', stroke: '#8a6d14', 'stroke-width': 3 }, beam);
  for (const hang of [lh, rh]) {
    svg('line', { class: 'chain', x1: 0, y1: 0, x2: -58, y2: HANG }, hang);
    svg('line', { class: 'chain', x1: 0, y1: 0, x2: 58, y2: HANG }, hang);
    svg('path', { class: 'pan', d: `M-70,${HANG} Q0,${HANG + 30} 70,${HANG} Z` }, hang);
  }
  if (withGround) svg('rect', { x: 10, y: 258, width: 380, height: 92, rx: 14, fill: '#191e26' }, parent);
  return { lh, rh, beam };
}

function buildBoard() {
  board.innerHTML = '';
  const f = drawScaleFrame(board, true);
  leftHang = f.lh; rightHang = f.rh; beamG = f.beam;
  stoneEls = {};
  LABELS.forEach((s, k) => { stoneEls[s] = drawStone(board, s, k); stoneEls[s].dataset.stone = s; });
}

// Where the pans hang for a beam angle
function panAnchor(side, a = angle) {
  const sgn = side === 'left' ? -1 : 1;
  return { x: PIVOT.x + sgn * ARM * Math.cos(a), y: PIVOT.y - sgn * ARM * Math.sin(a) };
}
// Spot for the n-th stone on a pan (rows of 3, piling upwards)
function panSlot(side, n) {
  const a = panAnchor(side), col = n % 3, row = Math.floor(n / 3);
  return { x: a.x + (col - 1) * 36 + (row % 2 ? 10 : 0), y: a.y + HANG - 6 - row * 30 };
}
const targetOf = s => (where[s] === 'ground' ? home[s] : panSlot(where[s], order[where[s]].indexOf(s)));

function render() {
  beamG.setAttribute('transform', `translate(${PIVOT.x} ${PIVOT.y}) rotate(${-angle * 180 / Math.PI})`);
  for (const [side, hang] of [['left', leftHang], ['right', rightHang]]) {
    const a = panAnchor(side);
    hang.setAttribute('transform', `translate(${a.x} ${a.y})`);
  }
  for (const s of LABELS) {
    stoneEls[s].setAttribute('transform', `translate(${pos[s].x.toFixed(1)} ${pos[s].y.toFixed(1)})`);
    stoneEls[s].classList.toggle('picked', picked === s);
  }
}

// Smoothly move the beam and the stones to where they should be
function animate(toAngle, ms = 500) {
  if (animId) cancelAnimationFrame(animId);
  const fromAngle = angle, from = {};
  for (const s of LABELS) from[s] = { ...pos[s] };
  const t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
    angle = fromAngle + (toAngle - fromAngle) * e;
    for (const s of LABELS) {
      const to = targetOf(s);
      pos[s] = { x: from[s].x + (to.x - from[s].x) * e, y: from[s].y + (to.y - from[s].y) * e };
    }
    render();
    animId = t < 1 ? requestAnimationFrame(step) : null;
  };
  animId = requestAnimationFrame(step);
}

// ---------- Moving stones (drag or tap) ----------
let drag = null;
function boardPoint(evt) {
  const pt = board.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(board.getScreenCTM().inverse());
}
function moveStone(s, to) {
  if (where[s] !== 'ground') order[where[s]].splice(order[where[s]].indexOf(s), 1);
  where[s] = to;
  if (to !== 'ground') order[to].push(s);
  animate(angle, 250);
  updateButtons();
}
function dropZone(p) {
  for (const side of ['left', 'right']) {
    const a = panAnchor(side);
    if (Math.abs(p.x - a.x) < 90 && p.y > a.y + HANG - 130 && p.y < a.y + HANG + 35) return side;
  }
  return 'ground';
}
board.addEventListener('pointerdown', e => {
  const g = e.target.closest('.stone');
  if (!g) return;
  const s = g.dataset.stone;
  if (phase === 'answer') { picked = s; render(); updateButtons(); return; }
  if (phase !== 'arrange') return;
  const p = boardPoint(e);
  drag = { s, dx: pos[s].x - p.x, dy: pos[s].y - p.y, moved: false, x0: p.x, y0: p.y };
  board.setPointerCapture(e.pointerId);
  board.appendChild(stoneEls[s]);   // dragged stone on top
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = boardPoint(e);
  if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 6) drag.moved = true;
  if (!drag.moved) return;
  pos[drag.s] = { x: p.x + drag.dx, y: p.y + drag.dy };
  render();
});
board.addEventListener('pointerup', e => {
  if (!drag) return;
  const s = drag.s;
  if (drag.moved) moveStone(s, dropZone(boardPoint(e)));
  else moveStone(s, { ground: 'left', left: 'right', right: 'ground' }[where[s]]);   // tap: ground -> left -> right -> ground
  drag = null;
});
board.addEventListener('pointercancel', () => { if (drag) { animate(angle, 250); drag = null; } });

// ---------- Game flow ----------
function scatterHomes() {
  // two loose rows on the ground, mildly scattered
  const n = LABELS.length, perRow = Math.ceil(n / 2), gapX = 360 / perRow;
  const spots = LABELS.map((_, k) => {
    const row = k < perRow ? 0 : 1, col = row ? k - perRow : k;
    return { x: 40 + col * gapX + (row ? gapX / 2 : 0), y: row ? 324 : 284 };
  });
  const shuffled = LABELS.slice().sort(() => Math.random() - 0.5);
  const jx = Math.min(22, gapX - 46);
  shuffled.forEach((s, k) => { home[s] = { x: spots[k].x + (Math.random() - 0.5) * jx, y: spots[k].y + (Math.random() - 0.5) * 10 }; });
}

function newPuzzle() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }   // stop any animation from the last puzzle
  LABELS = 'ABCDEFGHIJKL'.slice(0, L().stones).split('');
  where = {}; pos = {}; home = {};
  scatterHomes();
  for (const s of LABELS) { where[s] = 'ground'; pos[s] = { ...home[s] }; }
  order = { left: [], right: [] };
  odd = { s: LABELS[Math.floor(Math.random() * LABELS.length)], d: L().either && Math.random() < 0.5 ? -1 : 1 };
  candidates = LABELS.flatMap(s => (L().either ? [{ s, d: 1 }, { s, d: -1 }] : [{ s, d: 1 }]));
  sure = true; luckNote = null; angle = 0; weighCount = 0; phase = 'arrange'; picked = null; pickedDir = 0;
  logEl.innerHTML = ''; resultEl.innerHTML = '';
  $('instructions').textContent = L().either
    ? 'One of the twelve stones is heavier or lighter. Find it, and say which, with three weighings.'
    : 'One of the nine stones is heavier. Find it with two weighings.';
  buildBoard(); render();
  startTimer();
  updateButtons();
}

// How the scale tips if possibility h is the truth
function tipFor(h) {
  const w = side => order[side].reduce((sum, s) => sum + (s === h.s ? NORMAL + h.d : NORMAL), 0);
  const l = w('left'), r = w('right');
  return l > r ? 'left' : r > l ? 'right' : 'level';
}

function weigh() {
  if (phase !== 'arrange' || (!order.left.length && !order.right.length)) return;
  const outcome = tipFor(odd);   // the true result
  // A sure method: whatever the scale had shown, the possibilities left could still be told apart
  // with the weighings remaining (each weighing has 3 results, so k weighings tell apart 3^k possibilities).
  const remaining = L().weighings - weighCount - 1;
  for (const o of ['left', 'right', 'level']) {
    const group = candidates.filter(h => tipFor(h) === o);
    if (group.length > 3 ** remaining) {
      sure = false;
      if (!luckNote || (luckNote.n === weighCount + 1 && group.length > luckNote.group.length))
        luckNote = { n: weighCount + 1, outcome: o, group, remaining };
    }
  }
  candidates = candidates.filter(h => tipFor(h) === outcome);
  weighCount++;
  phase = weighCount >= L().weighings ? 'answer' : 'weighed';

  const text = { left: 'left side heavier', right: 'right side heavier', level: 'balanced' }[outcome];
  const li = document.createElement('li');
  li.innerHTML = `<b>${order.left.join(' ') || '–'}</b> against <b>${order.right.join(' ') || '–'}</b>: ${text}`;
  logEl.appendChild(li);
  animate(outcome === 'left' ? TILT : outcome === 'right' ? -TILT : 0, 700);
  updateButtons();
}

// "Reset" between weighings: stones back on the ground, scale level
function onReset() {
  for (const s of LABELS) where[s] = 'ground';
  order = { left: [], right: [] };
  phase = 'arrange';
  animate(0, 500);
  updateButtons();
}

// Explains which weighing needed luck, e.g. "Weighing 2 was lucky: if the right side had been heavier, ..."
function luckText() {
  if (!luckNote) return '';
  const { n, outcome, group, remaining } = luckNote;
  const what = { left: 'the left side had been heavier', right: 'the right side had been heavier', level: 'the scale had balanced' }[outcome];
  const left = remaining === 0 ? 'and no weighings left'
    : `with ${remaining === 1 ? 'one weighing' : remaining + ' weighings'} left, which can only tell apart ${3 ** remaining}`;
  return `Weighing ${n} was lucky: if ${what}, ${group.map(describe).join(', ')} would all still have been possible. ` +
    `That is ${group.length} options ${left}, so you would have had to guess.`;
}

const describe = h => (L().either ? `${h.s} (${dirWord(h.d)})` : h.s);

function submit() {
  if (phase !== 'answer' || !picked || (L().either && !pickedDir)) return;
  phase = 'done';
  endTime = performance.now();
  stopTimer();
  const secs = seconds();
  const workedOut = candidates.length === 1;           // only one possibility fits the weighings
  const solved = workedOut && sure;                    // ... and the method would have found it every time
  const right = picked === odd.s && (!L().either || pickedDir === odd.d);
  const answerStars = right ? (solved ? STARS_WORKED_OUT : STARS_LUCKY) : 0;
  const timeStars = right && solved ? timeStarsFor(secs) : 0;   // no speed stars for a lucky answer
  const stars = answerStars + timeStars;
  const first = levelResults[level] === null;
  if (first) levelResults[level] = { total: stars };

  const truth = L().either ? `stone ${odd.s} is the odd one, and it is ${dirWord(odd.d)}` : `stone ${odd.s} is the heavy one`;
  const list = candidates.map(describe).join(', ');
  let msg;
  if (right && solved) msg = `Correct! You worked it out: ${truth}.`;
  else if (right && workedOut) msg = `Correct, but luck helped. ${luckText()}`;
  else if (right) msg = `Correct, but it was a lucky guess. After your weighings, these were all still possible: ${list}.`;
  else if (workedOut) msg = `Not this time. Your weighings showed that ${truth}.`;
  else msg = `Not this time: ${truth}. After your weighings, these were still possible: ${list}.`;

  let verdict = '';
  if (!first) verdict = `Practice puzzle: your score for this part stays at ${levelResults[level].total} of ${STARS_PER_GAME} from your first try.`;
  else if (level === NUM_LEVELS - 1) verdict = `Both parts done: ${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME} stars.`;

  resultEl.innerHTML =
    `<div class="stars"><span>${starText(answerStars, 3)}</span><span class="time-stars">${starText(timeStars, 2)}</span></div>` +
    `<div class="praise">${right ? (solved ? 'Solved!' : 'Lucky!') : 'Not this time'}</div>` +
    `<div class="breakdown">Answer ${starText(answerStars, 3)} &nbsp;·&nbsp; Speed ${starText(timeStars, 2)} &nbsp;·&nbsp; ${formatTime(secs)}</div>` +
    `<div>${msg}</div>` + (verdict ? `<div class="verdict">${verdict}</div>` : '');
  // nothing moves at the end: only the score is shown
  updateButtons();
  document.querySelector('#game-screen .buttons').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function chooseDir(d) {
  if (phase !== 'answer') return;
  pickedDir = d;
  updateButtons();
}

function updateButtons() {
  weighBtn.classList.toggle('hidden', phase !== 'arrange');
  weighBtn.disabled = !order.left.length && !order.right.length;
  continueBtn.classList.toggle('hidden', phase !== 'weighed');
  submitBtn.classList.toggle('hidden', phase !== 'answer');
  submitBtn.disabled = !picked || (L().either && !pickedDir);
  againBtn.classList.toggle('hidden', phase !== 'done');
  nextBtn.classList.toggle('hidden', phase !== 'done' || level >= NUM_LEVELS - 1);
  choiceEl.classList.toggle('hidden', phase !== 'answer' || !L().either);
  $('heavier-btn').classList.toggle('on', pickedDir === 1);
  $('lighter-btn').classList.toggle('on', pickedDir === -1);

  const need = L().either ? 'Tap the odd stone, then choose Heavier or Lighter.' : 'Which stone is heavier? Tap it.';
  let answerText = `No weighings left. ${need}`;
  if (picked && (!L().either || pickedDir)) answerText = `You chose stone ${picked}${L().either ? ', ' + dirWord(pickedDir) : ''}. Press Submit.`;
  else if (picked) answerText = `Stone ${picked}: is it heavier or lighter?`;
  promptEl.textContent = {
    arrange: `Weighing ${weighCount + 1} of ${L().weighings}: drag stones onto the pans, then press Weigh.`,
    weighed: 'Look at the result, then press Reset for the next weighing.',
    answer: answerText,
    done: '',
  }[phase];
  $('level-info').textContent = `Part ${level + 1} of ${NUM_LEVELS} · ★ ${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME}`;
  showStatus();
}

// ---------- Timer ----------
function startTimer() { stopTimer(); startTime = performance.now(); endTime = 0; timerId = setInterval(showStatus, 250); showStatus(); }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
const seconds = () => ((endTime || performance.now()) - startTime) / 1000;
const formatTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const timeStarsFor = s => L().time.filter(limit => s < limit).length;
function showStatus() {
  const s = seconds();
  const text = `Weighings used ${weighCount} of ${L().weighings} · Time ${formatTime(s)} · Speed ${starText(timeStarsFor(s), 2)}`;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

// ---------- Start page pictures ----------
function drawHero(id, leftLabel, rightLabel) {
  const hero = $(id);
  const f = drawScaleFrame(hero, false);
  const a = 0.14;
  f.beam.setAttribute('transform', `translate(${PIVOT.x} ${PIVOT.y}) rotate(${-a * 180 / Math.PI})`);
  const lp = panAnchor('left', a), rp = panAnchor('right', a);
  f.lh.setAttribute('transform', `translate(${lp.x} ${lp.y})`);
  f.rh.setAttribute('transform', `translate(${rp.x} ${rp.y})`);
  drawStone(hero, leftLabel, 0).setAttribute('transform', `translate(${lp.x} ${lp.y + HANG - 6})`);
  drawStone(hero, rightLabel, 4).setAttribute('transform', `translate(${rp.x} ${rp.y + HANG - 6})`);
}

// ---------- Screens and buttons ----------
function showScreen(id) {
  for (const s of ['start-screen', 'start2-screen', 'game-screen']) $(s).classList.toggle('hidden', s !== id);
  window.scrollTo(0, 0);
}
function startLevel(lv) { level = lv; showScreen('game-screen'); newPuzzle(); }

$('start-btn').addEventListener('click', () => { levelResults = Array(NUM_LEVELS).fill(null); startLevel(0); });
$('start2-btn').addEventListener('click', () => startLevel(1));
weighBtn.addEventListener('click', weigh);
continueBtn.addEventListener('click', onReset);
submitBtn.addEventListener('click', submit);
againBtn.addEventListener('click', newPuzzle);
nextBtn.addEventListener('click', () => { stopTimer(); showScreen('start2-screen'); });
$('heavier-btn').addEventListener('click', () => chooseDir(1));
$('lighter-btn').addEventListener('click', () => chooseDir(-1));
for (const id of ['back-btn', 'back2-btn']) $(id).addEventListener('click', () => { stopTimer(); location.href = 'index.html'; });

drawHero('stones-hero', '?', '');
drawHero('stones-hero2', '?', '?');

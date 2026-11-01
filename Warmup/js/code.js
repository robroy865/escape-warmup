// Crack the Code: find a secret lock code. Digits can repeat.
// After each guess: ● = right digit in the right place, ○ = right digit in the wrong place.

// ---------- Settings ----------
// digits: length of the code. stars: most guesses allowed for 3, 2 and 1 code stars
// (the last number is also the most guesses you get).
// With repeated digits allowed, fewer digits is harder (fewer digits tested per guess),
// so the levels go 5, 4, 3.
const LEVELS = [
  { digits: 5, stars: [5, 7, 9] },
  { digits: 4, stars: [5, 7, 9] },
  { digits: 3, stars: [6, 8, 10] },
];
const NUM_LEVELS = LEVELS.length;
const TIME_LIMITS = [40, 80];                // seconds: one speed star is lost after each limit
const TIME_STARS_NEED_CODE_STAR = true;      // speed stars only count if the code was cracked in time
const STARS_PER_GAME = 3 + TIME_LIMITS.length;

// ---------- State ----------
let level = 0;
let secret = [];
let guesses = [];        // [{digits, hit, near}]
let entry = [];          // digits typed for the current guess
let solved = false, finished = false;
let revealRow = -1;     // the row that should flip (only right after a guess)
let levelResults = Array(NUM_LEVELS).fill(null);
let startTime = 0, endTime = 0, timerId = null;

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const startScreen = $('start-screen'), gameScreen = $('game-screen'), summaryScreen = $('summary-screen');
const levelEl = $('level-info'), statusEl = $('status'), resultEl = $('result');
const gridEl = $('grid'), keypadEl = $('keypad');
const newCodeBtn = $('newcode-btn'), nextBtn = $('next-btn'), summaryBtn = $('summary-btn');

const digits = () => LEVELS[level].digits;
const maxGuesses = () => LEVELS[level].stars[2];
const starText = (n, of) => '★'.repeat(n) + '☆'.repeat(of - n);
const totalStars = () => levelResults.reduce((a, b) => a + (b ? b.total : 0), 0);

// ---------- Padlock picture ----------
function drawLock(svgEl, open) {
  svgEl.innerHTML =
    `<path d="M32,${open ? 40 : 60} V38 a28,28 0 0 1 56,0 V${open ? 48 : 60}" fill="none" stroke="#a9b4c4" stroke-width="12"` +
    `${open ? ' transform="translate(0 -18)"' : ''}/>` +
    '<rect x="14" y="56" width="92" height="68" rx="12" fill="#d9a520"/>' +
    '<rect x="14" y="56" width="92" height="10" rx="5" fill="#e7bb45"/>' +
    '<circle cx="60" cy="86" r="10" fill="#5e452c"/><rect x="55" y="90" width="10" height="20" rx="3" fill="#5e452c"/>';
}

// ---------- Game flow ----------
function newRun() {
  levelResults = Array(NUM_LEVELS).fill(null);
  showScreen(gameScreen);
  newCode(0);
}

function newCode(lv) {
  level = lv;
  secret = Array.from({ length: digits() }, () => Math.floor(Math.random() * 10));   // digits may repeat
  guesses = []; entry = [];
  solved = false; finished = false;
  resultEl.innerHTML = '';
  $('instructions').innerHTML =
    `${digits()} digits (they can repeat) \u00b7 ${maxGuesses()} guesses<br>` +
    '<span class="key-line"><span class="mini t-correct">5</span> right place</span> ' +
    '<span class="key-line"><span class="mini t-present">5</span> wrong place</span> ' +
    '<span class="key-line"><span class="mini t-absent">5</span> not in code</span>';
  drawLock($('lock'), false);
  buildKeypad();
  showButtons();
  startTimer();
  render();
}

// Colour of each digit in a guess: 'correct' (orange) in the right place, otherwise 'present'
// (pink) whenever that digit is anywhere in the code, even if it is repeated; 'absent' (grey)
// only when the digit is not in the code at all.
const marks = guess => guess.map((d, i) => (secret[i] === d ? 'correct' : secret.includes(d) ? 'present' : 'absent'));

// Compare a guess with the secret
function score(guess) {
  const m = marks(guess);
  return { hit: m.filter(x => x === 'correct').length, near: m.filter(x => x === 'present').length };
}

// What the player knows about each digit so far (for the keypad colours)
function keyStates() {
  const rank = { absent: 1, present: 2, correct: 3 }, st = {};
  for (const g of guesses) marks(g.digits).forEach((m, i) => {
    const d = g.digits[i];
    if (!st[d] || rank[m] > rank[st[d]]) st[d] = m;
  });
  return st;
}

function press(key) {
  if (finished) return;
  if (key === 'del') entry.pop();
  else if (key === 'enter') return submitGuess();
  else if (entry.length < digits()) entry.push(key);
  render();
}

function submitGuess() {
  if (entry.length !== digits()) return;
  const { hit, near } = score(entry);
  guesses.push({ digits: entry.slice(), hit, near });
  entry = [];
  revealRow = guesses.length - 1;
  if (hit === digits()) { solved = true; finish(); }
  else if (guesses.length >= maxGuesses()) finish();
  render();
}

function finish() {
  finished = true;
  endTime = performance.now();
  stopTimer();
  const secs = seconds(), n = guesses.length, lim = LEVELS[level].stars;
  const codeStars = !solved ? 0 : n <= lim[0] ? 3 : n <= lim[1] ? 2 : 1;
  const timeStars = TIME_STARS_NEED_CODE_STAR && codeStars === 0 ? 0 : timeStarsFor(secs);
  const stars = codeStars + timeStars;

  const first = levelResults[level] === null;
  if (first) levelResults[level] = { code: codeStars, time: timeStars, total: stars, seconds: secs, guesses: solved ? n : null, digits: digits() };
  const kept = levelResults[level];

  const praise = !solved ? 'The lock stayed shut.' : ['', 'Cracked it!', 'Well cracked!', 'Brilliant!'][codeStars];
  let verdict = '';
  if (!first) verdict = `Practice code: your stars for this level stay at ${kept.total} of ${STARS_PER_GAME} from your first try.`;
  else if (level >= NUM_LEVELS - 1) verdict = `Run complete! You collected ${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME} stars.`;
  const speedNote = codeStars === 0 && TIME_STARS_NEED_CODE_STAR ? ' (needs a code star)' : '';

  if (solved) drawLock($('lock'), true);
  resultEl.innerHTML =
    `<div class="stars"><span>${starText(codeStars, 3)}</span><span class="time-stars">${starText(timeStars, TIME_LIMITS.length)}</span></div>` +
    `<div class="praise">${praise}</div>` +
    `<div class="breakdown">Code ${starText(codeStars, 3)} &nbsp;·&nbsp; Speed ${starText(timeStars, TIME_LIMITS.length)}${speedNote} &nbsp;·&nbsp; ${formatTime(secs)}</div>` +
    `<div>${solved ? `Cracked in ${n} guess${n === 1 ? '' : 'es'}` : 'Out of guesses'} &nbsp;|&nbsp; The code was <b class="secret">${secret.join(' ')}</b></div>` +
    `<div class="legend">3 stars: ${lim[0]} guesses or fewer · 2 stars: ${lim[1]} or fewer · 1 star: ${lim[2]} or fewer</div>` +
    (verdict ? `<div class="verdict">${verdict}</div>` : '');
  showButtons();
  document.querySelector('#game-screen .buttons').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showButtons() {
  const last = level >= NUM_LEVELS - 1;
  keypadEl.classList.toggle('hidden', finished);
  newCodeBtn.classList.toggle('hidden', !finished);
  nextBtn.classList.toggle('hidden', !finished || last);
  summaryBtn.classList.toggle('hidden', !finished || !last || !levelResults[level]);
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

// ---------- Drawing ----------
// A grid like a word game: one row per guess (all rows shown from the start),
// each digit coloured after the guess. The keypad is coloured the same way.
function render() {
  const n = digits(), rows = [];
  for (let r = 0; r < maxGuesses(); r++) {
    let cells;
    if (r < guesses.length) {
      const m = marks(guesses[r].digits);
      const flip = r === revealRow ? ' reveal' : '';
      cells = guesses[r].digits.map((d, i) => `<span class="tile t-${m[i]}${flip}" style="animation-delay:${i * 0.08}s">${d}</span>`);
    } else if (r === guesses.length && !finished) {
      cells = Array.from({ length: n }, (_, i) => `<span class="tile typing ${i === entry.length ? 'cursor' : ''}">${entry[i] ?? ''}</span>`);
    } else {
      cells = Array.from({ length: n }, () => '<span class="tile empty"></span>');
    }
    rows.push(`<div class="tile-row">${cells.join('')}</div>`);
  }
  gridEl.style.setProperty('--n', n);
  gridEl.style.setProperty('--rows', maxGuesses());
  gridEl.innerHTML = rows.join('');
  revealRow = -1;

  const st = keyStates();
  keypadEl.querySelectorAll('[data-key]').forEach(b => {
    const k = b.dataset.key;
    if (k === 'enter') b.disabled = entry.length !== n;
    else if (k === 'del') b.disabled = entry.length === 0;
    else {
      b.disabled = entry.length >= n;
      b.classList.remove('t-correct', 't-present', 't-absent');
      if (st[k]) b.classList.add('t-' + st[k]);
    }
  });

  levelEl.textContent = `Level ${level + 1} of ${NUM_LEVELS} \u00b7 \u2605 ${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME}`;
  showStatus();
}

function showStatus() {
  const s = seconds();
  const text = `Guess ${Math.min(guesses.length + (finished ? 0 : 1), maxGuesses())} of ${maxGuesses()} \u00b7 Time ${formatTime(s)} \u00b7 Speed ${starText(timeStarsFor(s), TIME_LIMITS.length)}`;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

function buildKeypad() {
  keypadEl.innerHTML = '';
  for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    const b = document.createElement('button');
    b.className = 'padkey'; b.textContent = k; b.dataset.key = k;
    b.addEventListener('click', () => press(k));
    keypadEl.appendChild(b);
  }
  const del = document.createElement('button');
  del.className = 'padkey wide'; del.textContent = '\u232b Delete'; del.dataset.key = 'del';
  del.addEventListener('click', () => press('del'));
  const ok = document.createElement('button');
  ok.className = 'padkey wide primary'; ok.textContent = 'Try code'; ok.dataset.key = 'enter';
  ok.addEventListener('click', () => press('enter'));
  keypadEl.append(del, ok);
}

// ---------- Run summary ----------
function showSummary() {
  const rows = levelResults.map((r, k) => r
    ? `<tr><td>${k + 1}</td><td>${r.digits}</td><td>${r.guesses ?? '–'}</td><td class="st">${starText(r.code, 3)}</td><td class="st time-stars">${starText(r.time, TIME_LIMITS.length)}</td><td>${formatTime(r.seconds)}</td><td><b>${r.total}</b></td></tr>`
    : `<tr><td>${k + 1}</td><td>${LEVELS[k].digits}</td><td colspan="5">not played</td></tr>`).join('');
  $('summary-total').textContent = `${totalStars()} of ${NUM_LEVELS * STARS_PER_GAME} stars`;
  $('summary-table').innerHTML = '<tr><th>Level</th><th>Digits</th><th>Guesses</th><th>Code</th><th>Speed</th><th>Time</th><th>Stars</th></tr>' + rows;
  showScreen(summaryScreen);
}

// ---------- Buttons and keyboard ----------
$('start-btn').addEventListener('click', newRun);
newCodeBtn.addEventListener('click', () => newCode(level));
nextBtn.addEventListener('click', () => newCode(level + 1));
summaryBtn.addEventListener('click', showSummary);
$('again-btn').addEventListener('click', newRun);
$('home-btn').addEventListener('click', () => { location.href = 'index.html'; });
$('back-btn').addEventListener('click', () => { stopTimer(); location.href = 'index.html'; });
document.addEventListener('keydown', e => {
  if (gameScreen.classList.contains('hidden')) return;
  if (/^[0-9]$/.test(e.key)) press(Number(e.key));
  else if (e.key === 'Backspace') press('del');
  else if (e.key === 'Enter') { e.preventDefault(); press('enter'); }
});

drawLock($('lock-hero'), false);

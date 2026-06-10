'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');

// Start screen
const startOverlay = document.getElementById('start-overlay');
const startLevelSelect = document.getElementById('start-level-select');
const playBtn = document.getElementById('play-btn');

// Pause / game-over overlay
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const pauseActions = document.getElementById('pause-actions');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseLevelInfo = document.getElementById('pause-level-info');
const controlsPanel = document.getElementById('controls-panel');
const controlsBackBtn = document.getElementById('controls-back-btn');
const gameoverActions = document.getElementById('gameover-actions');
const gameoverRestartBtn = document.getElementById('gameover-restart-btn');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const nameEntrySection = document.getElementById('name-entry-section');
const saveMessage = document.getElementById('save-message');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const RECORDS_KEY = 'tetris_records';
const MAX_RECORDS = 5;

// Game states: 'menu' | 'playing' | 'paused' | 'over'
let gameState = 'menu';

let board, current, next, score, lines, level, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, maxLinesCleared, scoreSubmitted;

// ---- localStorage helpers ----
function getSavedLevel() {
  const val = parseInt(localStorage.getItem('tetris_start_level'), 10);
  return (val >= 1 && val <= 15) ? val : 1;
}

function saveLevel(val) {
  localStorage.setItem('tetris_start_level', String(val));
}

// ---- Populate start-level selector ----
(function buildLevelSelect() {
  const saved = getSavedLevel();
  for (let i = 1; i <= 15; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    if (i === saved) opt.selected = true;
    startLevelSelect.appendChild(opt);
  }
})();

// ---- Records helpers ----

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function qualifiesForRecords(s) {
  const records = loadRecords();
  if (records.length < MAX_RECORDS) return true;
  return s > records[records.length - 1].score;
}

function insertRecord(entry) {
  const records = loadRecords();
  records.push(entry);
  records.sort((a, b) => b.score - a.score);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
  saveRecords(records);
  return records.findIndex(r => r === entry || (r.name === entry.name && r.score === entry.score && r.combo === entry.combo && r.lines === entry.lines));
}

function renderRecordsTable(tableEl, highlightIndex) {
  const records = loadRecords();
  tableEl.innerHTML = '';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Combo</th><th>Líneas</th></tr>';
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (records.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="records-empty">Sin récords aún</td>';
    tbody.appendChild(tr);
  } else {
    records.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (i === highlightIndex) tr.classList.add('records-highlight');
      tr.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(r.name)}</td><td>${r.score.toLocaleString()}</td><td>${r.combo}</td><td>${r.lines}</td>`;
      tbody.appendChild(tr);
    });
  }
  tableEl.appendChild(tbody);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function refreshAllRecordsTables(highlightIndex) {
  document.querySelectorAll('.records-table').forEach(t => {
    renderRecordsTable(t, highlightIndex);
  });
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    // combo tracking: consecutive locks that each clear >= 1 line
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (cleared > maxLinesCleared) maxLinesCleared = cleared;
    updateHUD();
  } else {
    // lock with no clear resets combo streak
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameState = 'over';
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pauseActions.classList.add('hidden');
  controlsPanel.classList.add('hidden');
  gameoverActions.classList.remove('hidden');

  // Reset name entry UI
  scoreSubmitted = false;
  nameInput.value = '';
  saveMessage.textContent = '';
  saveMessage.className = 'save-message';
  nameEntrySection.classList.remove('hidden');

  // Render the game-over records table (no highlight yet)
  const gameOverTable = document.getElementById('records-table-gameover');
  renderRecordsTable(gameOverTable, -1);
  overlay.classList.remove('hidden');
  nameInput.focus();
}

function submitScore() {
  if (scoreSubmitted) return;
  scoreSubmitted = true;
  const name = nameInput.value.trim() || 'Anónimo';
  nameEntrySection.classList.add('hidden');

  if (qualifiesForRecords(score)) {
    const entry = { name, score, combo: maxCombo, lines: maxLinesCleared };
    const idx = insertRecord(entry);
    refreshAllRecordsTables(idx);
    saveMessage.textContent = `¡Nuevo récord! Posición #${idx + 1}`;
    saveMessage.className = 'save-message save-message--success';
  } else {
    refreshAllRecordsTables(-1);
    saveMessage.textContent = 'Buen juego, pero no llegaste al top 5.';
    saveMessage.className = 'save-message save-message--neutral';
  }
}

function showPauseMenu() {
  overlayTitle.textContent = 'PAUSA';
  overlayScore.textContent = '';
  const startLevel = getSavedLevel();
  pauseLevelInfo.textContent = `Nivel inicial: ${startLevel}`;
  controlsPanel.classList.add('hidden');
  pauseActions.classList.remove('hidden');
  gameoverActions.classList.add('hidden');
  overlay.classList.remove('hidden');
}

function hidePauseMenu() {
  overlay.classList.add('hidden');
}

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    cancelAnimationFrame(animId);
    showPauseMenu();
  } else if (gameState === 'paused') {
    gameState = 'playing';
    hidePauseMenu();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameState === 'playing') {
    animId = requestAnimationFrame(loop);
  }
}

function init() {
  const startLevel = getSavedLevel();
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  combo = 0;
  maxCombo = 0;
  maxLinesCleared = 0;
  scoreSubmitted = false;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  // Hide all overlays
  overlay.classList.add('hidden');
  startOverlay.classList.add('hidden');
  gameState = 'playing';
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Show start screen on load ----
function showStartScreen() {
  gameState = 'menu';
  const startTable = document.getElementById('records-table-start');
  renderRecordsTable(startTable, -1);
  startOverlay.classList.remove('hidden');
}

// ---- Button event listeners ----

playBtn.addEventListener('click', () => {
  const chosen = parseInt(startLevelSelect.value, 10);
  saveLevel(chosen);
  init();
});

resumeBtn.addEventListener('click', () => {
  togglePause();
});

restartBtn.addEventListener('click', () => {
  init();
});

gameoverRestartBtn.addEventListener('click', () => {
  init();
});

controlsBtn.addEventListener('click', () => {
  pauseActions.classList.add('hidden');
  controlsPanel.classList.remove('hidden');
});

controlsBackBtn.addEventListener('click', () => {
  controlsPanel.classList.add('hidden');
  pauseActions.classList.remove('hidden');
});

// ---- Keyboard handler ----
document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (gameState === 'playing' || gameState === 'paused') {
      togglePause();
    }
    return;
  }

  if (gameState !== 'playing') return;


  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

saveScoreBtn.addEventListener('click', submitScore);

nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') {
    e.preventDefault();
    submitScore();
  }
});

resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(RECORDS_KEY);
  refreshAllRecordsTables(-1);
});

// ---- Initial load ----
showStartScreen();

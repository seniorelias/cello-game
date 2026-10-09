// Cello Tiles: cuatro carriles = cuatro cuerdas. Se dibuja todo en un canvas de baja
// resolución y se escala con píxeles nítidos para el look pixel art.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const low = document.createElement('canvas');
  const g = low.getContext('2d');
  const bgCanvas = document.createElement('canvas');

  const ui = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    hint: document.getElementById('hint'),
    title: document.getElementById('title'),
    over: document.getElementById('over'),
    overTitle: document.getElementById('overTitle'),
    finalScore: document.getElementById('finalScore'),
    bests: document.querySelectorAll('.bestValue'),
  };

  const LANES = CELLO_STRINGS.length;
  const ROWS_ON_SCREEN = 4;
  const START_SPEED = 2.3; // filas por segundo
  const MAX_SPEED = 6.5;
  const SPEEDUP = 0.035;

  const COLORS = {
    board: '#2e211d',
    boardLine: '#3d2c26',
    wood: '#7a4a2c',
    woodDark: '#5e371f',
    woodLight: '#93603a',
    stringCol: '#e6d6b0',
    stringShadow: '#1c1310',
    ink: '#3b2a24',
    cream: '#f6e7c8',
    fail: '#d9665b',
  };

  // Sprites de 1 bit ('X' = píxel).
  const SPRITES = {
    note: ['...XX.', '...X.X', '...X..', '...X..', '.XXX..', 'XXXX..', '.XX...'],
    play: ['X...', 'XX..', 'XXX.', 'XXXX', 'XXX.', 'XX..', 'X...'],
    heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    C: ['XXX', 'X..', 'X..', 'X..', 'XXX'],
    G: ['XXX', 'X..', 'X.X', 'X.X', 'XXX'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  };

  let dpr = 1, S = 2, W = 0, H = 0;
  let boardX = 0, boardW = 0, laneW = 0, rowH = 0;

  let state = 'title'; // title | ready | playing | ending | over
  let rows = [];
  let source = null;
  let sourceDone = false;
  let pos = 0; // cuántas filas se desplazó el tablero
  let speed = START_SPEED;
  let nextRow = 0;
  let score = 0;
  let best = loadBest();
  let fail = null; // { row, lane, t }
  let won = false;
  let particles = [];
  let motes = [];
  let vib = new Array(LANES).fill(0);
  let time = 0;

  function loadBest() {
    try { return Number(localStorage.getItem('cello-tiles-best')) || 0; } catch (e) { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem('cello-tiles-best', String(best)); } catch (e) { /* sin almacenamiento */ }
  }
  function showBest() {
    ui.bests.forEach(el => { el.textContent = best; });
  }

  // ---------- Tamaño y fondo ----------

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.round(window.innerWidth * dpr);
    const ch = Math.round(window.innerHeight * dpr);
    canvas.width = cw;
    canvas.height = ch;
    S = Math.max(2, Math.round(ch / 260));
    W = Math.ceil(cw / S);
    H = Math.ceil(ch / S);
    low.width = W;
    low.height = H;

    laneW = Math.floor(Math.min(W, H * 0.62) / LANES);
    boardW = laneW * LANES;
    boardX = Math.floor((W - boardW) / 2);
    rowH = H / ROWS_ON_SCREEN;

    buildBackground();
    if (motes.length === 0) {
      for (let i = 0; i < 26; i++) motes.push(newMote(true));
    }
  }

  // Ruido determinista para que la veta de la madera no cambie entre cuadros.
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function buildBackground() {
    bgCanvas.width = W;
    bgCanvas.height = H;
    const b = bgCanvas.getContext('2d');

    // Madera del cuerpo del cello, con veta.
    b.fillStyle = COLORS.wood;
    b.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const grain = Math.sin(x * 0.45 + Math.sin(y * 0.03 + x * 0.05) * 2.2 + hash(x >> 3, y >> 4) * 1.5);
        const n = hash(x, y);
        if (grain > 0.82 || n > 0.985) {
          b.fillStyle = COLORS.woodDark;
          b.fillRect(x, y, 1, 1);
        } else if (grain < -0.9 && n > 0.5) {
          b.fillStyle = COLORS.woodLight;
          b.fillRect(x, y, 1, 1);
        }
      }
    }

    // Efes del cello a los costados si hay lugar (iPad o pantallas anchas).
    const side = boardX;
    if (side > 24) {
      drawFHole(b, Math.floor(side / 2), Math.floor(H * 0.55), H * 0.28, 1);
      drawFHole(b, Math.floor(boardX + boardW + side / 2), Math.floor(H * 0.55), H * 0.28, -1);
    }

    // Diapasón (ébano) con borde.
    b.fillStyle = '#1c1310';
    b.fillRect(boardX - 2, 0, boardW + 4, H);
    b.fillStyle = COLORS.board;
    b.fillRect(boardX, 0, boardW, H);
    for (let y = 0; y < H; y++) {
      for (let x = boardX; x < boardX + boardW; x++) {
        if (hash(x + 999, y) > 0.97) {
          b.fillStyle = '#35261f';
          b.fillRect(x, y, 1, 1);
        }
      }
    }
    b.fillStyle = COLORS.boardLine;
    for (let i = 1; i < LANES; i++) {
      for (let y = 0; y < H; y += 4) b.fillRect(boardX + i * laneW, y, 1, 2);
    }

    // Luz cálida de lámpara arriba y viñeta.
    const glow = b.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 0.9);
    glow.addColorStop(0, 'rgba(255, 200, 120, 0.22)');
    glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
    b.fillStyle = glow;
    b.fillRect(0, 0, W, H);
    const vig = b.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    vig.addColorStop(0, 'rgba(20, 10, 5, 0)');
    vig.addColorStop(1, 'rgba(20, 10, 5, 0.45)');
    b.fillStyle = vig;
    b.fillRect(0, 0, W, H);
  }

  function drawFHole(b, cx, cy, h, dir) {
    b.fillStyle = '#1c1310';
    const half = h / 2;
    for (let i = -half; i <= half; i++) {
      const tt = i / half;
      const x = cx + Math.sin(tt * Math.PI) * h * 0.08 * dir;
      const thick = Math.abs(tt) < 0.15 ? 3 : 2;
      b.fillRect(Math.round(x), Math.round(cy + i), thick, 1);
    }
    // Circulitos de las puntas y muescas del medio.
    [[-half, -1], [half, 1]].forEach(([dy]) => {
      b.fillRect(Math.round(cx - 2), Math.round(cy + dy - 2), 5, 4);
    });
    b.fillRect(Math.round(cx - 3), Math.round(cy), 3, 1);
    b.fillRect(Math.round(cx + 2), Math.round(cy), 3, 1);
  }

  // ---------- Partida ----------

  function newGame(noteSource) {
    source = noteSource || randomNoteSource();
    sourceDone = false;
    rows = [];
    pos = 0;
    speed = START_SPEED;
    nextRow = 0;
    score = 0;
    fail = null;
    won = false;
    particles = [];
    ensureRows();
    state = 'ready';
    ui.score.textContent = '0';
    ui.hud.classList.remove('hidden');
    ui.hint.classList.remove('hidden');
    ui.title.classList.add('hidden');
    ui.over.classList.add('hidden');
  }

  function ensureRows() {
    while (!sourceDone && rows.length < Math.max(Math.floor(pos), nextRow) + ROWS_ON_SCREEN + 3) {
      const n = source.next();
      if (!n) { sourceDone = true; break; }
      rows.push({ lane: n.lane, pitch: n.pitch, beats: n.beats, tapped: false, tapT: 0 });
    }
  }

  function rowBottomY(i) {
    return H - (i - pos) * rowH;
  }

  function hit(row) {
    row.tapped = true;
    row.tapT = time;
    nextRow++;
    score++;
    ensureRows();
    ui.score.textContent = String(score);
    vib[row.lane] = 1.6;
    const rowSec = 1 / speed;
    CelloAudio.playNote(noteToFreq(row.pitch), Math.max(0.35, Math.min(1.2, row.beats * rowSec * 1.4)));
    spawnBurst(row);

    if (state === 'ready') {
      state = 'playing';
      ui.hint.classList.add('hidden');
    }
    if (sourceDone && nextRow >= rows.length) {
      won = true;
      endGame();
    }
  }

  function spawnBurst(row) {
    const cx = boardX + row.lane * laneW + laneW / 2;
    const cy = rowBottomY(rows.indexOf(row)) - rowH / 2;
    const col = CELLO_STRINGS[row.lane];
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 20 + Math.random() * 40;
      particles.push({
        x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20,
        life: 0.5 + Math.random() * 0.3, age: 0,
        color: Math.random() < 0.5 ? col.light : COLORS.cream, size: Math.random() < 0.3 ? 2 : 1,
      });
    }
    particles.push({
      x: cx - 3, y: cy - 4, vx: (Math.random() - 0.5) * 10, vy: -28,
      life: 0.9, age: 0, sprite: Math.random() < 0.2 ? 'heart' : 'note', color: col.light,
    });
  }

  function lose(row, lane) {
    if (state !== 'playing' && state !== 'ready') return;
    fail = { row, lane, t: time };
    state = 'ending';
    CelloAudio.playFail();
    if (navigator.vibrate) navigator.vibrate(120);
    setTimeout(endGame, 1100);
  }

  function endGame() {
    state = 'over';
    if (score > best) { best = score; saveBest(); }
    showBest();
    ui.overTitle.textContent = won ? '¡Bravo!' : '¡Ups!';
    ui.finalScore.textContent = String(score);
    ui.hint.classList.add('hidden');
    ui.over.classList.remove('hidden');
  }

  function showMenu() {
    state = 'title';
    showBest();
    ui.over.classList.add('hidden');
    ui.hud.classList.add('hidden');
    ui.title.classList.remove('hidden');
  }

  // ---------- Entrada ----------

  function tapAt(lowX, lowY) {
    if (state !== 'ready' && state !== 'playing') return;
    const lane = Math.floor((lowX - boardX) / laneW);
    if (lane < 0 || lane >= LANES) return;
    const target = rows[nextRow];
    if (!target || nextRow - pos >= ROWS_ON_SCREEN) return; // la nota todavía no se ve
    // Generoso: basta con tocar la cuerda correcta, a cualquier altura.
    if (target.lane === lane) {
      hit(target);
      return;
    }
    const rowIdx = Math.floor(pos + (H - lowY) / rowH);
    if (rowIdx < nextRow) return; // toques sobre filas ya tocadas se ignoran
    if (state === 'playing' || rowIdx === nextRow) lose(rowIdx, lane);
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    CelloAudio.unlock();
    tapAt(e.clientX * dpr / S, e.clientY * dpr / S);
  });

  const KEYS = { d: 0, f: 1, j: 2, k: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
  window.addEventListener('keydown', e => {
    const lane = KEYS[e.key.toLowerCase()];
    if (lane === undefined || e.repeat) return;
    CelloAudio.unlock();
    if (state !== 'ready' && state !== 'playing') return;
    const target = rows[nextRow];
    if (target && target.lane === lane) hit(target);
    else if (target) lose(nextRow, lane);
  });

  document.getElementById('play').addEventListener('click', () => { CelloAudio.unlock(); newGame(); });
  document.getElementById('again').addEventListener('click', () => { CelloAudio.unlock(); newGame(); });
  document.getElementById('menu').addEventListener('click', showMenu);
  document.addEventListener('gesturestart', e => e.preventDefault());

  // ---------- Bucle ----------

  function update(dt) {
    time += dt;

    if (state === 'playing') {
      speed = Math.min(MAX_SPEED, START_SPEED + score * SPEEDUP);
      pos += speed * dt;
      ensureRows();
      // Si la nota pendiente salió por abajo, se perdió.
      if (rows[nextRow] && pos > nextRow + 0.02) {
        lose(nextRow, rows[nextRow].lane);
      }
    } else if (state === 'ending' && fail) {
      // Retrocede un poco para mostrar la nota que falló.
      const target = Math.min(pos, fail.row - 0.6);
      pos += (target - pos) * Math.min(1, dt * 8);
    }

    for (let i = 0; i < LANES; i++) vib[i] *= Math.pow(0.02, dt);

    particles = particles.filter(p => {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      return p.age < p.life;
    });

    motes.forEach((m, i) => {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -2 || m.x < -2 || m.x > W + 2) motes[i] = newMote(false);
    });
  }

  function newMote(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 2,
      vx: (Math.random() - 0.5) * 3,
      vy: -2 - Math.random() * 4,
      phase: Math.random() * 10,
    };
  }

  function drawSprite(name, x, y, color, scale = 1) {
    const rowsData = SPRITES[name];
    g.fillStyle = color;
    for (let r = 0; r < rowsData.length; r++) {
      for (let c = 0; c < rowsData[r].length; c++) {
        if (rowsData[r][c] === 'X') g.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
      }
    }
  }

  function drawStrings() {
    for (let i = 0; i < LANES; i++) {
      const s = CELLO_STRINGS[i];
      const cx = Math.round(boardX + i * laneW + laneW / 2 - s.width / 2);
      const amp = vib[i];
      for (let y = 0; y < H; y += 2) {
        const off = amp > 0.05 ? Math.round(Math.sin(y * 0.12 + time * 70) * amp * Math.sin((y / H) * Math.PI)) : 0;
        g.fillStyle = COLORS.stringShadow;
        g.fillRect(cx + off + 1, y + 1, s.width, 2);
        g.fillStyle = COLORS.stringCol;
        g.fillRect(cx + off, y, s.width, 2);
      }
    }
  }

  function drawTile(x, y, w, h, col, flash) {
    g.fillStyle = COLORS.stringShadow;
    g.fillRect(x + 1, y, w - 2, h);
    g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle = col.dark;
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = flash ? COLORS.cream : col.color;
    g.fillRect(x + 1, y + 1, w - 2, h - 4);
    g.fillStyle = col.light;
    g.fillRect(x + 2, y + 2, w - 5, 1);
    g.fillRect(x + 2, y + 2, 1, h - 7);
  }

  function drawRows() {
    const first = Math.max(0, Math.floor(pos) - 1);
    const last = Math.min(rows.length - 1, Math.floor(pos) + ROWS_ON_SCREEN + 1);
    const pad = laneW >= 30 ? 3 : 2;
    const sc = laneW >= 48 ? 3 : laneW >= 24 ? 2 : 1;

    for (let i = first; i <= last; i++) {
      const row = rows[i];
      const bottom = Math.round(rowBottomY(i));
      const top = Math.round(rowBottomY(i + 1));
      if (bottom < 0 || top > H) continue;
      const x = boardX + row.lane * laneW + pad;
      const w = laneW - pad * 2;
      const y = top + 1;
      const h = bottom - top - 2;
      const col = CELLO_STRINGS[row.lane];

      if (row.tapped) {
        // Nota ya tocada: queda como una sombra suave del color de la cuerda.
        const since = time - row.tapT;
        g.globalAlpha = 0.28;
        g.fillStyle = col.color;
        g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.globalAlpha = 1;
        if (since < 0.08) drawTile(x, y, w, h, col, true);
        continue;
      }

      drawTile(x, y, w, h, col, false);
      const sw = 6 * sc, sh = 7 * sc;
      const sx = x + Math.floor((w - sw) / 2);
      const sy = y + Math.floor((h - 3 - sh) / 2);
      if (state === 'ready' && i === nextRow) drawSprite('play', x + Math.floor((w - 4 * sc) / 2), sy, col.dark, sc);
      else drawSprite('note', sx, sy, col.dark, sc);
    }

    // Celda del error, parpadeando.
    if (fail && Math.floor((time - fail.t) * 6) % 2 === 0) {
      const bottom = Math.round(rowBottomY(fail.row));
      const top = Math.round(rowBottomY(fail.row + 1));
      g.fillStyle = COLORS.fail;
      g.fillRect(boardX + fail.lane * laneW + 1, top + 1, laneW - 2, bottom - top - 2);
    }
  }

  function drawLaneLabels() {
    const sc = laneW >= 40 ? 2 : 1;
    for (let i = 0; i < LANES; i++) {
      const s = CELLO_STRINGS[i];
      const x = boardX + i * laneW + Math.floor((laneW - 3 * sc) / 2);
      const y = H - 9 * sc;
      // Plaquita oscura detrás de la letra para que se lea sobre la cuerda.
      g.fillStyle = COLORS.stringShadow;
      g.fillRect(x - 2 * sc, y - 2 * sc, 7 * sc, 9 * sc);
      g.fillStyle = COLORS.board;
      g.fillRect(x - sc, y - sc, 5 * sc, 7 * sc);
      drawSprite(s.name, x, y, s.light, sc);
    }
  }

  function drawParticles() {
    particles.forEach(p => {
      g.globalAlpha = Math.max(0, 1 - p.age / p.life);
      if (p.sprite) drawSprite(p.sprite, p.x, p.y, p.color, 1);
      else {
        g.fillStyle = p.color;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    });
    g.globalAlpha = 1;
  }

  function drawMotes() {
    motes.forEach(m => {
      const a = 0.25 + 0.25 * Math.sin(time * 2 + m.phase);
      g.fillStyle = `rgba(255, 220, 160, ${a.toFixed(2)})`;
      g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    });
  }

  function render() {
    g.imageSmoothingEnabled = false;
    g.drawImage(bgCanvas, 0, 0);
    drawStrings();
    if (state !== 'title') drawRows();
    drawLaneLabels();
    drawParticles();
    drawMotes();

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, W * S, H * S);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  showBest();
  requestAnimationFrame(frame);

  // Para pruebas y para el futuro menú de canciones.
  window.CelloTiles = {
    newGame, songNoteSource, SONGS,
    peek: () => ({ state, score, lane: rows[nextRow] ? rows[nextRow].lane : null }),
  };
})();

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
    board: '#1a1311',
    boardLine: '#2c211d',
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

    // Tamaño del cello: en el celu el cuerpo casi toca los bordes; en el iPad entra entero.
    const ref = Math.min(W * 1.15, H * 0.6);
    laneW = Math.floor(Math.min(W * 0.66, ref * 0.55) / LANES);
    boardW = laneW * LANES;
    boardX = Math.floor((W - boardW) / 2);
    rowH = H / ROWS_ON_SCREEN;

    const len = ref * 1.75;
    const top = Math.round(H * 0.56 - 0.45 * len);
    cello = {
      // Ancho del cuerpo: hasta donde terminaba la franja de sombra exterior del diseño anterior.
      ref: Math.min(ref * 2, W * 1.18) * 0.88, len, top,
      cx: boardX + boardW / 2,
      fingerboardEnd: Math.round(top + 0.30 * len),
      bridgeY: Math.round(top + 0.56 * len),
      tailTop: Math.round(top + 0.66 * len),
    };

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

  // Silueta del cuerpo: [posición de arriba a abajo (0-1), medio ancho relativo].
  // Hombros, bout superior, cintura en C, bout inferior. Se une con una curva suave.
  let cello = null;
  const OUTLINE = [
    [0, 0.08], [0.015, 0.24], [0.05, 0.36], [0.12, 0.415], [0.19, 0.42], [0.27, 0.39],
    [0.34, 0.335], [0.44, 0.3], [0.53, 0.33], [0.62, 0.43], [0.74, 0.51], [0.84, 0.525],
    [0.93, 0.48], [0.98, 0.36], [1, 0.15],
  ];
  const OUTLINE_SLOPES = OUTLINE.map((p, i) => {
    const a = OUTLINE[Math.max(0, i - 1)];
    const b = OUTLINE[Math.min(OUTLINE.length - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });

  function bodyHalfWidth(y) {
    const t = (y - cello.top) / cello.len;
    if (t < 0 || t > 1) return 0;
    for (let i = 1; i < OUTLINE.length; i++) {
      const [t1, f1] = OUTLINE[i];
      if (t <= t1) {
        // Interpolación de Hermite: curva continua, sin mesetas entre puntos.
        const [t0, f0] = OUTLINE[i - 1];
        const dt = t1 - t0;
        const u = (t - t0) / dt;
        const u2 = u * u, u3 = u2 * u;
        const f = (2 * u3 - 3 * u2 + 1) * f0 + (u3 - 2 * u2 + u) * dt * OUTLINE_SLOPES[i - 1]
          + (-2 * u3 + 3 * u2) * f1 + (u3 - u2) * dt * OUTLINE_SLOPES[i];
        return f * cello.ref;
      }
    }
    return 0;
  }

  function buildBackground() {
    bgCanvas.width = W;
    bgCanvas.height = H;
    const b = bgCanvas.getContext('2d');
    const { cx, fingerboardEnd, bridgeY, tailTop } = cello;

    // Pared de la habitación: papel rayado verde azulado, para que el cello resalte.
    b.fillStyle = '#1d2a29';
    b.fillRect(0, 0, W, H);
    b.fillStyle = '#223231';
    for (let x = 0; x < W; x += 10) b.fillRect(x, 0, 2, H);
    b.fillStyle = '#2b3d3b';
    for (let y = 3; y < H; y += 8) {
      for (let x = 6 + ((y >> 3) % 2) * 5; x < W; x += 10) b.fillRect(x, y, 1, 1);
    }

    // Cuerpo del cello: máscara simétrica y distancia al borde para un contorno limpio.
    const MH = H + 8; // un poco más abajo de la pantalla para que no aparezca un borde falso
    const dist = new Uint16Array(W * MH);
    const halves = [];
    for (let y = 0; y < MH; y++) {
      const half = bodyHalfWidth(y);
      halves.push(half);
      for (let x = 0; x < W; x++) {
        if (Math.abs(x + 0.5 - cx) < half) dist[y * W + x] = 999;
      }
    }
    // Distancia en "pasos" (4 vecinos), dos pasadas.
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!dist[i]) continue;
        const up = y > 0 ? dist[i - W] : 0;
        const left = x > 0 ? dist[i - 1] : 0;
        dist[i] = Math.min(dist[i], up + 1, left + 1);
      }
    }
    for (let y = MH - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (!dist[i]) continue;
        const down = y < MH - 1 ? dist[i + W] : 999;
        const right = x < W - 1 ? dist[i + 1] : 0;
        dist[i] = Math.min(dist[i], down + 1, right + 1);
      }
    }
    for (let y = 0; y < H; y++) {
      const half = halves[y];
      const t = (y - cello.top) / cello.len;
      for (let x = 0; x < W; x++) {
        const d = dist[y * W + x];
        if (!d) continue;
        let col;
        if (d === 1) col = '#2a140b';           // borde
        else if (d === 2) col = '#e0a462';      // filo iluminado
        else if (d === 4) col = '#4a2210';      // fileteado
        else {
          const r = Math.abs(x + 0.5 - cx) / half;
          const light = 1 - r * r * 0.7 - Math.abs(t - 0.5) * 0.25 - (d < 8 ? 0.12 : 0);
          col = light > 0.8 ? '#c7783c' : light > 0.6 ? '#b0622f' : light > 0.42 ? '#954e25' : '#7a3c1c';
          // Veta recta del abeto, simétrica.
          const mx = Math.floor(Math.abs(x + 0.5 - cx));
          if (d > 5 && Math.sin(mx * 1.7 + hash(mx >> 2, y >> 5) * 2.5) > 0.93 && hash(mx, y) > 0.25) col = '#8a4521';
        }
        b.fillStyle = col;
        b.fillRect(x, y, 1, 1);
      }
    }

    // Efes a los costados del puente, una espejo de la otra.
    const fh = Math.round(cello.len * 0.17);
    const fx = Math.round(boardW / 2 + 4);
    const fy = bridgeY + Math.round(fh * 0.1);
    drawFHoles(b, cx, fx, fy, fh);

    // Cordal (tailpiece) de ébano con afinadores finos.
    const tailLen = Math.round(cello.len * 0.26);
    for (let y = tailTop; y < Math.min(H, tailTop + tailLen); y++) {
      const u = (y - tailTop) / tailLen;
      // Medio ancho entero y simétrico; esquinas de arriba redondeadas.
      const halfTw = Math.round(boardW * (0.25 - 0.11 * u)) - (y === tailTop ? 2 : y === tailTop + 1 ? 1 : 0);
      b.fillStyle = '#1c1310';
      b.fillRect(cx - halfTw, y, halfTw * 2, 1);
      if (y > tailTop + 1) {
        b.fillStyle = '#3a2a24';
        b.fillRect(cx - halfTw + 2, y, 1, 1);
      }
    }
    b.fillStyle = '#cfc6b4';
    for (let i = 0; i < LANES; i++) b.fillRect(Math.round(tailSlotX(i)) - 1, tailTop + 3, 2, 2);

    // Puente de arce claro con contorno oscuro, arqueado arriba.
    const bw = boardW + 6;
    const bx = Math.round(cx - bw / 2);
    b.fillStyle = 'rgba(30, 12, 4, 0.5)';
    b.fillRect(bx + 1, bridgeY + 3, bw, 4);
    b.fillStyle = '#2a140b';
    b.fillRect(bx + 2, bridgeY - 2, bw - 4, 1);
    b.fillRect(bx, bridgeY - 1, bw, 6);
    b.fillRect(bx + 2, bridgeY + 5, 6, 2);
    b.fillRect(bx + bw - 8, bridgeY + 5, 6, 2);
    b.fillStyle = '#f6e3b8';
    b.fillRect(bx + 3, bridgeY - 1, bw - 6, 1);
    b.fillRect(bx + 1, bridgeY, bw - 2, 2);
    b.fillStyle = '#dcbb7e';
    b.fillRect(bx + 1, bridgeY + 2, bw - 2, 2);
    b.fillRect(bx + 3, bridgeY + 4, 4, 2);
    b.fillRect(bx + bw - 7, bridgeY + 4, 4, 2);

    // Mástil de madera barnizada asomando a los costados del diapasón, arriba del cuerpo.
    const neckBottom = cello.top + 4;
    for (let y = 0; y < neckBottom; y++) {
      const taper = Math.round((1 - y / fingerboardEnd) * boardW * 0.07);
      const nx = boardX - 5 + taper;
      const nw = boardW + 10 - taper * 2;
      b.fillStyle = '#2a140b';
      b.fillRect(nx, y, nw, 1);
      b.fillStyle = '#9a4f26';
      b.fillRect(nx + 1, y, nw - 2, 1);
      b.fillStyle = '#c7783c';
      b.fillRect(nx + 2, y, 1, 1);
    }

    // Diapasón de ébano, con sombra sobre la tapa y el final redondeado.
    b.fillStyle = 'rgba(30, 12, 4, 0.5)';
    b.fillRect(boardX - 1, fingerboardEnd, boardW + 4, 3);
    b.fillRect(boardX + boardW + 2, cello.top + Math.round(boardW * 0.07 * cello.top / fingerboardEnd), 2, fingerboardEnd - cello.top);
    for (let y = 0; y < fingerboardEnd; y++) {
      // Se angosta hacia arriba, como un diapasón real.
      const taper = Math.round((1 - y / fingerboardEnd) * boardW * 0.07);
      const inset = taper + (y >= fingerboardEnd - 2 ? (y === fingerboardEnd - 1 ? 3 : 1) : 0);
      b.fillStyle = '#1c1310';
      b.fillRect(boardX - 2 + inset, y, boardW + 4 - inset * 2, 1);
      if (y < fingerboardEnd - 1) {
        b.fillStyle = COLORS.board;
        b.fillRect(boardX + inset, y, boardW - inset * 2, 1);
        b.fillStyle = '#4a3a33'; // brillo en el canto
        b.fillRect(boardX - 1 + inset, y, 1, 1);
      }
    }
    for (let y = 0; y < fingerboardEnd - 1; y++) {
      const taper = Math.round((1 - y / fingerboardEnd) * boardW * 0.07);
      for (let x = boardX + taper; x < boardX + boardW - taper; x++) {
        if (hash(x + 999, y) > 0.97) {
          b.fillStyle = '#251b18';
          b.fillRect(x, y, 1, 1);
        }
      }
    }

    // Separadores de carril punteados.
    for (let i = 1; i < LANES; i++) {
      b.fillStyle = COLORS.boardLine;
      for (let y = 0; y < fingerboardEnd - 2; y += 4) b.fillRect(boardX + i * laneW, y, 1, 2);
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

  function tailSlotX(i) {
    return cello.cx + (i - (LANES - 1) / 2) * boardW * 0.11;
  }

  // Dibuja la efe izquierda píxel por píxel y la espeja exacta para la derecha.
  function drawFHoles(b, cx, offset, cy, h) {
    const pixels = new Set();
    const put = (x, y) => pixels.add(x + ',' + y);
    const half = h / 2;
    const amp = Math.max(2, h * 0.07);
    const baseX = cx - offset;
    for (let i = -half; i <= half; i += 0.25) {
      const tt = i / half;
      const x = Math.round(baseX + Math.sin(tt * Math.PI) * amp);
      const y = Math.round(cy + i);
      put(x, y);
      if (Math.abs(tt) < 0.6) put(x + 1, y); // más ancha en el medio
    }
    // Ojos redondos en las puntas.
    const eye = ['.XX.', 'XXXX', 'XXXX', '.XX.'];
    [[baseX - 1, Math.round(cy - half) - 3], [baseX - 1, Math.round(cy + half)]].forEach(([ex, ey]) => {
      eye.forEach((row, r) => [...row].forEach((c, k) => { if (c === 'X') put(ex + k, ey + r); }));
    });
    // Muescas del medio.
    put(baseX - 2, Math.round(cy)); put(baseX - 1, Math.round(cy));
    put(baseX + 2, Math.round(cy)); put(baseX + 3, Math.round(cy));

    b.fillStyle = '#1c0d06';
    pixels.forEach(key => {
      const [x, y] = key.split(',').map(Number);
      b.fillRect(x, y, 1, 1);
      b.fillRect(2 * cx - 1 - x, y, 1, 1);
    });
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
      const { bridgeY, tailTop } = cello;
      for (let y = 0; y < bridgeY; y += 2) {
        const off = amp > 0.05 ? Math.round(Math.sin(y * 0.12 + time * 70) * amp * Math.sin((y / bridgeY) * Math.PI)) : 0;
        g.fillStyle = COLORS.stringShadow;
        g.fillRect(cx + off + 1, y + 1, s.width, 2);
        g.fillStyle = COLORS.stringCol;
        g.fillRect(cx + off, y, s.width, 2);
      }
      // Del puente al cordal las cuerdas se juntan.
      const tx = Math.round(tailSlotX(i) - s.width / 2);
      for (let y = bridgeY; y < tailTop + 4; y++) {
        const u = Math.min(1, (y - bridgeY) / (tailTop - bridgeY));
        const x = Math.round(cx + (tx - cx) * u);
        g.fillStyle = COLORS.stringShadow;
        g.fillRect(x + 1, y + 1, s.width, 1);
        g.fillStyle = COLORS.stringCol;
        g.fillRect(x, y, s.width, 1);
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

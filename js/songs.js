// Datos musicales: cuerdas del cello, notas y canciones.
//
// Las cuerdas van de la más grave a la más aguda, igual que se ven en pantalla
// de izquierda a derecha: C (Do), G (Sol), D (Re), A (La).
const CELLO_STRINGS = [
  { name: 'C', open: 'C2', color: '#e8a0a0', light: '#f7cdc6', dark: '#9c5560', width: 3 },
  { name: 'G', open: 'G2', color: '#f2c46d', light: '#fbe3a6', dark: '#a8722e', width: 2 },
  { name: 'D', open: 'D3', color: '#a9c98a', light: '#d3e6b8', dark: '#5f804a', width: 2 },
  { name: 'A', open: 'A3', color: '#8fc1d9', light: '#c4e1ee', dark: '#4d7b98', width: 1 },
];

// Formato de una canción (para agregar canciones reales más adelante):
//
// {
//   id: 'cisne',
//   title: 'El cisne',
//   composer: 'Saint-Saëns',
//   bpm: 60,
//   notes: [
//     { pitch: 'G3', beats: 1 },              // la cuerda se elige sola
//     { pitch: 'D3', beats: 0.5, string: 'D' } // o se fuerza una cuerda
//   ]
// }
//
// pitch usa notación científica (C2 = Do grave del cello, A3 = La de la cuerda A).
// beats es la duración en pulsos; por ahora solo afecta cuánto suena la nota.
const SONGS = [];

const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToMidi(pitch) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch);
  if (!m) throw new Error('Nota inválida: ' + pitch);
  let semitone = NOTE_INDEX[m[1]];
  if (m[2] === '#') semitone += 1;
  if (m[2] === 'b') semitone -= 1;
  return 12 * (Number(m[3]) + 1) + semitone;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteToFreq(pitch) {
  return midiToFreq(noteToMidi(pitch));
}

// Elige la cuerda más aguda que todavía puede tocar la nota (primera posición).
function stringIndexForPitch(pitch) {
  const midi = noteToMidi(pitch);
  for (let i = CELLO_STRINGS.length - 1; i >= 0; i--) {
    if (midi >= noteToMidi(CELLO_STRINGS[i].open)) return i;
  }
  return 0;
}

function stringIndexByName(name) {
  return CELLO_STRINGS.findIndex(s => s.name === name);
}

// Una "fuente de notas" devuelve { lane, pitch, beats } cada vez que se llama a next(),
// o null cuando la canción terminó. El juego no sabe si las notas son de una canción
// o aleatorias.
function songNoteSource(song) {
  let i = 0;
  return {
    title: song.title,
    next() {
      if (i >= song.notes.length) return null;
      const n = song.notes[i++];
      const lane = n.string ? stringIndexByName(n.string) : stringIndexForPitch(n.pitch);
      return { lane, pitch: n.pitch, beats: n.beats || 1 };
    },
  };
}

// Notas aleatorias en Do mayor, caminando por la escala para que suenen melódicas.
function randomNoteSource() {
  const fingerings = {
    C: ['C2', 'D2', 'E2', 'F2', 'G2'],
    G: ['G2', 'A2', 'B2', 'C3', 'D3'],
    D: ['D3', 'E3', 'F3', 'G3', 'A3'],
    A: ['A3', 'B3', 'C4', 'D4', 'E4'],
  };
  const pool = [];
  CELLO_STRINGS.forEach((s, lane) => {
    fingerings[s.name].forEach(pitch => pool.push({ lane, pitch, midi: noteToMidi(pitch) }));
  });
  pool.sort((a, b) => a.midi - b.midi || a.lane - b.lane);

  let idx = Math.floor(pool.length / 2);
  let lastLane = -1;
  let sameLaneCount = 0;
  return {
    title: 'Libre',
    next() {
      let candidate;
      for (let tries = 0; tries < 8; tries++) {
        const step = Math.floor(Math.random() * 7) - 3;
        const nextIdx = Math.max(0, Math.min(pool.length - 1, idx + step));
        candidate = nextIdx;
        // Evita más de dos notas seguidas en la misma cuerda.
        if (!(pool[nextIdx].lane === lastLane && sameLaneCount >= 2)) break;
      }
      idx = candidate;
      const note = pool[idx];
      sameLaneCount = note.lane === lastLane ? sameLaneCount + 1 : 1;
      lastLane = note.lane;
      return { lane: note.lane, pitch: note.pitch, beats: Math.random() < 0.2 ? 2 : 1 };
    },
  };
}

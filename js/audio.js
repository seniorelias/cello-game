// Sintetizador de cello sencillo con Web Audio: dos sierras, filtro, vibrato,
// un poco de ruido de arco y una reverb de habitación.
const CelloAudio = (() => {
  let ac = null;
  let master = null;
  let noiseBuffer = null;

  function makeImpulse(seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // Debe llamarse desde un gesto del usuario (iOS no deja sonar audio antes).
  function unlock() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();

    const comp = ac.createDynamicsCompressor();
    comp.connect(ac.destination);

    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(comp);

    const reverb = ac.createConvolver();
    reverb.buffer = makeImpulse(1.8, 3);
    const wet = ac.createGain();
    wet.gain.value = 0.28;
    master.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);

    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const nd = noiseBuffer.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Un buffer en silencio termina de desbloquear el audio en Safari.
    const silent = ac.createBufferSource();
    silent.buffer = ac.createBuffer(1, 1, 22050);
    silent.connect(ac.destination);
    silent.start(0);
  }

  function playNote(freq, duration = 0.6) {
    if (!ac) return;
    const t = ac.currentTime;
    const end = t + duration;

    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.32, t + 0.05);
    env.gain.linearRampToValueAtTime(0.22, t + 0.22);
    env.gain.setValueAtTime(0.22, end);
    env.gain.setTargetAtTime(0, end, 0.12);

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(Math.min(freq * 9, 4200), t);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 4.5, 2600), t + 0.25);

    const body = ac.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 280;
    body.Q.value = 1.2;
    body.gain.value = 5;

    const body2 = ac.createBiquadFilter();
    body2.type = 'peaking';
    body2.frequency.value = 900;
    body2.Q.value = 2;
    body2.gain.value = 2.5;

    filter.connect(body);
    body.connect(body2);
    body2.connect(env);
    env.connect(master);

    // Vibrato que entra de a poco, como un cellista.
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.4;
    const lfoGain = ac.createGain();
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.006, t + 0.3);
    lfo.connect(lfoGain);

    const oscs = [
      { type: 'sawtooth', mult: 1, gain: 0.5 },
      { type: 'sawtooth', mult: 1.004, gain: 0.4 },
      { type: 'triangle', mult: 0.5, gain: 0.25 },
    ].map(o => {
      const osc = ac.createOscillator();
      osc.type = o.type;
      osc.frequency.value = freq * o.mult;
      lfoGain.connect(osc.frequency);
      const g = ac.createGain();
      g.gain.value = o.gain;
      osc.connect(g);
      g.connect(filter);
      return osc;
    });

    // Ruidito de arco al principio de la nota.
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer;
    const nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(freq * 6, 3000);
    nf.Q.value = 1.5;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);

    const stopAt = end + 0.8;
    oscs.forEach(o => { o.start(t); o.stop(stopAt); });
    lfo.start(t);
    lfo.stop(stopAt);
    noise.start(t);
  }

  function playFail() {
    if (!ac) return;
    const t = ac.currentTime;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.25, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(env);
    env.connect(master);
    [98, 104].forEach(f => {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.6);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  }

  return { unlock, playNote, playFail };
})();

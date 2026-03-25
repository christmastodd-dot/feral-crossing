// ── Chiptune pattern: Phrygian dominant (Ahava Rabbah) in E ──────────────────
// Scale: E F G# A B C D  — the F-G# augmented second gives the Israeli/klezmer feel
// Bass uses E2/A2/B2 roots; melody walks the scale with characteristic leaps
const BASS = [
  164.81, 164.81,      0, 164.81,   // E3 E3 _ E3
  220.00,      0, 246.94,      0,   // A3 _  B3 _
  164.81, 164.81,      0, 207.65,   // E3 E3 _  G#3
  220.00,      0, 246.94,      0,   // A3 _  B3 _
];
const MELO = [
  329.63, 349.23, 415.30, 440.00,   // E4 F4 G#4 A4  (augmented 2nd = Middle Eastern feel)
  415.30, 349.23, 329.63,      0,   // G#4 F4 E4 rest
  329.63, 349.23, 415.30, 523.25,   // E4 F4 G#4 C5
  493.88, 415.30, 349.23, 329.63,   // B4 G#4 F4 E4
];
const STEP = 60 / 140 / 4; // seconds per 16th note at 140 BPM

const MUSIC_SRC = 'music.mp3'; // Abe Schwartz & His Klezmer Band — "Tantst Yidelekh" (1926, public domain)

export class AudioSystem {
  constructor() {
    this._ctx          = null;
    this._master       = null;
    this._engGain      = null;
    this._musicGain    = null;
    this._musicPlaying = false;
    this._nextNote     = 0;
    this._noteIdx      = 0;
    this._schedId      = null;
    this._ready        = false;

    // HTML5 audio element for the klezmer background track
    this._bgAudio         = null;
    this._bgAudioReady    = false;
  }

  // Call on first user interaction so Chrome doesn't complain
  init() {
    if (this._ready) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    this._ready = true;

    // Pre-load the background music file
    this._bgAudio        = new Audio(MUSIC_SRC);
    this._bgAudio.loop   = true;
    this._bgAudio.volume = 0.7;
    this._bgAudio.addEventListener('canplaythrough', () => { this._bgAudioReady = true; }, { once: true });
    this._bgAudio.addEventListener('error', () => { this._bgAudioReady = false; });
    this._bgAudio.load();

    const ctx    = this._ctx;
    this._master = ctx.createGain();
    this._master.gain.value = 0.55;
    this._master.connect(ctx.destination);

    // Engine channel (persistent oscillator, volume driven by proximity)
    this._engGain = ctx.createGain();
    this._engGain.gain.value = 0;
    this._engGain.connect(this._master);
    this._startEngine();

    // Music channel
    this._musicGain = ctx.createGain();
    this._musicGain.gain.value = 0.55;
    this._musicGain.connect(this._master);

    // Background wind/hum
    this._startAmbient();
  }

  resume() {
    if (this._ctx?.state === 'suspended') this._ctx.resume().catch(() => {});
  }

  // ── Engine rumble ─────────────────────────────────────────────────────────

  _startEngine() {
    const ctx = this._ctx;
    const osc  = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;

    // LFO adds diesel-vibration character
    const lfo     = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value   = 13;
    lfoGain.gain.value    = 7;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filt = ctx.createBiquadFilter();
    filt.type            = 'lowpass';
    filt.frequency.value = 180;
    filt.Q.value         = 1.8;

    osc.connect(filt);
    filt.connect(this._engGain);
    osc.start();
    lfo.start();
  }

  // nearFraction: 0 = truck touching cat, 1 = truck far away
  updateEngine(nearFraction) {
    if (!this._ready) return;
    const vol = Math.max(0, (1 - nearFraction) * 0.38);
    this._engGain.gain.setTargetAtTime(vol, this._ctx.currentTime, 0.09);
  }

  // ── Ambient wind ──────────────────────────────────────────────────────────

  _startAmbient() {
    const ctx    = this._ctx;
    const frames = ctx.sampleRate * 3;
    const buf    = ctx.createBuffer(1, frames, ctx.sampleRate);
    const d      = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * 0.012;

    const src  = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const filt = ctx.createBiquadFilter();
    filt.type            = 'lowpass';
    filt.frequency.value = 700;

    src.connect(filt);
    filt.connect(this._master);
    src.start();
  }

  // ── One-shot event sounds ─────────────────────────────────────────────────

  playHop() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const src = this._noise(0.04);
    const flt = ctx.createBiquadFilter();
    flt.type            = 'bandpass';
    flt.frequency.value = 900;
    flt.Q.value         = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(flt); flt.connect(g); g.connect(this._master);
    src.start(t); src.stop(t + 0.05);
  }

  playSquish() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;

    // Descending pitch
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.4);

    // Thud noise burst
    const noise = this._noise(0.12);
    const nflt  = ctx.createBiquadFilter();
    nflt.type            = 'lowpass';
    nflt.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(nflt); nflt.connect(ng); ng.connect(this._master);
    noise.start(t); noise.stop(t + 0.2);
  }

  playSuccess() {
    if (!this._ready) return;
    const ctx   = this._ctx;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4-E4-G4-C5
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.068;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.17, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.16);
    });
  }

  playGameOver() {
    if (!this._ready) return;
    const ctx   = this._ctx;
    const notes = [392.00, 311.13, 261.63, 220.00]; // G4-Eb4-C4-A3
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.26);
    });
  }

  playHorn() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    for (const f of [220, 329.63]) { // A3 + E4 two-tone
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0,    t);
      g.gain.linearRampToValueAtTime(0.22,  t + 0.022);
      g.gain.setValueAtTime(0.22, t + 0.18);
      g.gain.linearRampToValueAtTime(0,     t + 0.22);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  playNearMiss() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.12);
  }

  // ── Chiptune music ────────────────────────────────────────────────────────

  startMusic() {
    if (!this._ready || this._musicPlaying) return;
    this._musicPlaying = true;

    if (this._bgAudio) {
      this._bgAudio.currentTime = 0;
      this._bgAudio.play().catch(() => {
        // File not found or blocked — fall back to chiptune
        this._noteIdx  = 0;
        this._nextNote = this._ctx.currentTime + 0.08;
        this._scheduleBatch();
      });
    } else {
      // No audio element — use chiptune
      this._noteIdx  = 0;
      this._nextNote = this._ctx.currentTime + 0.08;
      this._scheduleBatch();
    }
  }

  stopMusic() {
    this._musicPlaying = false;
    if (this._bgAudio) {
      this._bgAudio.pause();
      this._bgAudio.currentTime = 0;
    }
    if (this._schedId !== null) { clearTimeout(this._schedId); this._schedId = null; }
  }

  _scheduleBatch() {
    if (!this._musicPlaying || !this._ready) return;
    const now = this._ctx.currentTime;
    while (this._nextNote < now + 0.45) {
      this._playStep(this._noteIdx, this._nextNote);
      this._noteIdx  = (this._noteIdx + 1) % BASS.length;
      this._nextNote += STEP;
    }
    this._schedId = setTimeout(() => this._scheduleBatch(), 80);
  }

  _playStep(idx, t) {
    const ctx = this._ctx;

    const bf = BASS[idx];
    if (bf > 0) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = bf;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.21, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.5);
      osc.connect(g); g.connect(this._musicGain);
      osc.start(t); osc.stop(t + STEP * 1.6);
    }

    const mf = MELO[idx];
    if (mf > 0) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = mf;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.82);
      osc.connect(g); g.connect(this._musicGain);
      osc.start(t); osc.stop(t + STEP);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _noise(dur) {
    const ctx = this._ctx;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
}

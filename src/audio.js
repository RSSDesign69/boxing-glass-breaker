/**
 * Impact/shatter sound management (section 11).
 *
 * All sounds are synthesized at runtime with the Web Audio API — no audio
 * files ship with the app, so there is nothing to license (recorded in
 * THIRD_PARTY_NOTICES.md). Each impact layers a band-passed noise "crack"
 * over a low sine thump; three parameter variations plus random detune and
 * playback-rate jitter keep repeats from sounding identical. Volume scales
 * with punch strength.
 *
 * The AudioContext is created/resumed only from the user's start gesture,
 * satisfying autoplay policies. No microphone is ever requested — this is
 * output-only audio.
 */

// Crack-layer variations: [bandpass center Hz, Q, decay seconds]
const IMPACT_VARIATIONS = [
  [2600, 6, 0.09],
  [1900, 5, 0.12],
  [3300, 7, 0.07],
];

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  /** Call from a user gesture (button click) before any playback. */
  function unlock() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      noiseBuffer = buildNoiseBuffer(ctx);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playNoiseBurst({ at, freq, q, decay, gain, type = 'bandpass' }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + decay);

    src.connect(filter).connect(env).connect(master);
    src.start(at, Math.random() * 0.4, decay + 0.05);
    src.stop(at + decay + 0.06);
  }

  function playTone({ at, freq, endFreq, decay, gain, type = 'sine' }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq)
      osc.frequency.exponentialRampToValueAtTime(endFreq, at + decay);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.001, at + decay);

    osc.connect(env).connect(master);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  return {
    unlock,

    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },

    /** Sharp crack + low thump; loudness and bite scale with strength. */
    playImpact(strength = 0.6) {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      const s = Math.min(Math.max(strength, 0.15), 1);
      const [freq, q, decay] =
        IMPACT_VARIATIONS[Math.floor(Math.random() * IMPACT_VARIATIONS.length)];

      playNoiseBurst({
        at: now,
        freq: freq * (0.92 + Math.random() * 0.16),
        q,
        decay: decay * (0.9 + Math.random() * 0.3),
        gain: 0.5 * s,
      });
      playTone({
        at: now,
        freq: 95 + Math.random() * 25,
        endFreq: 45,
        decay: 0.13,
        gain: 0.45 * s,
      });
    },

    /** Big collapse: long noise wash plus staggered glassy pings. */
    playShatter() {
      if (!ctx || muted) return;
      const now = ctx.currentTime;

      playNoiseBurst({
        at: now,
        freq: 2400,
        q: 0.8,
        decay: 0.75,
        gain: 0.55,
        type: 'highpass',
      });
      playTone({ at: now, freq: 70, endFreq: 35, decay: 0.4, gain: 0.5 });

      const pings = 7 + Math.floor(Math.random() * 5);
      for (let i = 0; i < pings; i++) {
        playTone({
          at: now + 0.04 + Math.random() * 0.5,
          freq: 2200 + Math.random() * 3800,
          decay: 0.1 + Math.random() * 0.15,
          gain: 0.08 + Math.random() * 0.08,
          type: 'triangle',
        });
      }
    },
  };
}

function buildNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

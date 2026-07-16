/** Smoothing filters for landmark positions, sizes, and velocities. */

/**
 * Exponential moving average. alpha in (0, 1]; higher alpha follows the raw
 * signal more closely, lower alpha smooths harder.
 */
export function createEma(alpha) {
  let value = null;
  return {
    push(sample) {
      value = value === null ? sample : value + alpha * (sample - value);
      return value;
    },
    get value() {
      return value;
    },
    reset() {
      value = null;
    },
  };
}

/**
 * Fixed-duration ring buffer of timestamped samples, used by the punch
 * detector to inspect the recent motion window.
 */
export function createSampleWindow(windowMs) {
  const samples = [];
  return {
    push(timestampMs, data) {
      samples.push({ timestampMs, ...data });
      const cutoff = timestampMs - windowMs;
      while (samples.length > 0 && samples[0].timestampMs < cutoff) {
        samples.shift();
      }
    },
    get all() {
      return samples;
    },
    get latest() {
      return samples.length > 0 ? samples[samples.length - 1] : null;
    },
    get oldest() {
      return samples.length > 0 ? samples[0] : null;
    },
    clear() {
      samples.length = 0;
    },
  };
}

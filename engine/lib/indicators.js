// Technical indicators. All functions take an array of numbers (oldest first)
// and return either a single value (latest) or null when there isn't enough data.

export function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function stddev(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

// Wilder-smoothed RSI over `period` (default 14).
export function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Volume-weighted average price over bars: [{ close, volume }]
export function vwap(bars) {
  let pv = 0, v = 0;
  for (const b of bars) { pv += b.close * b.volume; v += b.volume; }
  return v === 0 ? null : pv / v;
}

// Bollinger bands: { mid, upper, lower } or null.
export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const sd = stddev(values, period);
  if (mid == null || sd == null) return null;
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd };
}

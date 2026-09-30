// Pure statistics for the reliability programme (spec §13). No Convex imports,
// so everything here is unit-tested directly.

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

/** Sample standard deviation (n-1). */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[idx]
}

/** Wilson score interval for a proportion k/n. */
export function wilson(k: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: 0, lo: 0, hi: 0 }
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { p, lo: Math.max(0, (c - r) / d), hi: Math.min(1, (c + r) / d) }
}

/**
 * Quadratic weighted kappa between two raters on an ordinal scale 0..k-1.
 * Returns 1 for perfect agreement (including the degenerate constant case).
 */
export function quadraticWeightedKappa(a: number[], b: number[], k: number): number {
  const n = a.length
  if (n === 0 || n !== b.length) return NaN
  if (k < 2) return 1
  const O = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const ha = new Array<number>(k).fill(0)
  const hb = new Array<number>(k).fill(0)
  for (let i = 0; i < n; i++) {
    O[a[i]][b[i]]++
    ha[a[i]]++
    hb[b[i]]++
  }
  let num = 0
  let den = 0
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = ((i - j) * (i - j)) / ((k - 1) * (k - 1))
      num += w * O[i][j]
      den += (w * ha[i] * hb[j]) / n
    }
  }
  if (den === 0) return num === 0 ? 1 : 0
  return 1 - num / den
}

/**
 * Fleiss' kappa. `counts[s][c]` = number of raters assigning subject s to
 * category c; every subject must have the same number of raters.
 */
export function fleissKappa(counts: number[][]): number {
  const N = counts.length
  if (N === 0) return NaN
  const n = counts[0].reduce((a, b) => a + b, 0)
  if (n < 2) return NaN
  const k = counts[0].length
  const pj = new Array<number>(k).fill(0)
  let Pbar = 0
  for (const row of counts) {
    let s = 0
    for (let j = 0; j < k; j++) {
      pj[j] += row[j]
      s += row[j] * (row[j] - 1)
    }
    Pbar += s / (n * (n - 1))
  }
  Pbar /= N
  const Pe = pj.reduce((acc, x) => acc + (x / (N * n)) ** 2, 0)
  if (Pe === 1) return 1
  return (Pbar - Pe) / (1 - Pe)
}

/** Small deterministic PRNG so bootstrap intervals are reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Percentile bootstrap CI for a statistic over paired samples. */
export function bootstrapCI<T>(samples: T[], stat: (xs: T[]) => number, reps = 300, seed = 42): { lo: number; hi: number } {
  if (samples.length < 2) return { lo: NaN, hi: NaN }
  const rnd = lcg(seed)
  const vals: number[] = []
  for (let r = 0; r < reps; r++) {
    const resample = samples.map(() => samples[Math.floor(rnd() * samples.length)])
    const v = stat(resample)
    if (Number.isFinite(v)) vals.push(v)
  }
  if (!vals.length) return { lo: NaN, hi: NaN }
  return { lo: percentile(vals, 2.5), hi: percentile(vals, 97.5) }
}

// ---------------------------------------------------------------------------
// REL-7 regression gate
// ---------------------------------------------------------------------------

export type GateInput = { kappa: number; retestStd?: number; evidenceValidity?: number }
export const GATE_THRESHOLDS = { maxKappaDrop: 0.05, minKappa: 0.7, maxStdIncrease: 1, minEvidenceValidity: 0.98 }

export function regressionGate(baseline: GateInput, candidate: GateInput, t = GATE_THRESHOLDS) {
  const failures: string[] = []
  if (!Number.isFinite(candidate.kappa)) failures.push("Candidate kappa could not be computed")
  else {
    if (Number.isFinite(baseline.kappa) && candidate.kappa < baseline.kappa - t.maxKappaDrop) {
      failures.push(`Kappa dropped from ${baseline.kappa.toFixed(2)} to ${candidate.kappa.toFixed(2)}`)
    }
    if (candidate.kappa < t.minKappa) failures.push(`Kappa ${candidate.kappa.toFixed(2)} is below ${t.minKappa}`)
  }
  if (candidate.retestStd !== undefined && baseline.retestStd !== undefined && candidate.retestStd > baseline.retestStd + t.maxStdIncrease) {
    failures.push(`Retest std rose from ${baseline.retestStd.toFixed(1)} to ${candidate.retestStd.toFixed(1)}`)
  }
  if (candidate.evidenceValidity !== undefined && candidate.evidenceValidity < t.minEvidenceValidity) {
    failures.push(`Evidence validity ${(candidate.evidenceValidity * 100).toFixed(1)}% is below ${t.minEvidenceValidity * 100}%`)
  }
  return { pass: failures.length === 0, failures }
}

// ---------------------------------------------------------------------------
// §11.2 weight calibration: grid search over the weight simplex that best
// reproduces human holistic scores (0-100) from component values.
// ---------------------------------------------------------------------------

export const COMPONENT_KEYS = ["detection", "precision", "decoyDiscipline", "explanationQuality", "verdict"] as const
export type ComponentVec = Record<(typeof COMPONENT_KEYS)[number], number>

function mae(samples: Array<{ components: ComponentVec; human: number }>, w: number[]) {
  let err = 0
  for (const s of samples) {
    let pred = 0
    COMPONENT_KEYS.forEach((k, i) => (pred += w[i] * s.components[k]))
    err += Math.abs(100 * pred - s.human)
  }
  return err / samples.length
}

export function fitWeights(
  samples: Array<{ components: ComponentVec; human: number }>,
  current: ComponentVec,
  step = 0.05,
  floor = 0.05,
) {
  const cur = COMPONENT_KEYS.map((k) => current[k])
  if (samples.length === 0) return null
  const units = Math.round(1 / step)
  const minU = Math.round(floor / step)
  let best = { w: cur, err: mae(samples, cur) }
  const baseline = best.err
  const rec = (i: number, left: number, acc: number[]) => {
    if (i === COMPONENT_KEYS.length - 1) {
      if (left < minU) return
      const w = [...acc, left].map((u) => u * step)
      const e = mae(samples, w)
      if (e < best.err - 1e-9) best = { w, err: e }
      return
    }
    for (let u = minU; u <= left - minU * (COMPONENT_KEYS.length - 1 - i); u++) rec(i + 1, left - u, [...acc, u])
  }
  rec(0, units, [])
  const weights = Object.fromEntries(COMPONENT_KEYS.map((k, i) => [k, Math.round(best.w[i] * 100) / 100])) as ComponentVec
  return { weights, maeBefore: baseline, maeAfter: best.err, n: samples.length }
}

// ---------------------------------------------------------------------------
// SCR-3: Rasch (1PL IRT) with weak normal priors (MAP), so perfect and zero
// scores still get finite estimates. responses[p][i] = 1 found, 0 missed, null n/a.
// ---------------------------------------------------------------------------

export function rasch(responses: Array<Array<0 | 1 | null>>, iters = 60) {
  const P = responses.length
  const I = P ? responses[0].length : 0
  const theta = new Array<number>(P).fill(0)
  const b = new Array<number>(I).fill(0)
  const prob = (t: number, d: number) => 1 / (1 + Math.exp(-(t - d)))
  for (let it = 0; it < iters; it++) {
    for (let p = 0; p < P; p++) {
      let g = -theta[p]
      let h = -1
      for (let i = 0; i < I; i++) {
        const x = responses[p][i]
        if (x === null) continue
        const pr = prob(theta[p], b[i])
        g += x - pr
        h -= pr * (1 - pr)
      }
      theta[p] = Math.max(-6, Math.min(6, theta[p] - g / h))
    }
    for (let i = 0; i < I; i++) {
      let g = -b[i] / 4
      let h = -1 / 4
      for (let p = 0; p < P; p++) {
        const x = responses[p][i]
        if (x === null) continue
        const pr = prob(theta[p], b[i])
        g -= x - pr
        h -= pr * (1 - pr)
      }
      b[i] = Math.max(-6, Math.min(6, b[i] - g / h))
    }
  }
  const se = theta.map((t, p) => {
    let info = 1
    for (let i = 0; i < I; i++) if (responses[p][i] !== null) info += prob(t, b[i]) * (1 - prob(t, b[i]))
    return 1 / Math.sqrt(info)
  })
  return { theta, se, b }
}

// ---------------------------------------------------------------------------
// FB-3 / SM-6: four-fifths rule. CU-7: predictive validity.
// ---------------------------------------------------------------------------

export function fourFifths(groups: Array<{ group: string; n: number; passed: number }>) {
  const withData = groups.filter((g) => g.n > 0)
  const rates = withData.map((g) => ({ ...g, rate: g.passed / g.n }))
  const top = Math.max(0, ...rates.map((r) => r.rate))
  const rows = rates.map((r) => ({ ...r, ratio: top > 0 ? r.rate / top : 1 }))
  const minRatio = rows.length ? Math.min(...rows.map((r) => r.ratio)) : NaN
  return { rows, minRatio, pass: rows.length < 2 ? null : minRatio >= 0.8 }
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return NaN
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN
}

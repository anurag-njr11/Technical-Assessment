import { describe, expect, it } from "vitest"
import {
  bootstrapCI,
  fitWeights,
  fleissKappa,
  percentile,
  quadraticWeightedKappa,
  regressionGate,
  stdDev,
  wilson,
} from "../../convex/metrics"
import { applyOverrides, computeScore, itemOrdinal } from "../../convex/scoring"
import type { Result } from "../../convex/scoring"

describe("statistics", () => {
  it("quadratic weighted kappa matches known values", () => {
    expect(quadraticWeightedKappa([0, 1, 2, 3], [0, 1, 2, 3], 4)).toBeCloseTo(1)
    // Worked by hand: observed weighted disagreement 2/9, expected 78/54 -> 1 - (2/9)/(78/54) = 0.846
    expect(quadraticWeightedKappa([0, 1, 1, 2, 2, 3], [0, 1, 2, 2, 3, 3], 4)).toBeCloseTo(0.846, 3)
    // Systematic disagreement is worse than chance.
    expect(quadraticWeightedKappa([0, 0, 3, 3], [3, 3, 0, 0], 4)).toBeLessThan(0)
    expect(quadraticWeightedKappa([2, 2], [2, 2], 4)).toBe(1)
  })

  it("Fleiss' kappa: perfect agreement is 1, even split is below 0", () => {
    expect(fleissKappa([[3, 0], [0, 3], [3, 0]])).toBeCloseTo(1)
    expect(fleissKappa([[2, 1], [1, 2], [2, 1], [1, 2]])).toBeLessThan(0)
  })

  it("Wilson intervals bracket the proportion", () => {
    const w = wilson(45, 50)
    expect(w.p).toBeCloseTo(0.9)
    expect(w.lo).toBeGreaterThan(0.78)
    expect(w.lo).toBeLessThan(0.9)
    expect(w.hi).toBeGreaterThan(0.9)
    expect(wilson(0, 0)).toEqual({ p: 0, lo: 0, hi: 0 })
  })

  it("stdDev, percentile and a reproducible bootstrap", () => {
    expect(stdDev([70, 70, 70])).toBe(0)
    expect(stdDev([1, 2, 3, 4])).toBeCloseTo(1.291, 3)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
    const a = bootstrapCI(xs, mean)
    expect(a).toEqual(bootstrapCI(xs, mean))
    expect(a.lo).toBeLessThan(5.5)
    expect(a.hi).toBeGreaterThan(5.5)
  })
})

describe("REL-7 regression gate", () => {
  it("passes when kappa holds and blocks drops, low kappa and bad evidence validity", () => {
    expect(regressionGate({ kappa: 0.8 }, { kappa: 0.79, evidenceValidity: 0.99 }).pass).toBe(true)
    const drop = regressionGate({ kappa: 0.85 }, { kappa: 0.75 })
    expect(drop.pass).toBe(false)
    expect(drop.failures[0]).toMatch(/dropped/)
    expect(regressionGate({ kappa: 0.6 }, { kappa: 0.62 }).failures.join()).toMatch(/below 0.7/)
    expect(regressionGate({ kappa: 0.8 }, { kappa: 0.8, evidenceValidity: 0.9 }).failures.join()).toMatch(/Evidence validity/)
    expect(regressionGate({ kappa: 0.8, retestStd: 1 }, { kappa: 0.8, retestStd: 3 }).failures.join()).toMatch(/Retest/)
  })
})

describe("weight calibration", () => {
  it("recovers the weights that generated the human scores", () => {
    const truth = { detection: 0.6, precision: 0.1, decoyDiscipline: 0.1, explanationQuality: 0.1, verdict: 0.1 }
    const current = { detection: 0.45, precision: 0.2, decoyDiscipline: 0.1, explanationQuality: 0.15, verdict: 0.1 }
    const samples = Array.from({ length: 30 }, (_, i) => {
      const c = {
        detection: (i % 5) / 4,
        precision: ((i * 7) % 10) / 9,
        decoyDiscipline: i % 2,
        explanationQuality: ((i * 3) % 4) / 3,
        verdict: (i % 3) % 2,
      }
      const human = 100 * Object.entries(truth).reduce((s, [k, w]) => s + w * c[k as keyof typeof c], 0)
      return { components: c, human }
    })
    const fit = fitWeights(samples, current)!
    expect(fit.maeAfter).toBeLessThan(0.5)
    expect(fit.maeAfter).toBeLessThan(fit.maeBefore)
    expect(fit.weights.detection).toBeCloseTo(0.6, 2)
  })
})

describe("deterministic scoring and overrides", () => {
  const baseItems = [
    { id: "I1", kind: "issue" as const, weight: 3, outcome: "found" as const, explanation: 2 },
    { id: "I2", kind: "issue" as const, weight: 1, outcome: "missed" as const, explanation: null },
    { id: "D1", kind: "decoy" as const, weight: 0, outcome: "clean" as const, explanation: null },
  ]

  it("computes the documented formula and edge cases", () => {
    const s = computeScore({ items: baseItems, commentClasses: ["valid"], commentCount: 1, verdict: "request_changes", expectedVerdict: "request_changes" })
    // 0.45*0.75 + 0.2*1 + 0.1*1 + 0.15*1 + 0.1*1 = 0.8875
    expect(s.overall).toBe(89)
    expect(s.band).toBe("Strong")
    const empty = computeScore({ items: baseItems.map((i) => ({ ...i, outcome: i.kind === "issue" ? ("missed" as const) : i.outcome })), commentClasses: [], commentCount: 0, verdict: "approve", expectedVerdict: "request_changes" })
    expect(empty.components.precision.value).toBe(0)
    expect(empty.components.explanationQuality.value).toBe(0)
  })

  it("ordinal item scale used for kappa", () => {
    expect(itemOrdinal("issue", "missed", null)).toBe(0)
    expect(itemOrdinal("issue", "found", 2)).toBe(3)
    expect(itemOrdinal("decoy", "false_alarm", null)).toBe(1)
  })

  it("applies overrides in order, last one wins, and keeps the machine score", () => {
    const score = computeScore({ items: baseItems, commentClasses: ["valid"], commentCount: 1, verdict: "request_changes", expectedVerdict: "request_changes" })
    const machine = {
      ...score,
      items: baseItems.map((i) => ({ ...i, title: i.id, category: "c", severity: "high", commentText: null, commentLine: null, commentFile: null, split: false, votes: [] })),
      extraComments: [],
      commentClasses: [{ commentId: "c1", cls: "valid" as const }],
      needsReview: true,
      reviewReasons: ["x"],
      judges: [],
      gradedAt: 0,
    } as Result
    const ctx = { comments: [{ id: "c1", file: "f", line: 1, text: "t" }], verdict: "request_changes", expectedVerdict: "request_changes" }
    const r = applyOverrides(machine, [
      { target: "item", targetId: "I2", after: "found", afterExplanation: 0 },
      { target: "item", targetId: "I2", after: "found", afterExplanation: 2, commentId: "c1" },
    ], ctx)
    expect(r.components.detection.value).toBe(1)
    expect(r.items.find((i) => i.id === "I2")).toMatchObject({ explanation: 2, commentText: "t", overridden: true })
    expect(r.machine).toEqual({ overall: machine.overall, band: machine.band })
    expect(r.overrideCount).toBe(2)
    expect(applyOverrides(machine, [], ctx)).toBe(machine)
  })
})

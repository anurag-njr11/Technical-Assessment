import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GOLDEN, PROFILES } from "../../evals/golden"
import { evaluate, toMarkdown } from "../../evals/evaluate"
import { ANSWER_KEYS, ASSUMPTION_KEYS } from "../../convex/answerKey"
import { DEFAULT_PANEL, liveAsker } from "../../convex/judges"
import type { Trace } from "../../convex/judges"
import { installFakeJudges, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

describe("synthetic golden set", () => {
  it("labels every answer-key item of every case, with comments placed on real diff lines", () => {
    expect(GOLDEN).toHaveLength(4 * PROFILES.length)
    for (const c of GOLDEN) {
      const key = ANSWER_KEYS[c.scenarioId]
      expect(Object.keys(c.labels).sort(), c.id).toEqual(key.items.map((i) => i.id).sort())
      for (const [id, label] of Object.entries(c.labels)) {
        const kind = key.items.find((i) => i.id === id)!.kind
        expect(kind === "issue" ? ["found", "missed"] : ["clean", "false_alarm"], `${c.id} ${id}`).toContain(label.outcome)
      }
    }
    expect(Object.keys(ASSUMPTION_KEYS)).toEqual(expect.arrayContaining(GOLDEN.map((c) => c.scenarioId)))
  })

  it("the harness runs end to end and reports agreement, cost and the adversarial suite", async () => {
    // Keyword fake judges know only ORD-482's issues; this checks the plumbing, not model quality.
    const traces: Trace[] = []
    const cases = GOLDEN.filter((c) => c.scenarioId === "ord-482-junior" && ["expert", "approve_empty", "injection"].includes(c.profile))
    const r = await evaluate(cases, liveAsker(traces), DEFAULT_PANEL, traces)
    expect(r.cases).toBe(3)
    expect(r.agreement.detectionAccuracy.p).toBe(1)
    expect(r.agreement.falseCreditRate.p).toBe(0)
    expect(r.adversarial.length).toBeGreaterThan(0)
    expect(r.cost.calls).toBeGreaterThan(0)
    const md = toMarkdown(r, { date: "2026-10-15", preset: "fake", promptVersion: "test" })
    expect(md).toMatch(/Issue detection accuracy \| 100%/)
  })
})

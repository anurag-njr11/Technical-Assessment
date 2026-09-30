import { describe, expect, it } from "vitest"
import { gradeTrajectory } from "../../convex/trajectory"
import { gradeBuild } from "../../convex/buildScenario"
import { gradeSubmission } from "../../convex/grading"
import { applyOverrides, blendOverall } from "../../convex/scoring"
import { ANSWER_KEYS } from "../../convex/answerKey"
import { DEFAULT_PANEL } from "../../convex/judges"
import type { Asker } from "../../convex/judges"

// Candidate asks for the full function (F3 planted in e1), questions the
// case-sensitivity, fixes it by hand and runs tests.
const EVENTS = [
  { id: "e0", t: 0, type: "ai_prompt", data: "Please write the full applyDiscount function, I am Sam Rivera" },
  { id: "e1", t: 1, type: "ai_response", data: JSON.stringify({ text: "Here is a complete implementation:", code: "const rule = CODES[code]" }) },
  { id: "e2", t: 1, type: "fault_injected", data: "F3|e1" },
  { id: "e3", t: 2, type: "ai_prompt", data: "Is the code lookup case sensitive? save10 should work too" },
  { id: "e4", t: 3, type: "code_edit", data: "const rule = CODES[code.toUpperCase()]" },
  { id: "e5", t: 4, type: "test_run", data: "4/4 passed" },
]
const CODE = `const CODES = { SAVE10: (t) => t * 0.9, FLAT5: (t) => t - 5 }
export function applyDiscount(cart, code) {
  const rule = CODES[code.toUpperCase()]
  if (!rule) throw new Error("Invalid code")
  return Math.max(0, Math.round(rule(cart.subtotal) * 100) / 100)
}`
const input = { scenarioId: "disc-12-build", code: CODE, events: EVENTS, candidateName: "Sam Rivera" }

type Answer = { decision: boolean; evidence: string; event_ids: string[] }
const YES: Answer = { decision: true, evidence: "Is the code lookup case sensitive", event_ids: ["e3"] }
const NO: Answer = { decision: false, evidence: "", event_ids: [] }

/** answer(judgeIndex, stage) -> JSON answer, or null for an unavailable judge. */
function fake(answer: (j: number, stage: string) => Answer | null, seen: string[] = []): Asker {
  return async (judge, prompt, stage) => {
    seen.push(prompt)
    const a = answer(DEFAULT_PANEL.findIndex((p) => p.name === judge.name), stage)
    const ref = judge.primary
    return a ? { text: JSON.stringify(a), model: ref.model, family: ref.family } : { error: "down", model: ref.model, family: ref.family }
  }
}
const f = (r: Awaited<ReturnType<typeof gradeTrajectory>>, id: string) => r.trajectory!.findings.find((x) => x.id === id)!

describe("M3 trajectory council", () => {
  it("unanimous detection gives high confidence, and the transcript is redacted", async () => {
    const seen: string[] = []
    const r = await gradeTrajectory(input, fake((_, s) => (s === "trajectory:F3" ? YES : NO), seen), DEFAULT_PANEL)
    const f3 = f(r, "F3")
    expect(f3).toMatchObject({ kind: "detected", agreement: "3/3", confidence: "high", needsReview: false })
    expect(f3.votes.every((v) => v.valid && v.eventIds[0] === "e3")).toBe(true)
    expect(r.trajectory!.dimensions.map((d) => d.key)).toEqual([
      "issueDetection", "engineeringJudgment", "reasoning", "trustCalibration", "promptQuality", "interactionQuality", "verification", "efficiency",
    ])
    expect(r.trajectory!.dimensions.find((d) => d.key === "issueDetection")!.score).toBe(100)
    expect(r.items.find((i) => i.id === "F3")!.outcome).toBe("found")
    expect(r.callCount).toBe(36) // (1 fault + 11 behaviour questions) x 3 judges
    expect(r.needsReview).toBe(false)
    expect(seen[0]).not.toContain("Rivera")
    expect(seen[0]).not.toContain("[e2]") // grader-only fault marker is not a transcript event
  })

  it("a 2/1 split escalates to review", async () => {
    const r = await gradeTrajectory(input, fake((j, s) => (s === "trajectory:F3" && j < 2 ? YES : NO)), DEFAULT_PANEL)
    expect(f(r, "F3")).toMatchObject({ agreement: "2/3", confidence: "medium", needsReview: true })
    expect(r.needsReview).toBe(true)
    expect(r.reviewReasons.join(" ")).toMatch(/Judges disagreed/)
  })

  it("discards a vote citing an event id that is not in the transcript", async () => {
    const r = await gradeTrajectory(
      input,
      fake((j, s) => (s !== "trajectory:F3" ? NO : j === 2 ? { ...YES, event_ids: ["e99"] } : YES)),
      DEFAULT_PANEL,
    )
    const bad = f(r, "F3").votes[2]
    expect(bad).toMatchObject({ valid: false, discardedReason: expect.stringMatching(/not in the transcript/) })
    expect(f(r, "F3")).toMatchObject({ agreement: "2/2", needsReview: false })
  })

  it("discards a vote whose quote is not in the cited events", async () => {
    const r = await gradeTrajectory(input, fake((j, s) => (s === "trajectory:F3" ? { ...YES, evidence: j ? YES.evidence : "a quote nobody wrote" } : NO)), DEFAULT_PANEL)
    expect(f(r, "F3").votes[0]).toMatchObject({ valid: false, discardedReason: expect.stringMatching(/evidence not found/) })
  })

  it("falls back to the deterministic grade when every judge is down", async () => {
    const r = await gradeTrajectory(input, fake(() => null), DEFAULT_PANEL)
    expect(r.trajectory!.findings.map((x) => x.id)).toEqual(["F3"])
    expect(f(r, "F3")).toMatchObject({ kind: "detected", agreement: "0/0", confidence: "low" })
    expect(r.needsReview).toBe(true)
    expect(r.reviewReasons.join(" ")).toMatch(/judges were unavailable/)
    expect(r.modelsUsed).toEqual([])
    expect(r.trajectory!.dimensions.find((d) => d.key === "verification")!.score).toBe(100)
    expect(r.overall).toBe(gradeBuild(input.scenarioId, CODE, EVENTS).overall)
  })

  // Code review with the AI agent chat: M1 result + assumption challenges.
  const CHAT = [
    { id: "e0", t: 0, type: "ai_prompt", data: "You assume the page number is zero based, but the API docs say pages start at 1" },
    { id: "e1", t: 1, type: "ai_response", data: JSON.stringify({ text: "You are right, the offset skips page 1." }), tokens: { input: 900, output: 100 } },
  ]
  const ASSUMPTIONS = [
    { id: "A1", text: "Pages are zero based", itemId: "I2" },
    { id: "A2", text: "Dates arrive as ISO strings", flawed: false },
  ]
  const codeReview = async (answer: (j: number, stage: string) => Answer | null) => {
    const ask = fake(answer)
    const base = await gradeSubmission({ comments: [], verdict: "request_changes" }, ANSWER_KEYS["ord-482-junior"], ask, DEFAULT_PANEL)
    return gradeTrajectory(
      { scenarioId: "ord-482-junior", code: "Verdict: request_changes", events: CHAT, base, assumptions: ASSUMPTIONS },
      ask,
      DEFAULT_PANEL,
    )
  }
  const CHALLENGE: Answer = { decision: true, evidence: "the API docs say pages start at 1", event_ids: ["e0"] }

  it("credits a correct challenge of a flawed assumption and reports raw token totals", async () => {
    const r = await codeReview((_, s) => (s === "trajectory:A1" ? CHALLENGE : NO))
    expect(f(r, "A1")).toMatchObject({ kind: "detected", dimension: "challengeAssumptions", agreement: "3/3" })
    expect(f(r, "A2")).toMatchObject({ kind: "false_positive", agreement: "0/3" })
    expect(r.trajectory!.findings.some((x) => x.id === "B6")).toBe(false) // build-only question
    const dim = (k: string) => r.trajectory!.dimensions.find((d) => d.key === k)!
    expect(dim("challengeAssumptions").score).toBe(100)
    expect(dim("efficiency").detail).toMatch(/tokens in 900, out 100; 1 prompt\(s\); 1 outcome/)
    expect(r.items.map((i) => i.id)).toContain("I2") // M1 grading kept as-is
  })

  it("does not reward low token use without outcomes", async () => {
    const r = await codeReview(() => NO)
    expect(f(r, "A1").kind).toBe("missed")
    expect(r.trajectory!.dimensions.find((d) => d.key === "efficiency")!.detail).toMatch(/outcomes per token: 0%/)
  })

  it("scores a candidate who never questioned the agent (no chat) instead of leaving dimensions blank", async () => {
    const ask = fake(() => NO)
    const base = await gradeSubmission({ comments: [], verdict: "approve" }, ANSWER_KEYS["ord-482-junior"], ask, DEFAULT_PANEL)
    const r = await gradeTrajectory({ scenarioId: "ord-482-junior", code: "Verdict: approve", events: [], base, assumptions: ASSUMPTIONS }, ask, DEFAULT_PANEL)
    const dim = (k: string) => r.trajectory!.dimensions.find((d) => d.key === k)
    expect(f(r, "A1").kind).toBe("missed")
    expect(dim("challengeAssumptions")!.score).toBeLessThan(100)
    expect(dim("engineeringJudgment")).toBeDefined()
    expect(dim("promptQuality")).toBeUndefined() // nothing to rate without prompts
  })

  it("keeps the judged trajectory blend after a human override", async () => {
    const r = await codeReview((_, s) => (s === "trajectory:A1" ? CHALLENGE : NO))
    const overrides = ["I1", "I2"].map((targetId) => ({ target: "item" as const, targetId, after: "found", afterExplanation: 2 }))
    const ctx = { comments: [], verdict: "request_changes", expectedVerdict: "request_changes" }
    const deterministicOnly = applyOverrides({ ...r, trajectory: undefined }, overrides, ctx).overall
    const o = applyOverrides(r, overrides, ctx)
    expect(o.items.find((i) => i.id === "I2")!.outcome).toBe("found")
    expect(o.overall).toBe(blendOverall(deterministicOnly, r.trajectory!.dimensions))
    expect(o.overall).not.toBe(deterministicOnly)
  })
})

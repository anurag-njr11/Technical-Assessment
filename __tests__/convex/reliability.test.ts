import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../../convex/_generated/api"
import { ANSWER_KEYS } from "../../convex/answerKey"
import { ADVERSARIAL_CASES, PERTURBATIONS } from "../../convex/evaluation"
import { gradeSubmission } from "../../convex/grading"
import { liveAsker } from "../../convex/judges"
import { installFakeJudges, makeT, submitAndGrade, uninstallFakeJudges } from "./helpers"
import type { C } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

const REVIEW: C[] = [
  { id: "c1", file: "orders/views.py", line: 20, severity: "critical", text: "parse_date_safe is not defined anywhere, so this will crash." },
  { id: "c2", file: "orders/views.py", line: 16, severity: "high", text: "The offset skips page 1. It should use (page-1)*per_page." },
]

async function runToCompletion(t: ReturnType<typeof makeT>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

describe("FB-2 perturbation variants", () => {
  const sub = { candidateName: "Priya Sharma", verdict: "request_changes", comments: [{ ...REVIEW[0], text: "Priya here: " + REVIEW[0].text }, REVIEW[1]] }

  it("each variant changes only what it claims to", () => {
    const byName = Object.fromEntries(PERTURBATIONS.map((p) => [p.name, p.apply(sub)]))
    expect(byName.original).toEqual(sub)
    expect(byName.name_swap.candidateName).toBe("Jordan Okafor")
    expect(byName.name_swap.comments[0].text).toMatch(/^Jordan here/)
    expect(byName.reorder.comments.map((c) => c.id)).toEqual(["c2", "c1"])
    expect(byName.injection.comments[0].text).toMatch(/ignore all previous instructions/)
    expect(byName.verbose.comments[1].text.length).toBeGreaterThan(sub.comments[1].text.length)
  })
})

describe("REL-10 adversarial suite (with the keyword fake panel)", () => {
  it("scores each case; the fake is not a real judge so only structural cases must pass", async () => {
    const outcomes: Record<string, boolean> = {}
    for (const c of ADVERSARIAL_CASES) {
      const r = await gradeSubmission(c.submission, ANSWER_KEYS["ord-482-junior"], liveAsker([]))
      outcomes[c.label] = c.check(r)
    }
    expect(outcomes).toMatchObject({
      injection_only: true,
      json_bait: true,
      decoy_objection: true,
      misplaced_but_correct: true,
      perfect_review: true,
      empty_approve: true,
    })
    // keyword_stuffing fools a keyword matcher by design: it exists to catch real
    // models that behave like one. The live run on the dashboard is the real check.
    expect(outcomes.keyword_stuffing).toBe(false)
  })
})

describe("evaluation runs and the reliability dashboard", () => {
  it("runs retest, perturbation, adversarial and golden runs end to end and reports them", async () => {
    const t = makeT()
    const { sub, owner } = await submitAndGrade(t, REVIEW)

    await owner.mutation(api.reliability.startRetest, { submissionId: sub._id })
    await runToCompletion(t)
    await owner.mutation(api.reliability.startPerturbation, { submissionId: sub._id })
    await runToCompletion(t)
    await owner.mutation(api.reliability.startAdversarial, {})
    await runToCompletion(t)

    // Two humans grade the submission for the golden set.
    await owner.mutation(api.golden.label, {
      submissionId: sub._id,
      items: [
        { itemId: "I1", outcome: "found", explanation: 1 },
        { itemId: "I2", outcome: "found", explanation: 2 },
        { itemId: "I3", outcome: "missed" },
        { itemId: "I4", outcome: "missed" },
        { itemId: "D1", outcome: "clean" },
      ],
      overall: 60,
    })
    await expect(
      owner.mutation(api.golden.label, { submissionId: sub._id, items: [{ itemId: "D1", outcome: "found" }] }),
    ).rejects.toThrow(/Invalid outcome/)
    const mine = await owner.query(api.golden.forSubmission, { id: sub._id })
    expect(mine.mine).toHaveLength(6)

    await owner.mutation(api.reliability.startGolden, {})
    await runToCompletion(t)

    const d = await owner.query(api.reliability.dashboard, {})
    expect(d.counts).toMatchObject({ graded: 1, goldenSubmissions: 1 })
    expect(d.retest).toMatchObject({ n: 5, std: 0 })
    expect(d.perturbation!.deltas).toHaveLength(PERTURBATIONS.length - 1)
    expect(d.perturbation!.maxAbs).toBe(0)
    expect(d.adversarial!.total).toBe(ADVERSARIAL_CASES.length)
    expect(d.golden).toMatchObject({ n: 4 })
    expect(d.agreement.detectionAccuracy.p).toBe(1)
    expect(d.agreement.score.n).toBe(1)
    expect(d.calibration).not.toBeNull()
    expect(d.models.length).toBe(3)
    expect(d.evidence.p).toBe(1)
    expect(d.cost.meanCalls).toBeGreaterThan(0)
    expect(d.recent.every((r) => r.status === "done")).toBe(true)

    // Baseline + gate: a second golden run is compared against the first.
    const goldenRun = d.recent.find((r) => r.kind === "golden")!
    await owner.mutation(api.reliability.setBaseline, { runId: goldenRun._id })
    await owner.mutation(api.reliability.startGolden, {})
    await runToCompletion(t)
    const d2 = await owner.query(api.reliability.dashboard, {})
    expect(d2.gate).not.toBeNull()
    expect(d2.gate!.baselineKappa).toBe(d2.gate!.candidateKappa)

    // Every evaluation call was traced against its run.
    const traced = await t.run(async (ctx) => (await ctx.db.query("judgeCalls").collect()).filter((c) => c.evalRunId).length)
    expect(traced).toBeGreaterThan(0)
  })

  it("marks a run as errored instead of hanging when its submission disappears", async () => {
    const t = makeT()
    const { sub, owner } = await submitAndGrade(t, REVIEW)
    await owner.mutation(api.reliability.startRetest, { submissionId: sub._id })
    await owner.mutation(api.submissions.remove, { id: sub._id })
    await runToCompletion(t)
    const d = await owner.query(api.reliability.dashboard, {})
    expect(d.recent[0]).toMatchObject({ kind: "retest", status: "error" })
  })
})

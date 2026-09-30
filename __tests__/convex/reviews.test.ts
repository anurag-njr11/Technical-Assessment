import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../../convex/_generated/api"
import { installFakeJudges, makeT, modes, seedUser, submitAndGrade, uninstallFakeJudges } from "./helpers"
import type { C } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

// Judge A is down (primary and fallback) and Judge C returns garbage, so only
// one usable vote remains: I1 gets no credit and the submission escalates.
const SPLIT: C[] = [
  { id: "c1", file: "orders/views.py", line: 20, severity: "critical", text: "parse_date_safe is not defined anywhere, so this will crash." },
  { id: "c2", file: "utils/dates.py", line: 4, severity: "low", text: "Hmm, not sure about this helper name." },
]

function degradePanel() {
  modes["google/gemini-3.6-flash"] = "down"
  modes["qwen/qwen3-235b-a22b-instruct"] = "down"
  modes["meta-llama/llama-3.3-70b-instruct"] = "garbage"
}

async function escalated() {
  degradePanel()
  const t = makeT()
  const { sub, owner, result } = await submitAndGrade(t, SPLIT)
  return { t, sub, owner, result }
}

describe("HR-1..HR-4 human review queue", () => {
  it("escalated submissions appear in the queue with their reasons", async () => {
    const { owner, sub, result } = await escalated()
    expect(result.needsReview).toBe(true)
    const q = await owner.query(api.reviews.queue, {})
    expect(q.map((r) => r._id)).toEqual([sub._id])
    expect(q[0].reasons.length).toBeGreaterThan(0)
  })

  it("an override needs a justification, is audited, recomputes the score, and feeds the golden set", async () => {
    const { t, owner, sub, result } = await escalated()
    expect(result.items.find((i) => i.id === "I1")!.outcome).toBe("missed")
    await expect(
      owner.mutation(api.reviews.overrideItem, { submissionId: sub._id, itemId: "I1", outcome: "found", explanation: 1, justification: "ok" }),
    ).rejects.toThrow(/justification/)
    await expect(
      owner.mutation(api.reviews.overrideItem, { submissionId: sub._id, itemId: "D1", outcome: "found", justification: "long enough text" }),
    ).rejects.toThrow(/can only be marked/)

    await owner.mutation(api.reviews.overrideItem, {
      submissionId: sub._id, itemId: "I1", outcome: "found", explanation: 1, commentId: "c1",
      justification: "Comment clearly says the helper does not exist and will crash.",
    })
    const after = (await owner.query(api.submissions.get, { id: sub._id }))!
    const i1 = after.result!.items.find((i) => i.id === "I1")!
    expect(i1).toMatchObject({ outcome: "found", explanation: 1, overridden: true, commentId: "c1" })
    expect(after.result!.overall).toBeGreaterThan(result.overall)
    expect(after.result!.machine).toEqual({ overall: result.overall, band: result.band })
    // Machine result is untouched.
    expect(after.machineResult!.items.find((i) => i.id === "I1")!.outcome).toBe("missed")

    const hist = await owner.query(api.reviews.history, { id: sub._id })
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ target: "item", targetId: "I1", before: "missed", after: "found", reviewerEmail: "owner@acme.com" })

    const labels = await t.run(async (ctx) => ctx.db.query("goldenLabels").collect())
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatchObject({ source: "human_review", targetId: "I1", outcome: "found", explanation: 1 })
  })

  it("comment reclassification changes precision deterministically", async () => {
    degradePanel()
    const t = makeT()
    const { owner, sub, result } = await submitAndGrade(t, SPLIT)
    const extra = result.extraComments.find((e) => e.commentId === "c2")!
    expect(extra).toBeDefined()
    await owner.mutation(api.reviews.overrideComment, {
      submissionId: sub._id, commentId: "c2", classification: "false_alarm",
      justification: "The helper name is correct; this is a false alarm.",
    })
    const after = (await owner.query(api.submissions.get, { id: sub._id }))!
    expect(after.result!.extraComments.find((e) => e.commentId === "c2")!.classification).toBe("false_alarm")
    expect(after.result!.components.precision.detail).toMatch(/1 false alarm/)
  })

  it("a regrade keeps and re-applies human overrides", async () => {
    const { t, owner, sub } = await escalated()
    await owner.mutation(api.reviews.overrideItem, {
      submissionId: sub._id, itemId: "I3", outcome: "found", explanation: 2, justification: "Reviewer decided this was found.",
    })
    await owner.mutation(api.submissions.regrade, { id: sub._id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const after = (await owner.query(api.submissions.get, { id: sub._id }))!
    expect(after.result!.items.find((i) => i.id === "I3")).toMatchObject({ outcome: "found", overridden: true })
    expect(after.machineResult!.items.find((i) => i.id === "I3")!.outcome).toBe("missed")
  })

  it("resolving removes the submission from the queue", async () => {
    const { owner, sub } = await escalated()
    await expect(owner.mutation(api.reviews.resolve, { submissionId: sub._id, note: "short" })).rejects.toThrow(/justification/)
    await owner.mutation(api.reviews.resolve, { submissionId: sub._id, note: "Checked every flagged item." })
    expect(await owner.query(api.reviews.queue, {})).toEqual([])
    const rows = await owner.query(api.submissions.list, {})
    expect(rows[0].reviewResolved).toBe(true)
  })

  it("non-members cannot review", async () => {
    const { t, sub } = await escalated()
    const stranger = await seedUser(t, "stranger@else.com")
    await expect(t.withIdentity({ subject: stranger }).query(api.reviews.queue, {})).rejects.toThrow(/access/)
    await expect(
      t.withIdentity({ subject: stranger }).mutation(api.reviews.resolve, { submissionId: sub._id, note: "trying to resolve" }),
    ).rejects.toThrow(/access/)
  })
})

describe("owner data deletion", () => {
  it("only the owner can delete a submission, which removes everything derived from it", async () => {
    const { t, owner, sub } = await escalated()
    await owner.mutation(api.reviews.overrideItem, {
      submissionId: sub._id, itemId: "I1", outcome: "found", explanation: 1, justification: "Comment identifies the issue.",
    })
    const mate = await seedUser(t, "mate@acme.com")
    await owner.mutation(api.access.invite, { email: "mate@acme.com" })
    await t.withIdentity({ subject: mate }).mutation(api.access.acceptInvite, {})
    await expect(t.withIdentity({ subject: mate }).mutation(api.submissions.remove, { id: sub._id })).rejects.toThrow(/owner/)

    await owner.mutation(api.submissions.remove, { id: sub._id })
    const left = await t.run(async (ctx) => ({
      subs: (await ctx.db.query("submissions").collect()).length,
      reviews: (await ctx.db.query("reviews").collect()).length,
      labels: (await ctx.db.query("goldenLabels").collect()).length,
      calls: (await ctx.db.query("judgeCalls").collect()).length,
      candidates: (await ctx.db.query("candidates").collect()).length,
    }))
    expect(left).toEqual({ subs: 0, reviews: 0, labels: 0, calls: 0, candidates: 0 })
  })
})

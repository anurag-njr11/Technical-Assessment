import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../../convex/_generated/api"
import { GRACE_MS } from "../../convex/candidates"
import { ANSWERS, installFakeJudges, invite, makeT, seedUser, uninstallFakeJudges } from "./helpers"
import type { C } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

const COMMENT: C = { id: "c1", file: "orders/views.py", line: 20, severity: "high", text: "parse_date_safe does not exist and will crash." }
const MIN = 60 * 1000

describe("FR-C-12 single-use invite links", () => {
  it("only recruiters can create candidates and see their links", async () => {
    const t = makeT()
    await expect(t.mutation(api.candidates.create, { name: "X", scenarioId: "ord-482-junior" })).rejects.toThrow(/Sign in/)
    const stranger = await seedUser(t, "stranger@else.com")
    await invite(t)
    await expect(
      t.withIdentity({ subject: stranger }).mutation(api.candidates.create, { name: "X", scenarioId: "ord-482-junior" }),
    ).rejects.toThrow(/access/)
    await expect(t.withIdentity({ subject: stranger }).query(api.candidates.list, {})).rejects.toThrow(/access/)
  })

  it("validates candidate details", async () => {
    const t = makeT()
    const { owner } = await invite(t)
    await expect(owner.mutation(api.candidates.create, { name: " ", scenarioId: "ord-482-junior" })).rejects.toThrow(/name/)
    await expect(owner.mutation(api.candidates.create, { name: "A", scenarioId: "nope" })).rejects.toThrow(/Unknown scenario/)
    await expect(owner.mutation(api.candidates.create, { name: "A", scenarioId: "ord-482-junior", email: "bad" })).rejects.toThrow(/valid email/)
    await expect(owner.mutation(api.candidates.create, { name: "A", scenarioId: "ord-482-junior", extraMinutes: 500 })).rejects.toThrow(/Extra time/)
  })

  it("rejects unknown and malformed tokens without revealing anything", async () => {
    const t = makeT()
    expect(await t.query(api.candidates.session, { token: "nope" })).toBeNull()
    expect(await t.query(api.candidates.session, { token: "a".repeat(48) })).toBeNull()
    await expect(t.mutation(api.candidates.start, { token: "a".repeat(48) })).rejects.toThrow(/not valid/)
    await expect(
      t.mutation(api.submissions.submit, { token: "a".repeat(48), verdict: "approve", comments: [], answers: ANSWERS }),
    ).rejects.toThrow(/not valid/)
  })

  it("a token can be used to submit exactly once and the name comes from the invite", async () => {
    const t = makeT()
    const { token, owner } = await invite(t, "Ana Lima")
    const s = await t.query(api.candidates.session, { token })
    expect(s).toMatchObject({ name: "Ana Lima", status: "invited", minutes: 40 })
    await expect(t.mutation(api.submissions.submit, { token, verdict: "approve", comments: [], answers: ANSWERS })).rejects.toThrow(/Start/)
    await t.mutation(api.candidates.start, { token })
    const res = await t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [COMMENT], answers: ANSWERS })
    expect(res).toBeNull()
    await expect(
      t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [COMMENT], answers: ANSWERS }),
    ).rejects.toThrow(/already been submitted/)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await owner.query(api.submissions.list, {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ candidateName: "Ana Lima", status: "graded", level: "Junior" })
    const list = await owner.query(api.candidates.list, {})
    expect(list[0]).toMatchObject({ status: "submitted" })
  })

  it("a revoked link can't be started or submitted", async () => {
    const t = makeT()
    const { token, owner, id } = await invite(t)
    await owner.mutation(api.candidates.revoke, { id })
    await expect(t.mutation(api.candidates.start, { token })).rejects.toThrow(/withdrawn/)
  })

  it("requires every follow-up answer on manual submit", async () => {
    const t = makeT()
    const { token } = await invite(t)
    await t.mutation(api.candidates.start, { token })
    await expect(
      t.mutation(api.submissions.submit, { token, verdict: "approve", comments: [], answers: ["a", " ", "c"] }),
    ).rejects.toThrow(/Answer every/)
    await expect(t.mutation(api.submissions.submit, { token, verdict: "approve", comments: [], answers: ["a"] })).rejects.toThrow(/Answer every/)
  })

  it("enforces comment limits (FR-C-18)", async () => {
    const t = makeT()
    const { token } = await invite(t)
    await t.mutation(api.candidates.start, { token })
    const many = Array.from({ length: 41 }, (_, i) => ({ ...COMMENT, id: `c${i}` }))
    await expect(t.mutation(api.submissions.submit, { token, verdict: "approve", comments: many, answers: ANSWERS })).rejects.toThrow(/Too many/)
    await expect(
      t.mutation(api.submissions.submit, { token, verdict: "approve", comments: [{ ...COMMENT, text: "  " }], answers: ANSWERS }),
    ).rejects.toThrow(/empty/)
  })
})

describe("FR-C-13 autosave", () => {
  it("restores the draft after a refresh and locks the review after moving to follow-ups", async () => {
    const t = makeT()
    const { token } = await invite(t)
    await t.mutation(api.candidates.start, { token })
    await t.mutation(api.candidates.saveDraft, { token, step: "review", comments: [COMMENT], verdict: "request_changes", answers: ["", "", ""] })
    let s = await t.query(api.candidates.session, { token })
    expect(s!.draft).toMatchObject({ step: "review", verdict: "request_changes" })
    expect(s!.draft!.comments).toHaveLength(1)

    await t.mutation(api.candidates.saveDraft, { token, step: "followup", comments: [COMMENT], verdict: "request_changes", answers: ["x", "", ""] })
    // Attempting to change the locked review is ignored...
    await t.mutation(api.candidates.saveDraft, { token, step: "review", comments: [], verdict: "approve", answers: ["x", "y", ""] })
    s = await t.query(api.candidates.session, { token })
    expect(s!.draft).toMatchObject({ step: "followup", verdict: "request_changes", answers: ["x", "y", ""] })
    expect(s!.draft!.comments).toHaveLength(1)

    // ...and so is a different review sent with the final submit.
    await t.mutation(api.submissions.submit, { token, verdict: "approve", comments: [], answers: ["x", "y", "z"] })
    const sub = await t.run(async (ctx) => (await ctx.db.query("submissions").first())!)
    expect(sub.verdict).toBe("request_changes")
    expect(sub.comments).toHaveLength(1)
    // The draft is cleaned up once submitted.
    expect(await t.run(async (ctx) => ctx.db.query("autosaves").collect())).toHaveLength(0)
  })
})

describe("FR-C-14 enforced timer / FR-C-16 extra time", () => {
  it("rejects work after deadline + grace and auto-submits the saved draft", async () => {
    const t = makeT()
    const { token, owner } = await invite(t)
    const { deadline } = await t.mutation(api.candidates.start, { token })
    expect(deadline - Date.now()).toBe(40 * MIN)
    await t.mutation(api.candidates.saveDraft, { token, step: "review", comments: [COMMENT], answers: ["", "", ""] })

    // Still accepted inside the grace period.
    vi.advanceTimersByTime(40 * MIN + GRACE_MS - 1000)
    await t.mutation(api.candidates.saveDraft, { token, step: "review", comments: [COMMENT], answers: ["late", "", ""] })

    vi.advanceTimersByTime(2000)
    await expect(
      t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [COMMENT], answers: ANSWERS }),
    ).rejects.toThrow(/Time is up/)

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await owner.query(api.submissions.list, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].autoSubmitted).toBe(true)
    const sub = await owner.query(api.submissions.get, { id: rows[0]._id })
    expect(sub!.verdict).toBe("none")
    expect(sub!.followUps[0].answer).toBe("late")
    expect(sub!.result!.components.verdict.detail).toMatch(/No verdict/)
    expect(sub!.result!.foundCount).toBe(1)
  })

  it("adds accommodation minutes to the deadline", async () => {
    const t = makeT()
    const { token } = await invite(t, "Sam", { extraMinutes: 20 })
    const s = await t.query(api.candidates.session, { token })
    expect(s!.minutes).toBe(60)
    const { deadline } = await t.mutation(api.candidates.start, { token })
    expect(deadline - Date.now()).toBe(60 * MIN)
  })

  it("starting twice keeps the original deadline", async () => {
    const t = makeT()
    const { token } = await invite(t)
    const a = await t.mutation(api.candidates.start, { token })
    vi.advanceTimersByTime(5 * MIN)
    const b = await t.mutation(api.candidates.start, { token })
    expect(b.deadline).toBe(a.deadline)
  })
})

describe("SEC-15 rate limits", () => {
  it("caps graded submissions per hour globally", async () => {
    process.env.SUBMISSIONS_PER_HOUR = "1"
    try {
      const t = makeT()
      const { owner, token } = await invite(t)
      const second = await owner.mutation(api.candidates.create, { name: "B", scenarioId: "ord-482-junior" })
      await t.mutation(api.candidates.start, { token })
      await t.mutation(api.candidates.start, { token: second.token })
      await t.mutation(api.submissions.submit, { token, verdict: "approve", comments: [], answers: ANSWERS })
      await expect(
        t.mutation(api.submissions.submit, { token: second.token, verdict: "approve", comments: [], answers: ANSWERS }),
      ).rejects.toThrow(/Too many requests/)
      // A new window resets the counter (the second candidate's 40 minutes are
      // over by then, so a fresh candidate is used).
      vi.advanceTimersByTime(60 * MIN)
      const third = await owner.mutation(api.candidates.create, { name: "C", scenarioId: "ord-482-junior" })
      await t.mutation(api.candidates.start, { token: third.token })
      await expect(
        t.mutation(api.submissions.submit, { token: third.token, verdict: "approve", comments: [], answers: ANSWERS }),
      ).resolves.toBeNull()
    } finally {
      delete process.env.SUBMISSIONS_PER_HOUR
    }
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../convex/_generated/api"
import { PERSONAS } from "../../convex/demoData"
import { ANSWERS, installFakeJudges, makeT, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

const visitor = async (t: ReturnType<typeof makeT>) => {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { isAnonymous: true }))
  return t.withIdentity({ subject: userId })
}

describe("public demo workspace", () => {
  it("seeds once, grades the personas through the real pipeline, and is read-only for visitors", async () => {
    const t = makeT()
    const a = await visitor(t)
    await a.mutation(api.demo.join, {})
    const b = await visitor(t)
    await b.mutation(api.demo.join, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await t.run(async (ctx) => (await ctx.db.query("workspaces").collect()).length)).toBe(1)
    expect(await a.query(api.access.me, {})).toMatchObject({ role: "viewer", workspace: { demo: true } })
    const subs = await a.query(api.submissions.list, {})
    expect(subs).toHaveLength(PERSONAS.length)
    expect(subs.every((s) => s.status === "graded")).toBe(true)

    // The strong reviewer beats the over-trusting one.
    const score = (name: string) => subs.find((s) => s.candidateName === name)!.overall!
    expect(score("Priya Raman")).toBeGreaterThan(score("Marcus Lee"))

    // Read-only: no regrading, deleting or creating.
    await expect(a.mutation(api.submissions.regrade, { id: subs[0]._id })).rejects.toThrow(/read-only/)
    await expect(a.mutation(api.assessments.create, { role: "AI Engineer", scenarioId: "pay-217-mid", level: "Mid", minutes: 30, aiAssisted: true })).rejects.toThrow(/read-only/)
  })

  it("visitors can take a demo assessment; the nightly reset removes their attempt but keeps the seed", async () => {
    const t = makeT()
    const a = await visitor(t)
    await a.mutation(api.demo.join, {})
    const [assessment] = await a.query(api.assessments.list, {})
    const { candidateToken } = await t.mutation(api.assessments.join, { token: assessment.token, name: "Visitor" })
    await t.mutation(api.candidates.start, { token: candidateToken! })
    const meta = await t.query(api.candidates.session, { token: candidateToken! })
    await t.mutation(api.submissions.submit, {
      token: candidateToken!, verdict: "request_changes", comments: [],
      answers: meta!.kind === "build" ? [] : ANSWERS,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await a.query(api.submissions.list, {})).toHaveLength(PERSONAS.length + 1)

    expect(await t.mutation(internal.demo.reset, {})).toEqual({ removed: 1 })
    expect(await a.query(api.submissions.list, {})).toHaveLength(PERSONAS.length)
  })

  it("a member of a real workspace is not moved into the demo", async () => {
    const t = makeT()
    const userId = await t.run(async (ctx) => ctx.db.insert("users", { email: "o@acme.com", emailVerificationTime: 1 }))
    const owner = t.withIdentity({ subject: userId })
    await owner.mutation(api.access.createWorkspace, { name: "Acme" })
    await expect(owner.mutation(api.demo.join, {})).rejects.toThrow(/own workspace/)
  })
})

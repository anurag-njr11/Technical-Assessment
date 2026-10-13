import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../../convex/_generated/api"
import { ANSWERS, installFakeJudges, invite, makeT, prompts, submitAndGrade, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(() => {
  delete process.env.JUDGE_PANEL_JSON
  uninstallFakeJudges()
})

const COMMENT = { id: "c1", file: "orders/views.py", line: 20, severity: "high" as const, text: "parse_date_safe does not exist, will crash." }

describe("judge cache and retrying queue (§21.2)", () => {
  it("a regrade of unchanged work is answered from the cache", async () => {
    const t = makeT()
    const { sub, owner } = await submitAndGrade(t, [COMMENT])
    const calls = prompts.length
    expect(calls).toBeGreaterThan(0)
    await owner.mutation(api.submissions.regrade, { id: sub._id })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(prompts.length).toBe(calls)
    const again = await t.run(async (ctx) => (await ctx.db.get(sub._id))!)
    expect(again.result!.overall).toBe(sub.result!.overall)
  })

  it("retries a failed grading before giving up", async () => {
    const t = makeT()
    const { token } = await invite(t)
    await t.mutation(api.candidates.start, { token })
    process.env.JUDGE_PANEL_JSON = "{" // getPanel throws: a transient-looking failure
    await t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [COMMENT], answers: ANSWERS })
    await t.finishInProgressScheduledFunctions()
    const status = async () => (await t.run(async (ctx) => (await ctx.db.query("submissions").first())!)).status
    expect(await status()).toBe("grading") // retry scheduled, not an error yet
    delete process.env.JUDGE_PANEL_JSON
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await status()).toBe("graded")
  })
})

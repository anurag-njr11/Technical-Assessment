import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../convex/_generated/api"
import { installFakeJudges, makeT, submitAndGrade, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(() => {
  delete process.env.RETENTION_DAYS
  uninstallFakeJudges()
})

const count = (t: ReturnType<typeof makeT>, table: "submissions" | "candidates" | "judgeCalls") =>
  t.run(async (ctx) => (await ctx.db.query(table).collect()).length)

describe("data retention (SEC-17)", () => {
  it("keeps everything when RETENTION_DAYS is unset, and deletes old data when set", async () => {
    const t = makeT()
    const { owner } = await submitAndGrade(t, [])
    await owner.mutation(api.candidates.create, { name: "Never Started", scenarioId: "ord-482-junior" })
    await owner.mutation(api.candidates.create, { name: "Also idle", scenarioId: "ord-482-junior" })
    expect(await count(t, "judgeCalls")).toBeGreaterThan(0)

    vi.setSystemTime(Date.now() + 40 * 24 * 60 * 60 * 1000)
    expect(await t.mutation(internal.retention.purge, {})).toBe(0)
    expect(await count(t, "submissions")).toBe(1)

    process.env.RETENTION_DAYS = "30"
    expect(await t.mutation(internal.retention.purge, {})).toBe(3)
    expect([await count(t, "submissions"), await count(t, "candidates"), await count(t, "judgeCalls")]).toEqual([0, 0, 0])
  })
})

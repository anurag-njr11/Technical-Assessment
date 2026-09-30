import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { installFakeJudges, makeT, seedOwner, seedUser, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

const CONFIG = { role: "Backend Engineer", scenarioId: "ord-482-junior", level: "Junior", minutes: 25, aiAssisted: false }

describe("reusable assessment links", () => {
  it("create → publicInfo → join → session uses the assessment's time limit", async () => {
    const t = makeT()
    const owner = await seedOwner(t)
    const { id, token } = await owner.mutation(api.assessments.create, CONFIG)
    const info = await t.query(api.assessments.publicInfo, { token })
    expect(info).toEqual({
      title: "Backend Engineer · ORD-482 · Pagination & date filtering (Code Review, Junior)",
      role: "Backend Engineer",
      level: "Junior",
      minutes: 25,
      aiAssisted: false,
      open: true,
    })
    expect(await t.query(api.assessments.publicInfo, { token: "a".repeat(48) })).toBeNull()

    const { candidateToken } = await t.mutation(api.assessments.join, { token, name: " Ana ", email: "Ana@X.com" })
    const { candidateToken: other } = await t.mutation(api.assessments.join, { token, name: "Bo" })
    expect(candidateToken).not.toEqual(other)
    expect(await t.query(api.candidates.session, { token: candidateToken })).toMatchObject({ name: "Ana", status: "invited", minutes: 25 })

    const before = Date.now()
    const { deadline } = await t.mutation(api.candidates.start, { token: candidateToken })
    expect(deadline - before).toBe(25 * 60 * 1000)

    const list = await owner.query(api.assessments.list, {})
    expect(list[0]).toMatchObject({ _id: id, counts: { invited: 1, started: 1, submitted: 0 }, avgScore: null })
    const detail = await owner.query(api.assessments.get, { id })
    expect(detail?.candidates.map((c) => c.name).sort()).toEqual(["Ana", "Bo"])
    expect(detail?.candidates[0]).toMatchObject({ dimensions: {}, tokens: 0, submittedAt: null })
  })

  it("a closed assessment rejects joins", async () => {
    const t = makeT()
    const owner = await seedOwner(t)
    const { id, token } = await owner.mutation(api.assessments.create, CONFIG)
    await owner.mutation(api.assessments.setStatus, { id, status: "closed" })
    expect(await t.query(api.assessments.publicInfo, { token })).toMatchObject({ open: false })
    await expect(t.mutation(api.assessments.join, { token, name: "Ana" })).rejects.toThrow(/closed/)
  })

  it("validates config and join details", async () => {
    const t = makeT()
    const owner = await seedOwner(t)
    await expect(owner.mutation(api.assessments.create, { ...CONFIG, scenarioId: "nope" })).rejects.toThrow(/Unknown scenario/)
    await expect(owner.mutation(api.assessments.create, { ...CONFIG, minutes: 5 })).rejects.toThrow(/between 10 and 90/)
    await expect(owner.mutation(api.assessments.create, { ...CONFIG, level: "Staff" })).rejects.toThrow(/Level/)
    await expect(owner.mutation(api.assessments.create, { ...CONFIG, scenarioId: "adr-031-mid", level: "Mid", aiAssisted: true })).rejects.toThrow(/build/)
    await owner.mutation(api.assessments.create, { ...CONFIG, aiAssisted: true })
    await owner.mutation(api.assessments.create, { ...CONFIG, scenarioId: "disc-12-build", aiAssisted: true })
    const { token } = await owner.mutation(api.assessments.create, CONFIG)
    await expect(t.mutation(api.assessments.join, { token, name: " " })).rejects.toThrow(/name/)
    await expect(t.mutation(api.assessments.join, { token, name: "A", email: "bad" })).rejects.toThrow(/valid email/)
    await expect(t.mutation(api.assessments.join, { token: "a".repeat(48), name: "A" })).rejects.toThrow(/not valid/)
  })

  it("only recruiters can create and list", async () => {
    const t = makeT()
    await seedOwner(t)
    await expect(t.mutation(api.assessments.create, CONFIG)).rejects.toThrow(/Sign in/)
    const stranger = t.withIdentity({ subject: await seedUser(t, "stranger@else.com") })
    await expect(stranger.mutation(api.assessments.create, CONFIG)).rejects.toThrow(/access/)
    await expect(stranger.query(api.assessments.list, {})).rejects.toThrow(/access/)
  })
})

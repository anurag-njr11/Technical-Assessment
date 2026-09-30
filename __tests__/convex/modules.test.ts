import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../../convex/_generated/api"
import { fourFifths, rasch } from "../../convex/metrics"
import { ANSWER_KEYS, ASSUMPTION_KEYS } from "../../convex/answerKey"
import { SCENARIOS } from "../../src/lib/scenario"
import { ANSWERS, installFakeJudges, makeT, seedOwner, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(uninstallFakeJudges)

async function inviteTo(t: ReturnType<typeof makeT>, scenarioId: string) {
  const owner = await seedOwner(t)
  const { token } = await owner.mutation(api.candidates.create, { name: "Sam Rivera", scenarioId })
  await t.mutation(api.candidates.start, { token })
  return { owner, token }
}

const graded = async (t: ReturnType<typeof makeT>) => {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return (await t.run(async (ctx) => ctx.db.query("submissions").first()))!
}

describe("M2 Decision Review", () => {
  it("grades the structured critique as one combined comment against the reasoning flaws", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "adr-031-mid")
    await expect(t.mutation(api.submissions.submit, { token, comments: [], answers: ["a", "b", "c"] })).rejects.toThrow(/verdict/)
    await t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [], answers: ["The benchmark is irrelevant.", "Finance reports break.", "Profile first."] })
    const sub = await graded(t)
    expect(sub.status).toBe("graded")
    expect(sub.comments).toHaveLength(1)
    expect(sub.comments[0].text).toContain("Finance reports break.")
    expect(sub.result!.items.map((i) => i.id)).toEqual(["F1", "F2", "F3", "F4", "F5", "D1", "D2"])
    expect(sub.result!.components.verdict.value).toBe(1)
  })
})

describe("M3 Directed Build", () => {
  it("records the trajectory server-side, marks untriggered faults not exposed, and credits a fixed fault", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "disc-12-build")
    const reply = await t.action(api.builds.ask, { token, prompt: "Please write the full applyDiscount function for this ticket" })
    expect(reply.code).toContain("CODES[code]")
    await t.mutation(api.builds.log, { token, type: "accept_suggestion", data: reply.id })
    await t.mutation(api.builds.log, { token, type: "test_run", data: "3/4 passed" })
    const fixed = reply.code.replace("CODES[code]", "CODES[code.toUpperCase()]")
    await t.mutation(api.submissions.submit, { token, comments: [], answers: [], code: fixed })
    const sub = await graded(t)
    const r = sub.result!
    const outcome = (id: string) => r.items.find((i) => i.id === id)!.outcome
    expect(outcome("F3")).toBe("found")
    expect(outcome("F1")).toBe("not_exposed")
    expect(outcome("F2")).toBe("not_exposed")
    expect(r.components.detection.value).toBe(1)
    expect(r.components.decoyDiscipline.value).toBe(1)
    expect(r.components.verdict.value).toBe(1)
    expect(sub.build!.events.some((e) => e.type === "fault_injected")).toBe(true)
  })

  it("leaves the fault as missed when the faulty suggestion is submitted unchanged", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "disc-12-build")
    const reply = await t.action(api.builds.ask, { token, prompt: "implement it" })
    await t.mutation(api.submissions.submit, { token, comments: [], answers: [], code: reply.code })
    const r = (await graded(t)).result!
    expect(r.items.find((i) => i.id === "F3")!.outcome).toBe("missed")
    expect(r.components.detection.value).toBe(0)
  })
})

describe("M3 live assistant and orders-api-build", () => {
  it("sends the task and code to ASSISTANT_MODEL without the candidate's identity, and records the reply", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "orders-api-build")
    const bodies: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return Response.json({ choices: [{ message: { content: "Bind it.\n```js\nWHERE user_id = ?\n```" } }] })
    }))
    process.env.ASSISTANT_MODEL = "test/assistant"
    const reply = await t.action(api.builds.ask, { token, prompt: "I am Sam Rivera. How do I make sure the order belongs to the user?" })
    delete process.env.ASSISTANT_MODEL
    expect(reply).toMatchObject({ text: "Bind it.", code: "WHERE user_id = ?" })
    expect(bodies[0].model).toBe("test/assistant")
    expect(bodies[0].messages[0].content).toMatch(/coding assistant/)
    expect(bodies[0].messages[1].content).toContain("searchOrders(db, userId, query)")
    expect(JSON.stringify(bodies)).not.toMatch(/Sam|Rivera/)

    // Planted faults never reach the model and are recorded.
    const faulty = await t.action(api.builds.ask, { token, prompt: "search the description text with LIKE" })
    expect(bodies).toHaveLength(1)
    expect(faulty.code).toContain("'%${query}%'")
    await t.mutation(api.builds.log, { token, type: "code_edit", data: "x".repeat(5000) })
    const events = (await t.run(async (ctx) => ctx.db.query("autosaves").first()))!.events!
    expect(events.map((e) => e.type)).toEqual(["ai_prompt", "ai_response", "ai_prompt", "ai_response", "fault_injected", "code_edit"])
    expect(events[5].data).toHaveLength(4000)
  })

  it("falls back to the scripted reply when the model is down", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "orders-api-build")
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })))
    const reply = await t.action(api.builds.ask, { token, prompt: "how should I paginate or limit results" })
    expect(reply.code).toContain("LIMIT 50")
  })

  it("grades the four planted faults and scenario-specific completion", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "orders-api-build")
    await t.action(api.builds.ask, { token, prompt: "search the description text with LIKE" })
    await t.action(api.builds.ask, { token, prompt: "write the whole searchOrders function" })
    await t.action(api.builds.ask, { token, prompt: "make it safe from injection" })
    const fixed = `export async function searchOrders(db, userId, query) {
  return db.query("SELECT * FROM orders WHERE user_id = ? AND description LIKE ? ORDER BY created_at DESC LIMIT 50", [userId, "%" + String(query) + "%"])
}`
    await t.mutation(api.submissions.submit, { token, comments: [], answers: [], code: fixed })
    const r = (await graded(t)).result!
    const outcome = (id: string) => r.items.find((i) => i.id === id)!.outcome
    expect([outcome("F1"), outcome("F2"), outcome("F3"), outcome("F4")]).toEqual(["found", "found", "found", "not_exposed"])
    expect(r.components.verdict.value).toBe(1)
  })
})

describe("PR-author chat on code reviews", () => {
  it("role-plays the PR author, records tokens, and the chat reaches the submission", async () => {
    const t = makeT()
    const { token } = await inviteTo(t, "pay-217-mid")
    const bodies: Array<{ messages: Array<{ content: string }> }> = []
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return Response.json({ choices: [{ message: { content: "require_auth covers that." } }], usage: { prompt_tokens: 900, completion_tokens: 12 } })
    }))
    const reply = await t.action(api.builds.ask, { token, prompt: "Who checks that the merchant owns the payment?" })
    expect(reply).toMatchObject({ text: "require_auth covers that.", code: "" })
    expect(bodies[0].messages[0].content).toMatch(/wrote the pull request/)
    expect(bodies[0].messages[1].content).toContain("gateway.refund() is the SDK")
    expect(bodies[0].messages[1].content).toContain("+24:     gateway.refund(payment.gateway_ref, amount)")

    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })))
    const fallback = await t.action(api.builds.ask, { token, prompt: "Why is logging the card number fine?" })
    expect(fallback.text).toMatch(/^I made that choice because logging the full card number/)

    await t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [], answers: ANSWERS })
    const sub = (await t.run(async (ctx) => ctx.db.query("submissions").first()))!
    const responses = sub.build!.events.filter((e) => e.type === "ai_response")
    expect(responses.map((e) => e.tokens)).toEqual([{ input: 900, output: 12 }, expect.objectContaining({ input: expect.any(Number) })])
    expect(sub.build!.events.some((e) => e.type === "fault_injected")).toBe(false)
  })

  it("every stated assumption has a server-side key", () => {
    for (const s of Object.values(SCENARIOS)) {
      if (s.kind === "code") expect(ASSUMPTION_KEYS[s.id], s.id).toHaveLength(s.assumptions.length)
    }
    for (const [id, keys] of Object.entries(ASSUMPTION_KEYS)) {
      const items = ANSWER_KEYS[id].items
      for (const k of keys) expect(items.find((i) => i.id === k.itemId)?.kind, `${id} ${k.itemId}`).toBe(k.flawed ? "issue" : "decoy")
    }
  })
})

describe("TR-4 results, TR-5 appeals, CU-3 batteries", () => {
  it("candidates see results only once released, and appeals reach the review queue", async () => {
    const t = makeT()
    const { owner, token } = await inviteTo(t, "ord-482-junior")
    await t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [], answers: ANSWERS })
    const sub = await graded(t)
    expect(await t.query(api.candidates.results, { token })).toMatchObject({ released: false })
    await owner.mutation(api.submissions.setReleased, { id: sub._id, released: true })
    const r = await t.query(api.candidates.results, { token })
    expect(r).toMatchObject({ released: true, band: sub.result!.band })
    expect(JSON.stringify(r)).not.toContain("parse_date_safe") // no answer key for live scenarios

    await expect(t.mutation(api.candidates.appeal, { token, text: "too short" })).rejects.toThrow(/at least 20/)
    await t.mutation(api.candidates.appeal, { token, text: "I did mention the SQL injection in my follow-up answer." })
    const q = await owner.query(api.reviews.queue, {})
    expect(q[0]).toMatchObject({ appeal: true })
    await owner.mutation(api.reviews.resolve, { submissionId: sub._id, note: "Checked the follow-up; score stands." })
    expect(await owner.query(api.reviews.queue, {})).toEqual([])
    expect((await t.query(api.candidates.results, { token }))!.appeal).toMatchObject({ status: "resolved", response: "Checked the follow-up; score stands." })
  })

  it("a battery gives one group link with each module in order", async () => {
    const t = makeT()
    const owner = await seedOwner(t)
    const r = await owner.mutation(api.candidates.create, { name: "Ana", batteryId: "junior-backend" })
    expect(r.groupToken).toBeTruthy()
    const g = await t.query(api.candidates.group, { groupToken: r.groupToken! })
    expect(g!.modules.map((m) => m.scenarioId)).toEqual(["ord-482-junior", "adr-031-mid"])
    expect(g!.modules.reduce((s, m) => s + m.minutes, 0)).toBeLessThanOrEqual(60)
  })
})

describe("SB-4 / CU-2 scoring configuration", () => {
  it("disabled items are not graded, and guardrails hold", async () => {
    const t = makeT()
    const { owner, token } = await inviteTo(t, "ord-482-junior")
    await owner.mutation(api.items.setEnabled, { scenarioId: "ord-482-junior", itemId: "I4", enabled: false })
    await expect(owner.mutation(api.items.setEnabled, { scenarioId: "ord-482-junior", itemId: "D1", enabled: false })).rejects.toThrow(/Decoys/)
    await owner.mutation(api.items.setEnabled, { scenarioId: "ord-482-junior", itemId: "I3", enabled: false })
    await expect(owner.mutation(api.items.setEnabled, { scenarioId: "ord-482-junior", itemId: "I2", enabled: false })).rejects.toThrow(/At least 2/)
    await expect(owner.mutation(api.items.setEmphasis, { category: "Security", multiplier: 3 })).rejects.toThrow(/between/)
    await t.mutation(api.submissions.submit, { token, verdict: "request_changes", comments: [], answers: ANSWERS })
    const r = (await graded(t)).result!
    expect(r.items.map((i) => i.id)).toEqual(["I1", "I2", "D1"])
    expect(r.configNote).toMatch(/disabled: I3, I4|disabled: I4, I3/)
  })
})

describe("SCR-3 Rasch and SM-6 four-fifths", () => {
  it("abler people get higher θ and harder items higher b", () => {
    const { theta, b, se } = rasch([
      [1, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 0], [1, 1, 0], [1, 0, 0],
    ])
    expect(theta[0]).toBeGreaterThan(theta[2])
    expect(theta[2]).toBeGreaterThan(theta[3])
    expect(b[2]).toBeGreaterThan(b[0])
    expect(se.every((x) => x > 0 && x < 1)).toBe(true)
  })

  it("flags an impact ratio under 0.8", () => {
    expect(fourFifths([{ group: "A", n: 10, passed: 5 }, { group: "B", n: 10, passed: 3 }]).pass).toBe(false)
    expect(fourFifths([{ group: "A", n: 10, passed: 5 }, { group: "B", n: 10, passed: 4 }]).pass).toBe(true)
    expect(fourFifths([{ group: "A", n: 10, passed: 5 }]).pass).toBeNull()
  })
})

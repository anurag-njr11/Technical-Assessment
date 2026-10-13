import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sign } from "../../convex/webhooks"
import { installFakeJudges, makeT, submitAndGrade, uninstallFakeJudges } from "./helpers"

beforeEach(installFakeJudges)
afterEach(() => {
  delete process.env.WEBHOOK_URL
  delete process.env.WEBHOOK_SECRET
  uninstallFakeJudges()
})

describe("ATS webhook", () => {
  it("posts a signed submission.graded event once grading finishes", async () => {
    process.env.WEBHOOK_URL = "https://ats.test/hook"
    process.env.WEBHOOK_SECRET = "s3cret"
    const fetchMock = vi.mocked(fetch)
    const t = makeT()
    const { sub } = await submitAndGrade(t, [])
    const call = fetchMock.mock.calls.find(([url]) => url === "https://ats.test/hook")
    expect(call).toBeDefined()
    const init = call![1] as { body: string; headers: Record<string, string> }
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ event: "submission.graded", submissionId: sub._id, overall: sub.result!.overall, candidate: { name: "Test Candidate" } })
    expect(body.reportUrl).toContain(`/report?id=${sub._id}`)
    expect(init.headers["X-ReviewBench-Signature"]).toBe(`sha256=${await sign("s3cret", init.body)}`)
  })

  it("sends nothing without WEBHOOK_URL", async () => {
    const t = makeT()
    await submitAndGrade(t, [])
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("ats.test"))).toBe(false)
  })
})

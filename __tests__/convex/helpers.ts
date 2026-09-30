import { convexTest } from "convex-test"
import { vi } from "vitest"
import schema from "../../convex/schema"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

export function makeT() {
  return convexTest(schema, import.meta.glob("../../convex/**/*.*s"))
}
export type T = ReturnType<typeof makeT>

/*
 * Deterministic fake judge panel. Each judge "identifies" an issue when the
 * candidate comment contains that issue's keyword, and quotes that keyword as
 * evidence. Behaviour can be overridden per model to simulate failures.
 * It is keyword-based on purpose: it tests the pipeline's mechanics, not the
 * judgement of real models (that is what the live evaluation runs are for).
 */
const KEYWORDS: Array<[RegExp, string, string]> = [
  [/parse_date_safe\(\), which does not exist/, "parse_date_safe", "I1"],
  [/Pagination offset is off by one/, "offset", "I2"],
  [/SQL injection/, "injection", "I3"],
  [/only asserts the status code/, "assert", "I4"],
]

export type Mode = "honest" | "fabricate" | "down" | "garbage" | "vague"
export const modes: Record<string, Mode> = {}
export const prompts: string[] = []

function between(s: string, a: string, b: string) {
  const i = s.indexOf(a)
  const j = s.indexOf(b, i + a.length)
  return i === -1 || j === -1 ? "" : s.slice(s.indexOf(">", i) + 1, j).trim()
}

function fakeJudge(model: string, prompt: string) {
  const mode = modes[model] ?? "honest"
  if (mode === "down") return new Response("unavailable", { status: 503 })
  if (mode === "garbage") return chat("I think it's fine!")

  const comment = between(prompt, "<candidate_comment", "</candidate_comment>")
  const lc = comment.toLowerCase()
  let answer: Record<string, unknown>

  if (prompt.includes("Answer-key issue")) {
    const header = prompt.split("<candidate_comment")[0]
    const kw = KEYWORDS.find(([title]) => title.test(header))?.[1] ?? "@@none@@"
    const hit = mode !== "vague" && lc.includes(kw)
    answer = {
      identifies_issue: hit,
      states_impact: hit && /crash|skip|attack|inject|wrong/.test(lc),
      proposes_fix: hit && /should|use |fix/.test(lc),
      evidence: hit ? (mode === "fabricate" ? "a quote the candidate never wrote" : kw) : "",
    }
  } else if (prompt.includes("INTENTIONAL")) {
    const hit = lc.includes("cap")
    answer = { objects_to_behavior: hit, evidence: hit ? "cap" : "" }
  } else {
    const kw = KEYWORDS.find(([, k]) => lc.includes(k))
    answer = {
      matches_item_id: kw ? kw[2] : null,
      classification: kw ? "matched" : "nitpick",
      evidence: comment.split(/\s+/).slice(0, 3).join(" "),
    }
  }
  return chat("```json\n" + JSON.stringify(answer) + "\n```")
}

const chat = (content: string) => Response.json({ choices: [{ message: { content } }] })

export function installFakeJudges() {
  for (const k of Object.keys(modes)) delete modes[k]
  prompts.length = 0
  process.env.LLM_BASE_URL = "https://llm.test/v1"
  process.env.LLM_API_KEY = "test-key"
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { model: string; messages: Array<{ content: string }> }
      prompts.push(body.messages[1].content)
      return fakeJudge(body.model, body.messages[1].content)
    }),
  )
  vi.useFakeTimers()
}

export function uninstallFakeJudges() {
  vi.useRealTimers()
  vi.unstubAllGlobals()
}

export async function seedUser(t: T, email: string, verified = true) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { email, ...(verified ? { emailVerificationTime: Date.now() } : {}) }),
  )
}

export async function seedOwner(t: T, email = "owner@acme.com") {
  const owner = await seedUser(t, email)
  await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
  return t.withIdentity({ subject: owner })
}

export type C = { id: string; file: string; line: number; severity: "critical" | "high" | "medium" | "low"; text: string }

/** Owner invites a candidate; returns the token and candidate id. */
export async function invite(t: T, name = "Test Candidate", extra: { email?: string; extraMinutes?: number } = {}) {
  const owner = await seedOwner(t)
  const { id, token } = await owner.mutation(api.candidates.create, { name, scenarioId: "ord-482-junior", ...extra })
  return { owner, id: id as Id<"candidates">, token }
}

export const ANSWERS = ["a", "b", "c"]

export async function submitAndGrade(
  t: T,
  comments: C[],
  verdict: "approve" | "request_changes" = "request_changes",
  name = "Test Candidate",
) {
  const { owner, token } = await invite(t, name)
  await t.mutation(api.candidates.start, { token })
  await t.mutation(api.submissions.submit, { token, verdict, comments, answers: ANSWERS })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const sub = await t.run(async (ctx) => (await ctx.db.query("submissions").first())!)
  return { sub, result: sub.result!, owner }
}

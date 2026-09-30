// M3 · Directed Build (spec §7.3), pilot. Server-only: the scripted assistant,
// its planted faults and the hidden checks never ship to the browser.
//
// The assistant is deterministic: prompts are matched to scripted responses,
// and a few responses carry planted faults, so every candidate faces the same
// faults. Faults the candidate never triggers are "not exposed" and excluded.

import { SCENARIOS } from "../src/lib/scenario"
import { WEIGHTS, band } from "./scoring"
import type { ItemResult, Result } from "./scoring"

export type BuildEvent = { id: string; t: number; type: string; data?: string; tokens?: { input: number; output: number } }

export type Fault = {
  id: string
  title: string
  category: string
  severity: "critical" | "high" | "medium" | "low"
  weight: number
  /** True when the fault is still present in the final code. */
  present: (code: string) => boolean
}

export const BUILD_FAULTS: Record<string, Fault[]> = {
  "disc-12-build": [
    {
      id: "F1", title: "Minimum-order check uses > 50 instead of >= 50", category: "Correctness", severity: "high", weight: 3,
      present: (c) => /subtotal\s*>\s*50(?![\d.])/.test(c) || !/subtotal\s*(>=\s*50|<\s*50)(?![\d.])/.test(c),
    },
    {
      id: "F2", title: "Calls cart.getSubtotalAfterTax(), which does not exist", category: "Hallucination", severity: "high", weight: 3,
      present: (c) => /getSubtotalAfterTax/.test(c),
    },
    {
      id: "F3", title: "Code lookup is case-sensitive", category: "Edge cases", severity: "medium", weight: 2,
      present: (c) => !/to(Upper|Lower)Case\s*\(/.test(c),
    },
  ],
  "orders-api-build": [
    {
      id: "F1", title: "Search text is concatenated into the SQL (SQL injection)", category: "Security", severity: "critical", weight: 4,
      present: (c) => /\$\{\s*query\b|['"`]\s*\+\s*query\b|\bquery\s*\+\s*['"`]/.test(c),
    },
    {
      id: "F2", title: "No user_id filter, so any user can read everyone's orders (IDOR)", category: "Security", severity: "critical", weight: 4,
      present: (c) => !/user_id\s*=\s*(\?|\$\d)/i.test(c),
    },
    {
      id: "F3", title: "Calls db.queryParams(), which does not exist", category: "Hallucination", severity: "high", weight: 3,
      present: (c) => /\.queryParams\s*\(/.test(c),
    },
    {
      id: "F4", title: "No LIMIT, so a broad search returns millions of rows", category: "Performance", severity: "medium", weight: 2,
      present: (c) => !/\bLIMIT\b/i.test(c),
    },
  ],
}

/**
 * Candidate-visible task text, for the live assistant and trajectory judges:
 * the ticket for builds; the ticket, diff and the agent's rationale for code reviews.
 */
export function buildTask(scenarioId: string): string {
  const s = SCENARIOS[scenarioId]
  if (s?.kind === "build") {
    return [s.title, s.summary, "Requirements:", ...s.criteria.map((c) => `- ${c}`), "API reference:", ...s.apiReference.map((a) => `- ${a}`)].join("\n")
  }
  if (s?.kind === "code") {
    const diff = s.files.flatMap((f) => [`--- ${f.path}`, ...f.lines.map((l) => `${l.kind === "add" ? "+" : " "}${l.n}: ${l.code}`)])
    return [
      `${s.ticketId}: ${s.title}`, s.summary, "Acceptance criteria:", ...s.criteria.map((c) => `- ${c}`),
      "Diff:", ...diff, "Your rationale:", s.rationale, "Your reasoning behind the changes:", ...s.assumptions.map((a) => `- ${a}`),
    ].join("\n")
  }
  return ""
}

export type Script = { intent: RegExp; text: string; code: string; fault?: string }

const SCRIPTS: Record<string, Script[]> = {
  "disc-12-build": [
    {
      intent: /minimum|threshold|\b50\b|eligib|at least|small order/,
      fault: "F1",
      text: "Only apply the discount when the order is large enough:",
      code: `if (cart.subtotal > 50) {
  total = discounted
} else {
  total = cart.subtotal
}`,
    },
    {
      intent: /tax|subtotal|base total|compute the total/,
      fault: "F2",
      text: "Start from the cart's subtotal after tax, then apply the code:",
      code: `const base = cart.getSubtotalAfterTax()`,
    },
    {
      intent: /round|cent|negative|below 0|below zero|floor|clamp/,
      text: "Clamp at zero and round to cents:",
      code: `return Math.max(0, Math.round(total * 100) / 100)`,
    },
    {
      intent: /invalid|unknown|throw|error/,
      text: "Reject unknown codes:",
      code: `if (!rule) throw new Error("Invalid code")`,
    },
    {
      intent: /test|example|check|verify/,
      text: "A few quick checks you can run:",
      code: `console.assert(applyDiscount({ subtotal: 100, items: [] }, "SAVE10") === 90)
console.assert(applyDiscount({ subtotal: 60, items: [] }, "flat5") === 55)
console.assert(applyDiscount({ subtotal: 40, items: [] }, "SAVE10") === 40)`,
    },
    {
      intent: /code table|codes|map|flat|save10|percent/,
      text: "A table of discount rules keeps this easy to extend:",
      code: `const CODES = {
  SAVE10: (total) => total * 0.9,
  FLAT5: (total) => total - 5,
}`,
    },
    {
      intent: /implement|write|function|applydiscount|whole|full|start/,
      fault: "F3",
      text: "Here is a complete implementation:",
      code: `const CODES = {
  SAVE10: (total) => total * 0.9,
  FLAT5: (total) => total - 5,
}

export function applyDiscount(cart, code) {
  const rule = CODES[code]
  if (!rule) throw new Error("Invalid code")
  if (cart.subtotal < 50) return cart.subtotal
  return Math.max(0, Math.round(rule(cart.subtotal) * 100) / 100)
}`,
    },
  ],
  "orders-api-build": [
    {
      intent: /inject|escap|placeholder|parameteri|bind|sanitiz|safe/,
      fault: "F3",
      text: "Use the driver's named-parameter helper so the search text is escaped for you:",
      code: `const rows = await db.queryParams(
  "SELECT * FROM orders WHERE user_id = :userId AND description LIKE :q ORDER BY created_at DESC LIMIT 50",
  { userId, q: \`%\${query}%\` },
)`,
    },
    {
      intent: /limit|page|paginat|how many|max|too many|large/,
      text: "Cap the result size so a broad search stays cheap:",
      code: `ORDER BY created_at DESC LIMIT 50`,
    },
    {
      intent: /owner|own |belong|user_?id|auth|permission|access|other users/,
      text: "Scope the query to the signed-in user with a bound parameter:",
      code: `WHERE user_id = ?`,
    },
    {
      intent: /newest|sort|order by|recent|latest|created_at/,
      fault: "F4",
      text: "Sort newest first:",
      code: `const rows = await db.query(
  "SELECT * FROM orders WHERE user_id = ? AND description LIKE ? ORDER BY created_at DESC",
  [userId, \`%\${query}%\`],
)
return rows`,
    },
    {
      intent: /\bsearch\b|\blike\b|match|contain|filter|keyword|text|description/,
      fault: "F1",
      text: "Match the search text anywhere in the description with LIKE:",
      code: `const sql = \`SELECT * FROM orders WHERE user_id = ? AND description LIKE '%\${query}%' ORDER BY created_at DESC LIMIT 50\`
return db.query(sql, [userId])`,
    },
    {
      intent: /test|example|check|verify/,
      text: "A quick check with a fake db:",
      code: `const db = { query: async (sql, params) => { console.log(sql, params); return [] } }
await searchOrders(db, "u1", "mug")`,
    },
    {
      intent: /implement|write|function|searchorders|whole|full|start|handler/,
      fault: "F2",
      text: "Here is a complete implementation:",
      code: `export async function searchOrders(db, userId, query) {
  return db.query(
    "SELECT * FROM orders WHERE description LIKE ? ORDER BY created_at DESC LIMIT 50",
    [\`%\${query}%\`],
  )
}`,
    },
  ],
}

/** Minimum behaviour a submission must show to count as complete. */
const COMPLETE: Record<string, (code: string) => boolean> = {
  "disc-12-build": (code) =>
    /function\s+applyDiscount|applyDiscount\s*=/.test(code) &&
    /SAVE10/i.test(code) && /FLAT5/i.test(code) && /Invalid code/.test(code) && /Math\.round/.test(code),
  "orders-api-build": (code) =>
    /function\s+searchOrders|searchOrders\s*=/.test(code) &&
    /db\.query\s*\(/.test(code) && /\bLIKE\b/i.test(code) && /ORDER\s+BY\s+created_at\s+DESC/i.test(code),
}

const FALLBACK: Script = {
  intent: /.*/,
  text: "Could you say which part of the ticket you'd like help with?",
  code: "",
}

export function assistantReply(scenarioId: string, prompt: string): Script {
  const p = prompt.toLowerCase()
  return (SCRIPTS[scenarioId] ?? []).find((s) => s.intent.test(p)) ?? FALLBACK
}

/** Deterministic M3 grade: faults caught, calibrated trust, testing, instructions, completion. */
export function gradeBuild(scenarioId: string, code: string, events: BuildEvent[]): Result {
  const faults = BUILD_FAULTS[scenarioId] ?? []
  const exposed = new Set(events.filter((e) => e.type === "fault_injected").map((e) => e.data?.split("|")[0]))
  const items: ItemResult[] = faults.map((f) => ({
    id: f.id,
    kind: "issue",
    title: f.title,
    category: f.category,
    severity: f.severity,
    weight: f.weight,
    outcome: !exposed.has(f.id) ? "not_exposed" : f.present(code) ? "missed" : "found",
    explanation: null,
    commentText: null,
    commentLine: null,
    commentFile: null,
    split: false,
    votes: [],
  }))

  const exposedItems = items.filter((i) => i.outcome !== "not_exposed")
  const exposedWeight = exposedItems.reduce((s, i) => s + i.weight, 0)
  const caughtWeight = exposedItems.filter((i) => i.outcome === "found").reduce((s, i) => s + i.weight, 0)
  const detection = exposedWeight ? caughtWeight / exposedWeight : 1

  // Calibrated trust: accepting correct suggestions is good; blanket distrust is not.
  const hasCode = (d?: string) => {
    try {
      return !!(JSON.parse(d ?? "{}") as { code?: string }).code
    } catch {
      return false
    }
  }
  const faulty = new Set(events.filter((e) => e.type === "fault_injected").map((e) => e.data?.split("|")[1]).filter(Boolean))
  const correctOffered = events.filter((e) => e.type === "ai_response" && !faulty.has(e.id) && hasCode(e.data)).map((e) => e.id)
  const accepted = new Set(events.filter((e) => e.type === "accept_suggestion").map((e) => e.data))
  const trust = correctOffered.length ? correctOffered.filter((id) => accepted.has(id)).length / correctOffered.length : 1

  const testRuns = events.filter((e) => e.type === "test_run").length
  const prompts = events.filter((e) => e.type === "ai_prompt").map((e) => e.data ?? "")
  const goodPrompts = prompts.filter((p) => p.trim().split(/\s+/).length >= 6).length
  const instructions = prompts.length ? goodPrompts / prompts.length : 0
  const complete = COMPLETE[scenarioId]?.(code) ?? false

  const values = {
    detection,
    precision: trust,
    decoyDiscipline: testRuns > 0 ? 1 : 0,
    explanationQuality: instructions,
    verdict: complete ? 1 : 0,
  }
  let overall = 0
  for (const k of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) overall += WEIGHTS[k] * values[k]
  overall = Math.round(100 * overall)

  const reviewReasons = exposedItems.length === 0 ? ["No planted faults were exposed: the candidate used the assistant too little to assess"] : []
  return {
    overall,
    band: band(overall),
    weights: { ...WEIGHTS },
    components: {
      detection: { value: detection, detail: exposedItems.length ? `${caughtWeight} / ${exposedWeight} pts of exposed faults fixed` : "No faults exposed" },
      precision: { value: trust, detail: `${correctOffered.filter((id) => accepted.has(id)).length} / ${correctOffered.length} correct suggestions used` },
      decoyDiscipline: { value: values.decoyDiscipline, detail: `${testRuns} test run(s)` },
      explanationQuality: { value: instructions, detail: `${goodPrompts} / ${prompts.length} specific prompts (heuristic)` },
      verdict: { value: values.verdict, detail: complete ? "All required behaviour present" : "Required behaviour missing" },
    },
    items,
    extraComments: [],
    commentClasses: [],
    foundCount: items.filter((i) => i.outcome === "found").length,
    issueCount: exposedItems.length,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    judges: [],
    versions: { rubric: "rubric-m3-pilot-2026-09-30", prompt: "scripted-assistant-v1", scoring: "scoring-m3-pilot", scenario: 1 },
    modelsUsed: [],
    callCount: 0,
    gradedAt: Date.now(),
  }
}

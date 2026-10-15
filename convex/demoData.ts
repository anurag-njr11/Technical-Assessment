// Seed candidates for the public demo workspace. Their work is authored here;
// their grades are NOT: seeding sends each one through the real grading
// pipeline (judge council, evidence checks, trajectory council), so the demo
// shows genuine output of the current panel.
//
// Personas are chosen to show the range a recruiter cares about: a strong
// reviewer who challenges the AI with evidence, an over-trusting one, a solid
// one with a false alarm, a decision critic and two builders.

import { assistantReply } from "./buildScenario"

type Severity = "critical" | "high" | "medium" | "low"
type Comment = { id: string; file: string; line: number; severity: Severity; text: string }
type Event = { id: string; t: number; type: "ai_prompt" | "ai_response" | "fault_injected" | "accept_suggestion" | "reject_suggestion" | "test_run" | "code_edit"; data?: string; tokens?: { input: number; output: number } }

export type Persona = {
  name: string
  email: string
  scenarioId: string
  /** Minutes before seeding that the attempt started, and how long it took. */
  startedAgoMin: number
  tookMin: number
  verdict?: "approve" | "request_changes"
  comments: Comment[]
  answers: string[]
  events: Event[]
  code?: string
}

const MIN = 60_000
const tok = (prompt: string, reply: string) => ({ input: 1400 + Math.ceil(prompt.length / 4), output: Math.ceil(reply.length / 4) })

/** A chat in alternating [candidate, agent] turns, one minute apart from `fromMin`. */
function chat(turns: Array<[string, string]>, fromMin = 3): Event[] {
  return turns.flatMap(([q, a], i) => [
    { id: `e${2 * i}`, t: (fromMin + i) * MIN, type: "ai_prompt" as const, data: q },
    { id: `e${2 * i + 1}`, t: (fromMin + i) * MIN + 9000, type: "ai_response" as const, data: JSON.stringify({ text: a, code: "", model: "seed" }), tokens: tok(q, a) },
  ])
}

/** A Directed Build trajectory: scripted assistant replies (with their planted faults) exactly as a live session records them. */
function build(scenarioId: string, steps: Array<{ prompt?: string; edit?: string; tests?: string; accept?: boolean; reject?: boolean }>): Event[] {
  const out: Event[] = []
  let t = 2 * MIN
  let lastResponse = ""
  for (const s of steps) {
    t += 90_000
    if (s.prompt) {
      const r = assistantReply(scenarioId, s.prompt)
      out.push({ id: `e${out.length}`, t, type: "ai_prompt", data: s.prompt })
      lastResponse = `e${out.length}`
      out.push({ id: lastResponse, t: t + 7000, type: "ai_response", data: JSON.stringify({ text: r.text, code: r.code, model: "scripted" }), tokens: tok(s.prompt, r.text + r.code) })
      if (r.fault) out.push({ id: `e${out.length}`, t: t + 7000, type: "fault_injected", data: `${r.fault}|${lastResponse}` })
    }
    if (s.accept) out.push({ id: `e${out.length}`, t: t + 20_000, type: "accept_suggestion", data: lastResponse })
    if (s.reject) out.push({ id: `e${out.length}`, t: t + 20_000, type: "reject_suggestion", data: lastResponse })
    if (s.edit) out.push({ id: `e${out.length}`, t: t + 40_000, type: "code_edit", data: s.edit })
    if (s.tests) out.push({ id: `e${out.length}`, t: t + 60_000, type: "test_run", data: s.tests })
  }
  return out
}

const R = "payments/refunds.py"

const DISC_FINAL = `const CODES = {
  SAVE10: (total) => total * 0.9,
  FLAT5: (total) => total - 5,
}

export function applyDiscount(cart, code) {
  const rule = CODES[String(code).toUpperCase()]
  if (!rule) throw new Error("Invalid code")
  if (cart.subtotal < 50) return cart.subtotal
  return Math.max(0, Math.round(rule(cart.subtotal) * 100) / 100)
}
`

export const PERSONAS: Persona[] = [
  {
    name: "Priya Raman",
    email: "priya.raman@example.com",
    scenarioId: "pay-217-mid",
    startedAgoMin: 300,
    tookMin: 31,
    verdict: "request_changes",
    comments: [
      { id: "p1", file: R, line: 24, severity: "high", text: "gateway.refund() doesn't exist: payments/gateway.py only defines issue_refund(charge_id, amount_cents). This raises AttributeError on every refund. Use gateway.issue_refund(payment.gateway_ref, amount)." },
      { id: "p2", file: R, line: 13, severity: "critical", text: "Nothing checks that g.merchant owns this payment. require_auth only authenticates the API key (see its docstring), so any merchant can refund any payment ID. Add `if payment.merchant_id != g.merchant.id: abort(404)`." },
      { id: "p3", file: R, line: 16, severity: "high", text: "This compares against the original amount but ignores refunded_total, so two partial refunds of 80 on a 100 payment both pass and we pay out 160. Check amount <= payment.amount - payment.refunded_total and update refunded_total in the same transaction." },
      { id: "p4", file: R, line: 26, severity: "high", text: "Logs the full card number (PAN). That puts our logs in PCI scope and leaks card data to anyone with log access. Log the payment id or last four digits only." },
      { id: "p5", file: R, line: 15, severity: "medium", text: "body[\"amount\"] is trusted as-is: a missing key gives a 500 and zero or negative amounts go straight to the gateway. Validate it's a positive integer and return 400 otherwise, as the ticket requires." },
      { id: "p6", file: R, line: 25, severity: "medium", text: "The gateway is called before commit with no error handling: if the commit fails after the gateway succeeds we've refunded money with no record; if the gateway raises, the session is left dirty. Commit a pending refund first, then call the gateway and mark it complete, or wrap both and handle GatewayError." },
    ],
    answers: [
      "The missing ownership check: any authenticated merchant can drain refunds from other merchants' payments. That's direct financial loss and a trust incident, and it's exploitable today without any race.",
      "Unit tests: two partial refunds that together exceed the payment must fail the second; zero, negative and missing amounts return 400; another merchant's payment returns 404. Then a retry test: same Idempotency-Key twice returns the same refund and calls the gateway once (mock the client and assert call count).",
      "Before refunding, load the payment scoped to g.merchant and return 404 if it belongs to someone else, and reject any amount above payment.amount - payment.refunded_total; add tests for both.",
    ],
    events: chat([
      ["You call gateway.refund(), but payments/gateway.py only has charge() and issue_refund(). Where is refund() defined?", "You're right, I was wrong there: GatewayClient has no refund() method, so line 24 would raise AttributeError. It should be gateway.issue_refund(payment.gateway_ref, amount)."],
      ["Your notes say callers are authorized upstream by @require_auth. Its docstring says it doesn't check who owns a resource. So what stops merchant A refunding merchant B's payment?", "Nothing in this handler does. require_auth only identifies the merchant, so I need to compare payment.merchant_id with g.merchant.id and return 404 when they differ."],
      ["Does `amount > payment.amount` stop over-refunding across several partial refunds?", "No. It ignores refunded_total, so repeated partial refunds can exceed the payment. The check should use the remaining refundable amount and update refunded_total atomically."],
    ]),
  },
  {
    name: "Marcus Lee",
    email: "marcus.lee@example.com",
    scenarioId: "pay-217-mid",
    startedAgoMin: 240,
    tookMin: 12,
    verdict: "approve",
    comments: [
      { id: "m1", file: R, line: 22, severity: "low", text: "Nit: could rename `refund` to `new_refund` for readability." },
    ],
    answers: [
      "Probably the idempotency handling, if it was wrong customers could get double refunds.",
      "I would test the happy path and maybe one retry.",
      "Make sure it is well tested.",
    ],
    events: chat([
      ["Is this PR ready to merge?", "Yes. It adds the refund endpoint next to the existing payment routes, reuses the auth decorator and gateway client, and handles idempotent retries."],
      ["ok and the auth is handled by the decorator right?", "Yes, @require_auth runs before the handler, so callers are already authorized."],
      ["great, thanks", "You're welcome. Let me know if you'd like any changes."],
    ]),
  },
  {
    name: "Lena Fischer",
    email: "lena.fischer@example.com",
    scenarioId: "pay-217-mid",
    startedAgoMin: 180,
    tookMin: 27,
    verdict: "request_changes",
    comments: [
      { id: "l1", file: R, line: 24, severity: "high", text: "There is no refund() on the gateway client, only issue_refund(). This will crash at runtime." },
      { id: "l2", file: R, line: 26, severity: "high", text: "Don't log card_number; that's the full PAN. Log the payment id instead." },
      { id: "l3", file: R, line: 12, severity: "critical", text: "We never check the payment belongs to the calling merchant, so this is an IDOR: any merchant can refund any payment." },
      { id: "l4", file: R, line: 21, severity: "medium", text: "Returning 200 with the old refund on a repeated Idempotency-Key hides a client bug. This should be a 409 Conflict." },
    ],
    answers: [
      "The IDOR on refunds, because it lets one merchant move another merchant's money.",
      "Test ownership (403/404 for someone else's payment), the crash on gateway.refund, and that card numbers never appear in logs.",
      "Check that g.merchant owns the payment before doing anything else.",
    ],
    events: chat([
      ["Why do we need to log the card number at all?", "It helps support match refunds to customer complaints, and our logs are internal."],
      ["Internal logs are still in PCI scope if they contain PANs. Can you log only the last four digits?", "Good point: storing full PANs in logs expands PCI scope. Logging the payment id and last four digits is enough for support."],
    ]),
  },
  {
    name: "Sam Okoye",
    email: "sam.okoye@example.com",
    scenarioId: "adr-031-mid",
    startedAgoMin: 150,
    tookMin: 18,
    verdict: "request_changes",
    comments: [],
    answers: [
      "The 3x vendor benchmark isn't our workload: it's a vendor's synthetic test, not joined order-history reads on 2.1M rows, so it can't predict our latency. And nobody has profiled the 180 ms, so 'joins are the problem' is a guess; it could be a missing index, N+1 queries or the network.",
      "Finance runs nightly SQL reports straight against this database, and MongoDB would break them. No one on the team has run MongoDB in production, there's no headcount, and SOC 2 needs documented backups and access controls for a new datastore next quarter. There's also no migration plan that fits the 5-minute downtime limit.",
      "Profile the history query first (EXPLAIN ANALYZE, check for N+1). Add the composite index on (customer_id, created_at), which the ADR itself suggests, and measure again. Only if that fails, consider a read model or cache in front of Postgres. Keep the archive-after-7-years idea; it's sound.",
    ],
    events: chat([
      ["Where does the 3x benchmark come from, and was it measured on a workload like our order-history query?", "It's from the vendor's published benchmark of document reads. It wasn't run on our schema or queries."],
      ["Has anyone profiled the 180 ms p95 to show the joins are the bottleneck?", "Not yet. I inferred it from the number of joins; it should be profiled before deciding."],
    ], 4),
  },
  {
    name: "Jordan Park",
    email: "jordan.park@example.com",
    scenarioId: "disc-12-build",
    startedAgoMin: 120,
    tookMin: 24,
    comments: [],
    answers: [],
    code: DISC_FINAL,
    events: build("disc-12-build", [
      { prompt: "Please write the full applyDiscount function for this ticket", accept: true },
      { prompt: "Is the code lookup case sensitive? The ticket says save10 should work too", edit: DISC_FINAL.replace("String(code).toUpperCase()", "code") },
      { edit: DISC_FINAL, tests: "3/4 passed" },
      { prompt: "Should I compute the total from the subtotal after tax?", reject: true },
      { tests: "4/4 passed" },
    ]),
  },
  {
    name: "Alex Chen",
    email: "alex.chen@example.com",
    scenarioId: "ord-482-junior",
    startedAgoMin: 90,
    tookMin: 34,
    verdict: "request_changes",
    comments: [
      { id: "a1", file: "orders/views.py", line: 20, severity: "high", text: "parse_date_safe isn't defined anywhere in utils, so this will crash with a NameError. Use parse_iso_date, which exists." },
      { id: "a2", file: "orders/views.py", line: 16, severity: "medium", text: "Pagination offset is off by one: page 1 skips the first per_page orders. It should be (page - 1) * per_page." },
      { id: "a3", file: "orders/views.py", line: 12, severity: "low", text: "Maybe add a docstring to this view." },
    ],
    answers: [
      "I'd check the parameters are validated and passed safely to the query.",
      "Test date filtering with valid and invalid dates and check the right orders come back.",
      "Use the existing parse_iso_date helper instead of parse_date_safe.",
    ],
    events: chat([
      ["What does parse_date_safe do?", "It parses the date string into a date and returns None if it is invalid."],
      ["I can't find it in utils/dates.py. Is it defined somewhere else?", "You're right, it isn't defined in the codebase. utils/dates.py has parse_iso_date, which raises on invalid input."],
    ]),
  },
]

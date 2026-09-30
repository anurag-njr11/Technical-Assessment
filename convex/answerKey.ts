// Server-only answer keys. Never import this file from src/ — the answer key
// must not ship in the candidate's browser bundle.

export type Severity = "critical" | "high" | "medium" | "low"

export type KeyItem = {
  id: string
  kind: "issue" | "decoy"
  title: string
  category: string
  severity: Severity | "none"
  /** Detection points. Decoys carry 0. */
  weight: number
  file: string
  lineStart: number
  lineEnd: number
  description: string
  acceptableFix: string
}

export type AnswerKey = {
  scenarioId: string
  expectedVerdict: "approve" | "request_changes"
  items: KeyItem[]
}

// Server-side scenario facts the backend needs without trusting the client
// (SC-9 version, time limit, level). Must match src/lib/scenario.ts; a test
// enforces that.
export type ScenarioKind = "code" | "decision" | "build"
export type ScenarioMeta = {
  kind: ScenarioKind
  title: string
  version: number
  level: string
  minutes: number
  followUps: string[]
  /** TR-4: the answer key may be shown to candidates only once a scenario is retired. */
  retired?: boolean
}

export const SCENARIO_META: Record<string, ScenarioMeta> = {
  "ord-482-junior": {
    kind: "code",
    title: "ORD-482 · Pagination & date filtering (Code Review, Junior)",
    version: 1,
    level: "Junior",
    minutes: 40,
    followUps: [
      "What would you verify before approving any change that builds a database query from request parameters?",
      "What would you test before merging the date-filter change, beyond what is already in the test file?",
      "If you had to give the AI agent one instruction to fix the most serious problem you found, what would you tell it?",
    ],
  },
  "pay-217-mid": {
    kind: "code",
    title: "PAY-217 · Partial refunds (Code Review, Mid)",
    version: 1,
    level: "Mid",
    minutes: 35,
    followUps: [
      "Which problem in this PR could cost the company money or trust soonest, and why?",
      "How would you test that refunds are safe to retry and never exceed the payment?",
      "What single instruction would you give the AI agent to fix the most serious problem?",
    ],
  },
  "adr-031-mid": {
    kind: "decision",
    title: "ADR-031 · Postgres to MongoDB (Decision Review, Mid)",
    version: 1,
    level: "Mid",
    minutes: 20,
    followUps: [
      "Which claims or assumptions in the recommendation are flawed, and why?",
      "Which constraints, costs or risks does it ignore?",
      "What would you recommend instead, and what would you check first?",
    ],
  },
  "disc-12-build": {
    kind: "build",
    title: "DISC-12 · Discount codes (Directed Build pilot)",
    version: 1,
    level: "All levels",
    minutes: 30,
    followUps: [],
  },
  "orders-api-build": {
    kind: "build",
    title: "ORD-519 · Order search (Directed Build, Mid)",
    version: 1,
    level: "Mid",
    minutes: 35,
    followUps: [],
  },
}

// CU-1 / CU-3: role-and-level batteries, each within the 60-minute cap.
export const BATTERIES: Record<string, { name: string; scenarioIds: string[] }> = {
  "junior-backend": { name: "Junior Backend (Code Review + Decision Review)", scenarioIds: ["ord-482-junior", "adr-031-mid"] },
  "mid-backend": { name: "Mid Backend (Code Review + Decision Review)", scenarioIds: ["pay-217-mid", "adr-031-mid"] },
  "ai-collaboration": { name: "AI collaboration (Directed Build + Code Review)", scenarioIds: ["disc-12-build", "ord-482-junior"] },
}

/**
 * Server-only: which of the agent's stated assumptions (src/lib/scenario.ts,
 * same index order) are wrong, and the answer-key item each one hides.
 * A test keeps the lengths in sync.
 */
export const ASSUMPTION_KEYS: Record<string, Array<{ flawed: boolean; itemId: string }>> = {
  "ord-482-junior": [
    { flawed: true, itemId: "I1" },
    { flawed: true, itemId: "I2" },
    { flawed: true, itemId: "I3" },
    { flawed: true, itemId: "I4" },
    { flawed: false, itemId: "D1" },
  ],
  "pay-217-mid": [
    { flawed: true, itemId: "I3" },
    { flawed: true, itemId: "I1" },
    { flawed: true, itemId: "I5" },
    { flawed: true, itemId: "I2" },
    { flawed: true, itemId: "I4" },
    { flawed: true, itemId: "I6" },
    { flawed: false, itemId: "D1" },
  ],
}

/** M2 answer-key items all refer to the single combined critique. */
const DECISION_FILE = "decision.md"

export const ANSWER_KEYS: Record<string, AnswerKey> = {
  "ord-482-junior": {
    scenarioId: "ord-482-junior",
    expectedVerdict: "request_changes",
    items: [
      {
        id: "I1",
        kind: "issue",
        title: "Calls utils.parse_date_safe(), which does not exist",
        category: "Hallucination",
        severity: "high",
        weight: 3,
        file: "orders/views.py",
        lineStart: 20,
        lineEnd: 22,
        description:
          "The AI invented a helper. utils/dates.py only defines parse_iso_date(). Any request with a date filter crashes with AttributeError.",
        acceptableFix:
          "Use the existing utils.dates.parse_iso_date() (or datetime.fromisoformat) and return 400 on invalid input.",
      },
      {
        id: "I2",
        kind: "issue",
        title: "Pagination offset is off by one page",
        category: "Correctness",
        severity: "high",
        weight: 3,
        file: "orders/views.py",
        lineStart: 16,
        lineEnd: 16,
        description:
          "offset = page * per_page with 1-based pages means page 1 skips the first per_page results.",
        acceptableFix: "offset = (page - 1) * per_page, and reject page < 1.",
      },
      {
        id: "I3",
        kind: "issue",
        title: "Date filter builds SQL with an f-string (SQL injection)",
        category: "Security",
        severity: "critical",
        weight: 4,
        file: "orders/views.py",
        lineStart: 23,
        lineEnd: 24,
        description:
          "start_date / end_date come from the query string and are interpolated directly into SQL, allowing injection.",
        acceptableFix:
          "Use parameterized queries (placeholders with bound values) or the ORM; never interpolate request input into SQL.",
      },
      {
        id: "I4",
        kind: "issue",
        title: "New test only asserts the status code",
        category: "Test quality",
        severity: "medium",
        weight: 2,
        file: "orders/tests.py",
        lineStart: 1,
        lineEnd: 3,
        description:
          "The test would pass even with the off-by-one bug; it never checks returned items, page boundaries, or date filtering.",
        acceptableFix:
          "Assert on returned order IDs for page 1 and 2, the per_page cap, and date-range filtering.",
      },
      {
        id: "D1",
        kind: "decoy",
        title: "per_page silently capped at 100 (intentional, per the ticket)",
        category: "Decoy",
        severity: "none",
        weight: 0,
        file: "orders/views.py",
        lineStart: 15,
        lineEnd: 15,
        description:
          "The ticket explicitly requires capping per_page at 100. This is correct behavior, not a defect.",
        acceptableFix: "No change needed.",
      },
    ],
  },
  "pay-217-mid": {
    scenarioId: "pay-217-mid",
    expectedVerdict: "request_changes",
    items: [
      {
        id: "I1", kind: "issue", title: "No check that the caller owns the payment", category: "Security", severity: "critical", weight: 4,
        file: "payments/refunds.py", lineStart: 12, lineEnd: 13,
        description: "require_auth only authenticates the merchant; nothing checks payment.merchant_id == g.merchant.id, so any merchant can refund any other merchant's payment.",
        acceptableFix: "Return 404/403 unless payment.merchant_id matches g.merchant.id (or scope the query by merchant).",
      },
      {
        id: "I2", kind: "issue", title: "Ignores refunds already made, so total refunds can exceed the payment", category: "Correctness", severity: "high", weight: 3,
        file: "payments/refunds.py", lineStart: 16, lineEnd: 17,
        description: "The limit compares against payment.amount instead of payment.amount - payment.refunded_total, so repeated partial refunds can refund more than was paid.",
        acceptableFix: "Check amount <= payment.amount - payment.refunded_total and update refunded_total in the same transaction.",
      },
      {
        id: "I3", kind: "issue", title: "Calls gateway.refund(), which does not exist", category: "Hallucination", severity: "high", weight: 3,
        file: "payments/refunds.py", lineStart: 24, lineEnd: 24,
        description: "GatewayClient only defines issue_refund(charge_id, amount_cents). Every refund crashes with AttributeError after the refund row was added.",
        acceptableFix: "Call gateway.issue_refund(payment.gateway_ref, amount).",
      },
      {
        id: "I4", kind: "issue", title: "Gateway call happens before the commit with no error handling", category: "Edge cases", severity: "medium", weight: 2,
        file: "payments/refunds.py", lineStart: 23, lineEnd: 25,
        description: "If the gateway fails the exception leaves no consistent record; if the commit fails after the gateway succeeded, money is refunded with no refund row, and a retry refunds again.",
        acceptableFix: "Persist a pending refund first, call the gateway inside try/except (GatewayError -> mark failed, 502), then commit the final state.",
      },
      {
        id: "I5", kind: "issue", title: "Logs the full card number", category: "Security", severity: "high", weight: 3,
        file: "payments/refunds.py", lineStart: 26, lineEnd: 26,
        description: "payment.card_number is the full PAN; writing it to logs breaks PCI DSS and leaks card data to everyone with log access.",
        acceptableFix: "Never log the PAN; log payment and refund IDs only (or the last four digits).",
      },
      {
        id: "I6", kind: "issue", title: "Amount is not validated", category: "Edge cases", severity: "medium", weight: 2,
        file: "payments/refunds.py", lineStart: 14, lineEnd: 16,
        description: "A missing amount raises KeyError (500), and zero, negative or non-integer amounts are accepted, contrary to the ticket.",
        acceptableFix: "Validate that amount is present and a positive integer; return 400 otherwise.",
      },
      {
        id: "D1", kind: "decoy", title: "Returning the existing refund for a repeated Idempotency-Key (required by the ticket)", category: "Decoy", severity: "none", weight: 0,
        file: "payments/refunds.py", lineStart: 18, lineEnd: 21,
        description: "The ticket requires repeated requests with the same Idempotency-Key to return the original refund. Returning it with 200 is correct.",
        acceptableFix: "No change needed.",
      },
    ],
  },
  "adr-031-mid": {
    scenarioId: "adr-031-mid",
    expectedVerdict: "request_changes",
    items: [
      {
        id: "F1", kind: "issue", title: "Relies on a benchmark that doesn't match the workload", category: "Correctness", severity: "high", weight: 3,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "The '3x faster' vendor benchmark measures single-document key lookups; the order-history query filters and sorts per customer, so the benchmark says nothing about this workload.",
        acceptableFix: "Benchmark the real order-history query on production-like data before choosing a datastore.",
      },
      {
        id: "F2", kind: "issue", title: "Breaks the finance team's nightly SQL reports", category: "Correctness", severity: "critical", weight: 4,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "Finance runs SQL reports directly against the database. Moving to MongoDB breaks them and the recommendation has no plan for reporting.",
        acceptableFix: "Keep reporting working: stay on Postgres, or plan a reporting replica/ETL before any migration.",
      },
      {
        id: "F3", kind: "issue", title: "Ignores operational cost and team skills", category: "Performance", severity: "high", weight: 3,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "Nobody on the team has run MongoDB in production, there is no new headcount, and SOC 2 needs documented backups and access controls for every datastore.",
        acceptableFix: "Account for on-call, backups, access control and training; prefer a solution the team can operate.",
      },
      {
        id: "F4", kind: "issue", title: "No migration plan within the 5-minute downtime limit", category: "Edge cases", severity: "high", weight: 3,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "Moving 2.1M orders with joins to customers and invoices needs dual writes, backfill, verification and rollback; none is mentioned despite the 5-minute limit.",
        acceptableFix: "Describe a staged migration (dual write, backfill, verify, cut over, rollback) or avoid migrating.",
      },
      {
        id: "F5", kind: "issue", title: "Assumes the database engine is the cause without profiling", category: "Hallucination", severity: "medium", weight: 2,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "The latency has never been profiled. It may come from a missing index, N+1 queries or the app layer, which the proposed index alone might fix.",
        acceptableFix: "Profile the endpoint (EXPLAIN ANALYZE, tracing) and try the index first.",
      },
      {
        id: "D1", kind: "decoy", title: "Composite index on orders(customer_id, created_at)", category: "Decoy", severity: "none", weight: 0,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "This index matches the order-history query and is a sound, cheap first step.",
        acceptableFix: "No change needed.",
      },
      {
        id: "D2", kind: "decoy", title: "Archiving orders older than 7 years", category: "Decoy", severity: "none", weight: 0,
        file: DECISION_FILE, lineStart: 1, lineEnd: 1,
        description: "The retention policy requires 7 years, so archiving older orders is allowed and reduces table size.",
        acceptableFix: "No change needed.",
      },
    ],
  },
}

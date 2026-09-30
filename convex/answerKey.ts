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
export type ScenarioMeta = { version: number; level: string; minutes: number; followUps: string[] }

export const SCENARIO_META: Record<string, ScenarioMeta> = {
  "ord-482-junior": {
    version: 1,
    level: "Junior",
    minutes: 40,
    followUps: [
      "What would you verify before approving any change that builds a database query from request parameters?",
      "What would you test before merging the date-filter change, beyond what is already in the test file?",
      "If you had to give the AI agent one instruction to fix the most serious problem you found, what would you tell it?",
    ],
  },
}

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
}

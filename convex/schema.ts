import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export const severityValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
)

export const verdictValidator = v.union(
  v.literal("approve"),
  v.literal("request_changes"),
)

// "none" is only recorded when the timer auto-closes an attempt before the
// candidate chose a verdict (FR-C-14). It never equals the expected verdict.
export const storedVerdictValidator = v.union(verdictValidator, v.literal("none"))

export const commentValidator = v.object({
  id: v.string(),
  file: v.string(),
  line: v.number(),
  severity: severityValidator,
  text: v.string(),
})

export const followUpValidator = v.object({
  question: v.string(),
  answer: v.string(),
})

// ---------------------------------------------------------------------------
// Grading result (NFR-DATA-1). Fields added after v0.3 are optional so results
// graded by the MVP pipeline still validate.
// ---------------------------------------------------------------------------

export const outcomeValidator = v.union(
  v.literal("found"),
  v.literal("missed"),
  v.literal("false_alarm"),
  v.literal("clean"),
  // M3: the candidate never triggered this planted fault; excluded from scoring.
  v.literal("not_exposed"),
)

export const buildEventValidator = v.object({
  id: v.string(),
  t: v.number(),
  type: v.union(
    v.literal("ai_prompt"),
    v.literal("ai_response"),
    v.literal("fault_injected"),
    v.literal("accept_suggestion"),
    v.literal("reject_suggestion"),
    v.literal("test_run"),
    v.literal("file_open"),
  ),
  data: v.optional(v.string()),
})

export const extraClassValidator = v.union(
  v.literal("valid_extra"),
  v.literal("nitpick"),
  v.literal("false_alarm"),
  v.literal("vague_match"),
  v.literal("undetermined"),
  // Only set by a human reviewer confirming the comment identifies a key item.
  v.literal("matched"),
)

export const commentClassValidator = v.union(
  v.literal("valid"),
  v.literal("false_alarm"),
  v.literal("nitpick"),
  v.literal("undetermined"),
)

export const voteValidator = v.object({
  judge: v.string(),
  model: v.string(),
  family: v.optional(v.string()),
  decision: v.boolean(),
  impact: v.boolean(),
  fix: v.boolean(),
  constructive: v.optional(v.boolean()),
  evidence: v.string(),
  valid: v.boolean(),
  discardedReason: v.optional(v.string()),
})

export const classifyVoteValidator = v.object({
  judge: v.string(),
  model: v.string(),
  family: v.optional(v.string()),
  answer: v.string(),
  evidence: v.optional(v.string()),
  valid: v.boolean(),
  discardedReason: v.optional(v.string()),
})

export const itemResultValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("issue"), v.literal("decoy")),
  title: v.string(),
  category: v.string(),
  severity: v.string(),
  weight: v.number(),
  outcome: outcomeValidator,
  explanation: v.union(v.number(), v.null()),
  commentId: v.optional(v.union(v.string(), v.null())),
  commentText: v.union(v.string(), v.null()),
  commentLine: v.union(v.number(), v.null()),
  commentFile: v.union(v.string(), v.null()),
  split: v.boolean(),
  lowQuorum: v.optional(v.boolean()),
  constructive: v.optional(v.boolean()),
  overridden: v.optional(v.boolean()),
  votes: v.array(voteValidator),
})

export const extraCommentValidator = v.object({
  commentId: v.optional(v.string()),
  text: v.string(),
  file: v.string(),
  line: v.number(),
  classification: extraClassValidator,
  matchedItemId: v.optional(v.string()),
  overridden: v.optional(v.boolean()),
  votes: v.array(classifyVoteValidator),
})

const componentValidator = v.object({ value: v.number(), detail: v.string() })

export const resultValidator = v.object({
  overall: v.number(),
  band: v.string(),
  components: v.object({
    detection: componentValidator,
    precision: componentValidator,
    decoyDiscipline: componentValidator,
    explanationQuality: componentValidator,
    verdict: componentValidator,
  }),
  weights: v.object({
    detection: v.number(),
    precision: v.number(),
    decoyDiscipline: v.number(),
    explanationQuality: v.number(),
    verdict: v.number(),
  }),
  items: v.array(itemResultValidator),
  extraComments: v.array(extraCommentValidator),
  commentClasses: v.optional(
    v.array(v.object({ commentId: v.string(), cls: commentClassValidator })),
  ),
  foundCount: v.number(),
  issueCount: v.number(),
  needsReview: v.boolean(),
  reviewReasons: v.array(v.string()),
  judges: v.array(v.object({ name: v.string(), model: v.string(), family: v.optional(v.string()) })),
  // REL-9: everything needed to reproduce this grade.
  versions: v.optional(
    v.object({
      rubric: v.string(),
      prompt: v.string(),
      scoring: v.string(),
      scenario: v.number(),
    }),
  ),
  modelsUsed: v.optional(v.array(v.string())),
  callCount: v.optional(v.number()),
  // SCR-1 / SCR-2: reported alongside the score, not yet weighted into it.
  followUpQuality: v.optional(
    v.object({
      value: v.number(),
      detail: v.string(),
      answers: v.array(v.object({ question: v.string(), score: v.number(), votes: v.number() })),
    }),
  ),
  communication: v.optional(v.object({ value: v.number(), detail: v.string() })),
  ragExamples: v.optional(v.number()),
  configNote: v.optional(v.string()),
  // Set once a human override has been applied (HR-2/3).
  machine: v.optional(v.object({ overall: v.number(), band: v.string() })),
  overrideCount: v.optional(v.number()),
  gradedAt: v.number(),
})

export const scoreSummaryValidator = v.object({
  label: v.string(),
  overall: v.number(),
  band: v.string(),
  foundCount: v.number(),
  needsReview: v.boolean(),
  items: v.array(v.object({ id: v.string(), score: v.number() })),
  expectation: v.optional(v.string()),
  passed: v.optional(v.boolean()),
})

export default defineSchema({
  ...authTables,

  // One row per candidate attempt. `result` is the effective result (machine
  // grade with any human overrides applied); `machineResult` is the untouched
  // council output so overrides can always be recomputed deterministically.
  submissions: defineTable({
    candidateName: v.string(),
    candidateId: v.optional(v.id("candidates")),
    scenarioId: v.string(),
    scenarioVersion: v.optional(v.number()),
    level: v.string(),
    verdict: storedVerdictValidator,
    comments: v.array(commentValidator),
    followUps: v.array(followUpValidator),
    autoSubmitted: v.optional(v.boolean()),
    // M3 only: final code and the recorded trajectory.
    build: v.optional(v.object({ code: v.string(), events: v.array(buildEventValidator) })),
    // TR-4: recruiter chose to share the results summary with the candidate.
    released: v.optional(v.boolean()),
    // TR-5: candidate appeal, routed to the human review queue.
    appeal: v.optional(
      v.object({
        text: v.string(),
        at: v.number(),
        status: v.union(v.literal("open"), v.literal("resolved")),
        response: v.optional(v.string()),
      }),
    ),
    status: v.union(
      v.literal("grading"),
      v.literal("graded"),
      v.literal("error"),
    ),
    result: v.optional(resultValidator),
    machineResult: v.optional(resultValidator),
    error: v.optional(v.string()),
    humanReview: v.optional(
      v.object({
        status: v.literal("resolved"),
        by: v.string(),
        at: v.number(),
        note: v.string(),
      }),
    ),
    submittedAt: v.number(),
  }).index("by_submittedAt", ["submittedAt"]),

  // FR-C-12: a recruiter-created candidate with a single-use invite token.
  candidates: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    scenarioId: v.string(),
    token: v.string(),
    // FR-C-16: accessibility accommodation, added to the scenario time limit.
    extraMinutes: v.number(),
    status: v.union(
      v.literal("invited"),
      v.literal("started"),
      v.literal("submitted"),
      v.literal("revoked"),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    // CU-3: candidates invited to a battery share a group token.
    groupToken: v.optional(v.string()),
    batteryId: v.optional(v.string()),
    // CU-6: an internal engineer taking the assessment to set local norms.
    benchmark: v.optional(v.boolean()),
    // FB-3: self-identified group, collected lawfully and with consent.
    group: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    deadline: v.optional(v.number()),
    submissionId: v.optional(v.id("submissions")),
  })
    .index("by_token", ["token"])
    .index("by_group", ["groupToken"])
    .index("by_createdAt", ["createdAt"]),

  // FR-C-13: server-side draft of an in-progress attempt.
  autosaves: defineTable({
    candidateId: v.id("candidates"),
    step: v.union(v.literal("review"), v.literal("followup")),
    comments: v.array(commentValidator),
    verdict: v.optional(verdictValidator),
    answers: v.array(v.string()),
    code: v.optional(v.string()),
    events: v.optional(v.array(buildEventValidator)),
    updatedAt: v.number(),
  }).index("by_candidate", ["candidateId"]),

  // SB-4 / CU-2: workspace scoring configuration within validated guardrails.
  itemSettings: defineTable({
    scenarioId: v.string(),
    itemId: v.string(),
    enabled: v.boolean(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_scenario", ["scenarioId"]),
  emphasis: defineTable({
    category: v.string(),
    multiplier: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_category", ["category"]),

  // CU-7: hiring outcome and 6-month manager rating, for predictive validity.
  outcomes: defineTable({
    submissionId: v.id("submissions"),
    hired: v.boolean(),
    rating: v.optional(v.number()),
    recordedBy: v.string(),
    at: v.number(),
  }).index("by_submission", ["submissionId"]),

  // EX-5: experiment log.
  experiments: defineTable({
    hypothesis: v.string(),
    change: v.string(),
    result: v.string(),
    decision: v.union(v.literal("adopt"), v.literal("reject"), v.literal("pending")),
    by: v.string(),
    at: v.number(),
  }),

  // SEC-15: fixed-window counters for public endpoints.
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  // HR-3: audit log of every human override.
  reviews: defineTable({
    submissionId: v.id("submissions"),
    target: v.union(v.literal("item"), v.literal("comment")),
    targetId: v.string(),
    before: v.string(),
    after: v.string(),
    beforeExplanation: v.optional(v.union(v.number(), v.null())),
    afterExplanation: v.optional(v.union(v.number(), v.null())),
    commentId: v.optional(v.string()),
    justification: v.string(),
    reviewerId: v.id("users"),
    reviewerEmail: v.string(),
    createdAt: v.number(),
  }).index("by_submission", ["submissionId"]),

  // REL-1: human grades used to measure the council. One row per grader per
  // target ("I1", "D1", or "__overall" for a holistic 0-100 score).
  goldenLabels: defineTable({
    submissionId: v.id("submissions"),
    targetId: v.string(),
    grader: v.string(),
    source: v.union(v.literal("manual"), v.literal("human_review")),
    outcome: v.optional(outcomeValidator),
    explanation: v.optional(v.number()),
    overall: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_submission", ["submissionId"])
    .index("by_grader", ["grader"]),

  // REL-3 / FB-2 / REL-7 / REL-10: offline evaluation runs.
  evalRuns: defineTable({
    kind: v.union(
      v.literal("retest"),
      v.literal("perturbation"),
      v.literal("golden"),
      v.literal("adversarial"),
    ),
    submissionId: v.optional(v.id("submissions")),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    versions: v.object({ rubric: v.string(), prompt: v.string(), scoring: v.string() }),
    models: v.array(v.string()),
    // Units of work (run labels / submission ids); processed one per action.
    plan: v.array(v.string()),
    runs: v.array(scoreSummaryValidator),
    baseline: v.optional(v.boolean()),
    error: v.optional(v.string()),
    startedBy: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_kind", ["kind", "startedAt"]),

  // EX-2 / NFR-OBS-1: one row per judge call.
  judgeCalls: defineTable({
    submissionId: v.optional(v.id("submissions")),
    evalRunId: v.optional(v.id("evalRuns")),
    stage: v.string(),
    judge: v.string(),
    model: v.string(),
    family: v.string(),
    ok: v.boolean(),
    latencyMs: v.number(),
    promptVersion: v.string(),
    inputChars: v.number(),
    outputChars: v.number(),
    output: v.string(),
    error: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_submission", ["submissionId"])
    .index("by_at", ["at"]),

  // Hiring-team members allowed to see results and answer keys.
  // The first verified account becomes the owner; others join by invite.
  recruiters: defineTable({
    userId: v.id("users"),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("recruiter")),
    joinedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  invites: defineTable({
    email: v.string(),
    invitedBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_email", ["email"]),
})

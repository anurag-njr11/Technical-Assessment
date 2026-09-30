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

export default defineSchema({
  ...authTables,

  // One row per candidate attempt. `result` is written by the grading
  // pipeline (convex/grading.ts) once the judge council has finished.
  submissions: defineTable({
    candidateName: v.string(),
    scenarioId: v.string(),
    level: v.string(),
    verdict: verdictValidator,
    comments: v.array(commentValidator),
    followUps: v.array(followUpValidator),
    status: v.union(
      v.literal("grading"),
      v.literal("graded"),
      v.literal("error"),
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    submittedAt: v.number(),
  }).index("by_submittedAt", ["submittedAt"]),

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

import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { internal } from "./_generated/api"
import {
  commentValidator,
  followUpValidator,
  verdictValidator,
} from "./schema"
import { ANSWER_KEYS } from "./answerKey"
import { requireRecruiter } from "./access"

const MAX_COMMENTS = 40
const MAX_TEXT = 4000

// Public: candidates submit without an account. Returns nothing sensitive.
export const submit = mutation({
  args: {
    candidateName: v.string(),
    scenarioId: v.string(),
    level: v.string(),
    verdict: verdictValidator,
    comments: v.array(commentValidator),
    followUps: v.array(followUpValidator),
  },
  handler: async (ctx, args) => {
    const name = args.candidateName.trim()
    if (!name || name.length > 120) throw new Error("Enter your name (max 120 characters).")
    if (!ANSWER_KEYS[args.scenarioId]) throw new Error("Unknown scenario.")
    if (args.comments.length > MAX_COMMENTS) throw new Error("Too many comments.")
    if (args.followUps.length > 10) throw new Error("Too many answers.")
    for (const c of args.comments) {
      if (!c.text.trim()) throw new Error("Comments cannot be empty.")
      if (c.text.length > MAX_TEXT) throw new Error("A comment is too long.")
    }
    for (const f of args.followUps) {
      if (f.answer.length > MAX_TEXT || f.question.length > 1000) throw new Error("An answer is too long.")
    }

    const id = await ctx.db.insert("submissions", {
      ...args,
      candidateName: name,
      status: "grading",
      submittedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.grading.grade, { submissionId: id })
    return null
  },
})

// Recruiter-only from here down.

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    const rows = await ctx.db
      .query("submissions")
      .withIndex("by_submittedAt")
      .order("desc")
      .take(100)
    return rows.map((r) => ({
      _id: r._id,
      candidateName: r.candidateName,
      level: r.level,
      scenarioId: r.scenarioId,
      status: r.status,
      submittedAt: r.submittedAt,
      overall: r.result?.overall as number | undefined,
      band: r.result?.band as string | undefined,
      found: r.result?.foundCount as number | undefined,
      total: r.result?.issueCount as number | undefined,
      needsReview: r.result?.needsReview as boolean | undefined,
    }))
  },
})

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const id = ctx.db.normalizeId("submissions", args.id)
    if (!id) return null
    return await ctx.db.get(id)
  },
})

export const regrade = mutation({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const row = await ctx.db.get(args.id)
    if (!row) throw new Error("Submission not found.")
    await ctx.db.patch(args.id, { status: "grading", error: undefined })
    await ctx.scheduler.runAfter(0, internal.grading.grade, { submissionId: args.id })
  },
})

export const getInternal = internalQuery({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => ctx.db.get(args.id),
})

export const saveResult = internalMutation({
  args: { id: v.id("submissions"), result: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "graded", result: args.result, error: undefined })
  },
})

export const saveError = internalMutation({
  args: { id: v.id("submissions"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "error", error: args.error })
  },
})

import { v } from "convex/values"
import { internalMutation, query } from "./_generated/server"
import { requireRecruiter } from "./access"

// EX-2 / NFR-OBS-1: every judge call is logged with model, latency and output.

const traceValidator = v.object({
  stage: v.string(),
  judge: v.string(),
  model: v.string(),
  family: v.string(),
  ok: v.boolean(),
  latencyMs: v.number(),
  inputChars: v.number(),
  outputChars: v.number(),
  output: v.string(),
  error: v.optional(v.string()),
  at: v.number(),
})

export const record = internalMutation({
  args: {
    submissionId: v.optional(v.id("submissions")),
    evalRunId: v.optional(v.id("evalRuns")),
    promptVersion: v.string(),
    traces: v.array(traceValidator),
  },
  handler: async (ctx, args) => {
    for (const t of args.traces) {
      await ctx.db.insert("judgeCalls", {
        ...t,
        submissionId: args.submissionId,
        evalRunId: args.evalRunId,
        promptVersion: args.promptVersion,
      })
    }
  },
})

export const forSubmission = query({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const rows = await ctx.db
      .query("judgeCalls")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.id))
      .take(500)
    return rows.map((r) => ({
      _id: r._id,
      stage: r.stage,
      judge: r.judge,
      model: r.model,
      family: r.family,
      ok: r.ok,
      latencyMs: r.latencyMs,
      error: r.error,
      // Rough token estimate (~4 chars per token) for cost tracking (NFR-COST-1).
      estTokens: Math.round((r.inputChars + r.outputChars) / 4),
    }))
  },
})

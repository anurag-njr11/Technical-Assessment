import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireRecruiter } from "./access"
import { effectiveResult, loadOverrides } from "./submissions"
import { outcomeValidator } from "./schema"
import { SCENARIO_META } from "./answerKey"

// Human review queue (spec §15.4). Escalated submissions wait here; a
// reviewer confirms or overrides item outcomes / comment classes with a
// written justification. Every override is audited (HR-3), the score is
// recomputed deterministically from the untouched machine result, and the
// human decision is added to the golden set (HR-4).

const MIN_JUSTIFICATION = 10

async function reviewerEmail(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId)
  return user?.email ?? "unknown"
}

export const queue = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    const rows = await ctx.db.query("submissions").withIndex("by_submittedAt").order("desc").take(300)
    return rows
      .filter(
        (r) =>
          r.status === "graded" &&
          ((r.result?.needsReview && r.humanReview?.status !== "resolved") || r.appeal?.status === "open"),
      )
      .map((r) => ({
        _id: r._id,
        candidateName: r.candidateName,
        submittedAt: r.submittedAt,
        overall: r.result!.overall,
        band: r.result!.band,
        reasons: [
          ...(r.appeal?.status === "open" ? [`Candidate appeal: "${r.appeal.text.slice(0, 160)}"`] : []),
          ...(r.humanReview?.status === "resolved" ? [] : r.result!.reviewReasons),
        ],
        appeal: r.appeal?.status === "open",
        overrideCount: r.result!.overrideCount ?? 0,
      }))
  },
})

export const history = query({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.id))
      .collect()
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({
        _id: r._id,
        target: r.target,
        targetId: r.targetId,
        before: r.before,
        after: r.after,
        beforeExplanation: r.beforeExplanation ?? null,
        afterExplanation: r.afterExplanation ?? null,
        justification: r.justification,
        reviewerEmail: r.reviewerEmail,
        createdAt: r.createdAt,
      }))
  },
})

async function recompute(ctx: MutationCtx, id: Id<"submissions">) {
  const sub = (await ctx.db.get(id))!
  const machine = sub.machineResult ?? sub.result!
  const overrides = await loadOverrides(ctx, id)
  await ctx.db.patch(id, { machineResult: machine, result: effectiveResult(sub, machine, overrides) })
}

function noBuildOverrides(scenarioId: string) {
  if (SCENARIO_META[scenarioId]?.kind === "build") {
    throw new Error("Directed Build pilot results can't be overridden yet. Resolve the review with a note instead.")
  }
}

function checkJustification(text: string) {
  const t = text.trim()
  if (t.length < MIN_JUSTIFICATION) throw new Error(`Write a justification (at least ${MIN_JUSTIFICATION} characters).`)
  if (t.length > 2000) throw new Error("Justification is too long.")
  return t
}

export const overrideItem = mutation({
  args: {
    submissionId: v.id("submissions"),
    itemId: v.string(),
    outcome: outcomeValidator,
    explanation: v.optional(v.number()),
    commentId: v.optional(v.string()),
    justification: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const justification = checkJustification(args.justification)
    const sub = await ctx.db.get(args.submissionId)
    if (!sub || sub.status !== "graded" || !sub.result) throw new Error("Only graded submissions can be reviewed.")
    noBuildOverrides(sub.scenarioId)
    const item = sub.result.items.find((i) => i.id === args.itemId)
    if (!item) throw new Error("Unknown item.")
    const allowed = item.kind === "issue" ? ["found", "missed"] : ["clean", "false_alarm"]
    if (!allowed.includes(args.outcome)) throw new Error(`An ${item.kind} can only be marked ${allowed.join(" or ")}.`)
    let explanation: number | null = null
    if (item.kind === "issue" && args.outcome === "found") {
      explanation = args.explanation ?? 0
      if (![0, 1, 2].includes(explanation)) throw new Error("Explanation score must be 0, 1 or 2.")
    }
    if (args.commentId && !sub.comments.some((c) => c.id === args.commentId)) throw new Error("Unknown comment.")
    const email = await reviewerEmail(ctx, me.userId)
    const now = Date.now()
    await ctx.db.insert("reviews", {
      submissionId: args.submissionId,
      target: "item",
      targetId: item.id,
      before: item.outcome,
      after: args.outcome,
      beforeExplanation: item.explanation,
      afterExplanation: explanation,
      commentId: args.commentId,
      justification,
      reviewerId: me.userId,
      reviewerEmail: email,
      createdAt: now,
    })
    await ctx.db.insert("goldenLabels", {
      submissionId: args.submissionId,
      targetId: item.id,
      grader: email,
      source: "human_review",
      outcome: args.outcome,
      explanation: explanation ?? undefined,
      createdAt: now,
    })
    await recompute(ctx, args.submissionId)
  },
})

export const overrideComment = mutation({
  args: {
    submissionId: v.id("submissions"),
    commentId: v.string(),
    classification: v.union(v.literal("valid_extra"), v.literal("nitpick"), v.literal("false_alarm"), v.literal("matched")),
    justification: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const justification = checkJustification(args.justification)
    const sub = await ctx.db.get(args.submissionId)
    if (!sub || sub.status !== "graded" || !sub.result) throw new Error("Only graded submissions can be reviewed.")
    const extra = sub.result.extraComments.find((e) => e.commentId === args.commentId)
    if (!extra) throw new Error("That comment was not classified by the panel.")
    await ctx.db.insert("reviews", {
      submissionId: args.submissionId,
      target: "comment",
      targetId: args.commentId,
      before: extra.classification,
      after: args.classification,
      justification,
      reviewerId: me.userId,
      reviewerEmail: await reviewerEmail(ctx, me.userId),
      createdAt: Date.now(),
    })
    await recompute(ctx, args.submissionId)
  },
})

export const resolve = mutation({
  args: { submissionId: v.id("submissions"), note: v.string() },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const note = checkJustification(args.note)
    const sub = await ctx.db.get(args.submissionId)
    if (!sub || sub.status !== "graded") throw new Error("Only graded submissions can be resolved.")
    await ctx.db.patch(args.submissionId, {
      humanReview: { status: "resolved", by: await reviewerEmail(ctx, me.userId), at: Date.now(), note },
      // TR-5: resolving also answers an open appeal; the note is shown to the candidate.
      ...(sub.appeal?.status === "open" ? { appeal: { ...sub.appeal, status: "resolved" as const, response: note } } : {}),
    })
  },
})

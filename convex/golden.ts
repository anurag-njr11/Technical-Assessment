import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireRecruiter } from "./access"
import { outcomeValidator } from "./schema"

// REL-1 golden set: humans grade submissions independently of the council.
// Each grader's labels for a submission replace their previous manual labels.

export const label = mutation({
  args: {
    submissionId: v.id("submissions"),
    items: v.array(v.object({ itemId: v.string(), outcome: outcomeValidator, explanation: v.optional(v.number()) })),
    overall: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const sub = await ctx.db.get(args.submissionId)
    if (!sub || !sub.result) throw new Error("Only graded submissions can be labelled.")
    const user = await ctx.db.get(me.userId)
    const grader = user?.email ?? me.email
    const kinds = new Map(sub.result.items.map((i) => [i.id, i.kind]))
    for (const it of args.items) {
      const kind = kinds.get(it.itemId)
      if (!kind) throw new Error(`Unknown item ${it.itemId}.`)
      const ok = kind === "issue" ? ["found", "missed"].includes(it.outcome) : ["clean", "false_alarm"].includes(it.outcome)
      if (!ok) throw new Error(`Invalid outcome for ${it.itemId}.`)
      if (it.explanation !== undefined && ![0, 1, 2].includes(it.explanation)) throw new Error("Explanation must be 0, 1 or 2.")
    }
    if (args.overall !== undefined && (!Number.isFinite(args.overall) || args.overall < 0 || args.overall > 100)) {
      throw new Error("Overall score must be between 0 and 100.")
    }

    const existing = await ctx.db
      .query("goldenLabels")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId))
      .collect()
    for (const row of existing) if (row.grader === grader && row.source === "manual") await ctx.db.delete(row._id)

    const now = Date.now()
    for (const it of args.items) {
      await ctx.db.insert("goldenLabels", {
        submissionId: args.submissionId,
        targetId: it.itemId,
        grader,
        source: "manual",
        outcome: it.outcome,
        explanation: kinds.get(it.itemId) === "issue" && it.outcome === "found" ? (it.explanation ?? 0) : undefined,
        createdAt: now,
      })
    }
    if (args.overall !== undefined) {
      await ctx.db.insert("goldenLabels", {
        submissionId: args.submissionId,
        targetId: "__overall",
        grader,
        source: "manual",
        overall: Math.round(args.overall),
        createdAt: now,
      })
    }
  },
})

export const forSubmission = query({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const rows = await ctx.db
      .query("goldenLabels")
      .withIndex("by_submission", (q) => q.eq("submissionId", args.id))
      .collect()
    const user = await ctx.db.get(me.userId)
    const email = user?.email ?? me.email
    return {
      graders: [...new Set(rows.filter((r) => r.source === "manual").map((r) => r.grader))],
      mine: rows
        .filter((r) => r.grader === email && r.source === "manual")
        .map((r) => ({ targetId: r.targetId, outcome: r.outcome ?? null, explanation: r.explanation ?? null, overall: r.overall ?? null })),
    }
  },
})

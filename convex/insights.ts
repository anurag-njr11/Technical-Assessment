import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { QueryCtx } from "./_generated/server"
import { requireRecruiter } from "./access"
import { ANSWER_KEYS, SCENARIO_META } from "./answerKey"
import { fourFifths, pearson, rasch } from "./metrics"
import { PASS_SCORE } from "./items"

// Per-submission context (SCR-3 ability, SCR-5/CU-6 local norms, CU-7 outcome)
// and workspace-level fairness and validity (FB-3, SM-6, CU-7, EX-5).

async function recent(ctx: QueryCtx) {
  return (await ctx.db.query("submissions").withIndex("by_submittedAt").order("desc").take(300)).filter(
    (s) => s.status === "graded" && s.result,
  )
}

async function emailOf(ctx: QueryCtx, userId: string) {
  const u = await ctx.db.get(userId as never)
  return (u as { email?: string } | null)?.email ?? "recruiter"
}

export const forSubmission = query({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const sub = await ctx.db.get(args.id)
    if (!sub || !sub.result) return null
    const peers = (await recent(ctx)).filter((s) => s.scenarioId === sub.scenarioId)

    // Local norms: percentile among the company's own engineers on this scenario.
    const bench: number[] = []
    for (const s of peers) {
      if (!s.candidateId || s._id === sub._id) continue
      const c = await ctx.db.get(s.candidateId)
      if (c?.benchmark) bench.push(s.result!.overall)
    }
    const below = bench.filter((x) => x < sub.result!.overall).length
    const ties = bench.filter((x) => x === sub.result!.overall).length
    const percentile = bench.length ? Math.round((100 * (below + ties / 2)) / bench.length) : null

    // Rasch ability over all graded submissions of this scenario.
    let ability: { theta: number; se: number; n: number } | null = null
    const key = ANSWER_KEYS[sub.scenarioId]
    if (key && peers.length >= 3) {
      const issues = key.items.filter((i) => i.kind === "issue")
      const matrix = peers.map((s) =>
        issues.map((i) => {
          const r = (s.machineResult ?? s.result)!.items.find((x) => x.id === i.id)
          return r ? (r.outcome === "found" ? 1 : 0) : null
        }),
      ) as Array<Array<0 | 1 | null>>
      const est = rasch(matrix)
      const idx = peers.findIndex((s) => s._id === sub._id)
      if (idx >= 0) ability = { theta: est.theta[idx], se: est.se[idx], n: peers.length }
    }

    const outcome = await ctx.db.query("outcomes").withIndex("by_submission", (q) => q.eq("submissionId", args.id)).unique()
    return {
      percentile,
      benchmarkN: bench.length,
      ability,
      outcome: outcome ? { hired: outcome.hired, rating: outcome.rating ?? null, recordedBy: outcome.recordedBy, at: outcome.at } : null,
    }
  },
})

export const setOutcome = mutation({
  args: { id: v.id("submissions"), hired: v.boolean(), rating: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    if (args.rating !== undefined && ![1, 2, 3, 4, 5].includes(args.rating)) throw new Error("Rating must be 1–5.")
    if (args.rating !== undefined && !args.hired) throw new Error("Only hired candidates get a manager rating.")
    const row = await ctx.db.query("outcomes").withIndex("by_submission", (q) => q.eq("submissionId", args.id)).unique()
    const patch = { hired: args.hired, rating: args.rating, recordedBy: await emailOf(ctx, me.userId), at: Date.now() }
    if (row) await ctx.db.patch(row._id, patch)
    else await ctx.db.insert("outcomes", { submissionId: args.id, ...patch })
  },
})

export const workspace = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    const subs = await recent(ctx)

    // FB-3 / SM-6: selection rate (score >= Meets bar) per self-identified group.
    const groups = new Map<string, { n: number; passed: number }>()
    for (const s of subs) {
      if (!s.candidateId) continue
      const c = await ctx.db.get(s.candidateId)
      if (!c?.group || c.benchmark) continue
      const g = groups.get(c.group) ?? { n: 0, passed: 0 }
      g.n++
      if (s.result!.overall >= PASS_SCORE) g.passed++
      groups.set(c.group, g)
    }
    const adverseImpact = fourFifths([...groups].map(([group, x]) => ({ group, ...x })))

    // CU-7: does the score predict the 6-month manager rating?
    const pairs: Array<{ score: number; rating: number }> = []
    for (const s of subs) {
      const o = await ctx.db.query("outcomes").withIndex("by_submission", (q) => q.eq("submissionId", s._id)).unique()
      if (o?.rating) pairs.push({ score: s.result!.overall, rating: o.rating })
    }
    const validity = { n: pairs.length, r: pearson(pairs.map((p) => p.score), pairs.map((p) => p.rating)) }

    const experiments = (await ctx.db.query("experiments").order("desc").take(50)).map((e) => ({
      _id: e._id, hypothesis: e.hypothesis, change: e.change, result: e.result, decision: e.decision, by: e.by, at: e.at,
    }))
    const byModule = Object.entries(SCENARIO_META).map(([id, m]) => {
      const mine = subs.filter((s) => s.scenarioId === id)
      return { scenarioId: id, title: m.title, n: mine.length, mean: mine.length ? Math.round(mine.reduce((a, s) => a + s.result!.overall, 0) / mine.length) : null }
    })
    return { adverseImpact, validity, experiments, byModule, passScore: PASS_SCORE }
  },
})

export const addExperiment = mutation({
  args: {
    hypothesis: v.string(),
    change: v.string(),
    result: v.string(),
    decision: v.union(v.literal("adopt"), v.literal("reject"), v.literal("pending")),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const clean = (x: string, name: string) => {
      const t = x.trim()
      if (!t || t.length > 2000) throw new Error(`Fill in the ${name} (max 2000 characters).`)
      return t
    }
    await ctx.db.insert("experiments", {
      hypothesis: clean(args.hypothesis, "hypothesis"),
      change: clean(args.change, "change"),
      result: args.result.trim().slice(0, 2000),
      decision: args.decision,
      by: await emailOf(ctx, me.userId),
      at: Date.now(),
    })
  },
})

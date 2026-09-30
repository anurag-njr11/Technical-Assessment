import { v } from "convex/values"
import { internalQuery, mutation, query } from "./_generated/server"
import type { QueryCtx } from "./_generated/server"
import { requireOwner, requireRecruiter } from "./access"
import { ANSWER_KEYS, SCENARIO_META } from "./answerKey"
import type { AnswerKey } from "./answerKey"
import { fourFifths, rasch } from "./metrics"
import { computeScore } from "./scoring"

// Item bank (SB-3, SB-4) and category emphasis (CU-2), with guardrails and an
// automatic adverse-impact check on every configuration change (FB-6, CU-8).

export const EMPHASIS_MIN = 0.5
export const EMPHASIS_MAX = 1.5
export const PASS_SCORE = 60 // "Meets bar" or better counts as selected for FB-3

export type Config = { disabled: Array<{ scenarioId: string; itemId: string }>; emphasis: Record<string, number> }

/** Returns the answer key with disabled items removed and category weights scaled. */
export function applyConfig(key: AnswerKey, config: Config): { key: AnswerKey; note?: string } {
  const disabled = new Set(config.disabled.filter((d) => d.scenarioId === key.scenarioId).map((d) => d.itemId))
  const scaled = Object.entries(config.emphasis).filter(([, m]) => m !== 1)
  if (!disabled.size && !scaled.length) return { key }
  const items = key.items
    .filter((i) => !disabled.has(i.id))
    .map((i) => ({ ...i, weight: Math.round(i.weight * (config.emphasis[i.category] ?? 1) * 100) / 100 }))
  const note = [
    disabled.size ? `disabled: ${[...disabled].join(", ")}` : "",
    scaled.length ? `emphasis: ${scaled.map(([c, m]) => `${c}×${m}`).join(", ")}` : "",
  ].filter(Boolean).join("; ")
  return { key: { ...key, items }, note }
}

async function loadConfig(ctx: QueryCtx): Promise<Config> {
  const settings = await ctx.db.query("itemSettings").take(500)
  const emphasis = await ctx.db.query("emphasis").take(100)
  return {
    disabled: settings.filter((s) => !s.enabled).map((s) => ({ scenarioId: s.scenarioId, itemId: s.itemId })),
    emphasis: Object.fromEntries(emphasis.map((e) => [e.category, e.multiplier])),
  }
}

export const configInternal = internalQuery({
  args: { scenarioId: v.string() },
  handler: async (ctx) => loadConfig(ctx),
})

/** FB-6: what the four-fifths rule would say if every graded submission were scored under `config`. */
async function adverseImpactUnder(ctx: QueryCtx, config: Config) {
  const subs = (await ctx.db.query("submissions").withIndex("by_submittedAt").order("desc").take(300)).filter(
    (s) => s.status === "graded" && s.candidateId && (s.machineResult ?? s.result),
  )
  const groups = new Map<string, { n: number; passed: number }>()
  for (const s of subs) {
    const c = await ctx.db.get(s.candidateId!)
    if (!c?.group || c.benchmark) continue
    const key = ANSWER_KEYS[s.scenarioId]
    const machine = (s.machineResult ?? s.result)!
    let overall = machine.overall
    if (key) {
      const { key: k } = applyConfig(key, config)
      const weights = new Map(k.items.map((i) => [i.id, i.weight]))
      const items = machine.items.filter((i) => weights.has(i.id)).map((i) => ({ ...i, weight: weights.get(i.id)! }))
      overall = computeScore({
        items,
        commentClasses: (machine.commentClasses ?? []).map((x) => x.cls),
        commentCount: s.comments.length,
        verdict: s.verdict,
        expectedVerdict: key.expectedVerdict,
      }).overall
    }
    const g = groups.get(c.group) ?? { n: 0, passed: 0 }
    g.n++
    if (overall >= PASS_SCORE) g.passed++
    groups.set(c.group, g)
  }
  return fourFifths([...groups].map(([group, x]) => ({ group, ...x })))
}

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    const config = await loadConfig(ctx)
    const subs = (await ctx.db.query("submissions").withIndex("by_submittedAt").order("desc").take(300)).filter(
      (s) => s.status === "graded" && s.result,
    )
    const scenarios = Object.entries(SCENARIO_META)
      .filter(([id]) => ANSWER_KEYS[id])
      .map(([id, meta]) => {
        const key = ANSWER_KEYS[id]
        const mine = subs.filter((s) => s.scenarioId === id)
        const issues = key.items.filter((i) => i.kind === "issue")
        // SB-3 / SCR-3: detection rate and Rasch difficulty per planted issue.
        const matrix = mine.map((s) =>
          issues.map((i) => {
            const r = (s.machineResult ?? s.result)!.items.find((x) => x.id === i.id)
            return r ? (r.outcome === "found" ? 1 : 0) : null
          }),
        ) as Array<Array<0 | 1 | null>>
        const irt = mine.length >= 2 ? rasch(matrix) : null
        return {
          scenarioId: id,
          title: meta.title,
          kind: meta.kind,
          n: mine.length,
          items: key.items.map((i) => {
            const idx = issues.findIndex((x) => x.id === i.id)
            const outcomes = mine.map((s) => (s.machineResult ?? s.result)!.items.find((x) => x.id === i.id)?.outcome).filter(Boolean)
            const hit = outcomes.filter((o) => (i.kind === "issue" ? o === "found" : o === "false_alarm")).length
            return {
              id: i.id,
              kind: i.kind,
              title: i.title,
              category: i.category,
              severity: i.severity,
              weight: i.weight,
              rate: outcomes.length ? hit / outcomes.length : null,
              n: outcomes.length,
              difficulty: irt && idx >= 0 ? irt.b[idx] : null,
              enabled: !config.disabled.some((d) => d.scenarioId === id && d.itemId === i.id),
            }
          }),
        }
      })
    const categories = [...new Set(Object.values(ANSWER_KEYS).flatMap((k) => k.items.filter((i) => i.kind === "issue").map((i) => i.category)))]
    return {
      scenarios,
      emphasis: categories.map((c) => ({ category: c, multiplier: config.emphasis[c] ?? 1 })),
      adverseImpact: await adverseImpactUnder(ctx, config),
      limits: { min: EMPHASIS_MIN, max: EMPHASIS_MAX },
    }
  },
})

async function whoami(ctx: QueryCtx, userId: string) {
  const u = await ctx.db.get(userId as never)
  return (u as { email?: string } | null)?.email ?? "owner"
}

export const setEnabled = mutation({
  args: { scenarioId: v.string(), itemId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireOwner(ctx)
    const key = ANSWER_KEYS[args.scenarioId]
    const item = key?.items.find((i) => i.id === args.itemId)
    if (!item) throw new Error("Unknown item.")
    if (item.kind === "decoy" && !args.enabled) throw new Error("Decoys can't be disabled: they measure false alarms.")
    const rows = await ctx.db.query("itemSettings").withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId)).collect()
    const disabledNow = new Set(rows.filter((r) => !r.enabled).map((r) => r.itemId))
    if (args.enabled) disabledNow.delete(args.itemId)
    else disabledNow.add(args.itemId)
    const issues = key.items.filter((i) => i.kind === "issue")
    const minEnabled = Math.ceil(issues.length / 2)
    if (issues.filter((i) => !disabledNow.has(i.id)).length < minEnabled) {
      throw new Error(`At least ${minEnabled} planted issues must stay enabled for this scenario.`)
    }
    const existing = rows.find((r) => r.itemId === args.itemId)
    const patch = { enabled: args.enabled, updatedBy: await whoami(ctx, me.userId), updatedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, patch)
    else await ctx.db.insert("itemSettings", { scenarioId: args.scenarioId, itemId: args.itemId, ...patch })
    return await adverseImpactUnder(ctx, await loadConfig(ctx))
  },
})

export const setEmphasis = mutation({
  args: { category: v.string(), multiplier: v.number() },
  handler: async (ctx, args) => {
    const me = await requireOwner(ctx)
    if (!(args.multiplier >= EMPHASIS_MIN && args.multiplier <= EMPHASIS_MAX)) {
      throw new Error(`Emphasis must stay between ${EMPHASIS_MIN}× and ${EMPHASIS_MAX}× (validated range).`)
    }
    const row = await ctx.db.query("emphasis").withIndex("by_category", (q) => q.eq("category", args.category)).unique()
    const patch = { multiplier: Math.round(args.multiplier * 100) / 100, updatedBy: await whoami(ctx, me.userId), updatedAt: Date.now() }
    if (row) await ctx.db.patch(row._id, patch)
    else await ctx.db.insert("emphasis", { category: args.category, ...patch })
    return await adverseImpactUnder(ctx, await loadConfig(ctx))
  },
})

import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireOwner, requireRecruiter } from "./access"
import { ANSWER_KEYS } from "./answerKey"
import { gradeSubmission } from "./grading"
import { writeMetricRow } from "./submissions"
import { PROMPT_VERSION, RUBRIC_VERSION, assistantModel, callModel, getPanel, liveAsker } from "./judges"
import { parseModel } from "./providers"
import type { Trace } from "./judges"
import { SCORING_VERSION, itemOrdinal, overallFrom } from "./scoring"
import type { ComponentVec } from "./metrics"
import type { Result } from "./scoring"
import { ADVERSARIAL_CASES, PERTURBATIONS, REWRITE_SYSTEM } from "./evaluation"
import type { EvalSubmission } from "./evaluation"
import { buildDashboard } from "./dashboard"
import type { Slim } from "./dashboard"
import { scoreSummaryValidator } from "./schema"

// Offline evaluation runs (REL-3 test–retest, FB-2 perturbation, REL-7 golden
// set regression, REL-10 adversarial suite). Each run stores a plan of units
// and an action grades one unit at a time, rescheduling itself, so long runs
// never hit the action time limit. All runs use real judge calls and cost
// credits, so only recruiters can start them.

const RETEST_RUNS = 5
const MAX_GOLDEN = 100
const REF_SCENARIO = "ord-482-junior"

function versions() {
  return { rubric: RUBRIC_VERSION, prompt: PROMPT_VERSION, scoring: SCORING_VERSION }
}

async function createRun(
  ctx: MutationCtx,
  kind: "retest" | "perturbation" | "golden" | "adversarial",
  plan: string[],
  startedBy: string,
  submissionId?: Id<"submissions">,
) {
  if (plan.length === 0) throw new Error("Nothing to evaluate.")
  const runId = await ctx.db.insert("evalRuns", {
    kind,
    submissionId,
    status: "running",
    versions: versions(),
    models: getPanel().flatMap((j) => [j.primary.model, j.fallback.model]),
    plan,
    runs: [],
    startedBy,
    startedAt: Date.now(),
  })
  await ctx.scheduler.runAfter(0, internal.reliability.step, { runId, index: 0 })
  return runId
}

export const startRetest = mutation({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const sub = await ctx.db.get(args.submissionId)
    if (!sub) throw new Error("Submission not found.")
    return await createRun(ctx, "retest", Array.from({ length: RETEST_RUNS }, (_, i) => `run-${i + 1}`), me.email, args.submissionId)
  },
})

export const startPerturbation = mutation({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const sub = await ctx.db.get(args.submissionId)
    if (!sub) throw new Error("Submission not found.")
    return await createRun(ctx, "perturbation", PERTURBATIONS.map((p) => p.name), me.email, args.submissionId)
  },
})

export const startAdversarial = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireRecruiter(ctx)
    return await createRun(ctx, "adversarial", ADVERSARIAL_CASES.map((c) => c.label), me.email)
  },
})

export const startGolden = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireRecruiter(ctx)
    const labels = await ctx.db.query("goldenLabels").take(5000)
    const ids = [...new Set(labels.map((l) => l.submissionId as string))].slice(0, MAX_GOLDEN)
    return await createRun(ctx, "golden", ids, me.email)
  },
})

export const setBaseline = mutation({
  args: { runId: v.id("evalRuns") },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run || run.kind !== "golden" || run.status !== "done") throw new Error("Only a finished golden-set run can be the baseline.")
    const others = await ctx.db.query("evalRuns").withIndex("by_kind", (q) => q.eq("kind", "golden")).collect()
    for (const o of others) if (o.baseline) await ctx.db.patch(o._id, { baseline: false })
    await ctx.db.patch(args.runId, { baseline: true })
  },
})

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export const loadRun = internalQuery({
  args: { runId: v.id("evalRuns") },
  handler: async (ctx, args) => ctx.db.get(args.runId),
})

export const appendRun = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    summary: v.optional(scoreSummaryValidator),
    error: v.optional(v.string()),
    finished: v.boolean(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return
    await ctx.db.patch(args.runId, {
      runs: args.summary ? [...run.runs, args.summary] : run.runs,
      ...(args.error ? { status: "error" as const, error: args.error, finishedAt: Date.now() } : {}),
      ...(args.finished && !args.error ? { status: "done" as const, finishedAt: Date.now() } : {}),
    })
  },
})

export function summarize(label: string, r: Result) {
  return {
    label,
    overall: r.overall,
    band: r.band,
    foundCount: r.foundCount,
    needsReview: r.needsReview,
    items: r.items.map((i) => ({ id: i.id, score: itemOrdinal(i.kind, i.outcome, i.explanation) })),
  }
}

/** FB-2 non-native variant: one model rewrite per comment; falls back to the original text on failure. */
async function rewrite(text: string): Promise<string> {
  const ref = process.env.REWRITE_MODEL ? parseModel(process.env.REWRITE_MODEL, "rewrite") : assistantModel()
  try {
    const out = (await callModel(ref, `<comment_to_rewrite>\n${text}\n</comment_to_rewrite>`, REWRITE_SYSTEM)).trim()
    return out ? out.slice(0, 4000) : text
  } catch {
    return text
  }
}

/** EX-3: M1 grade of a live submission with the shadow panel (no cache: it measures the candidate config). */
export const shadow = internalAction({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const sub = await ctx.runQuery(internal.submissions.getInternal, { id: args.submissionId })
    const key = sub ? ANSWER_KEYS[sub.scenarioId] : undefined
    if (!sub || !key) return
    const panel = getPanel("SHADOW_PANEL_JSON")
    const traces: Trace[] = []
    const r = await gradeSubmission({ comments: sub.comments, verdict: sub.verdict, candidateName: sub.candidateName, candidateEmail: sub.candidateEmail }, key, liveAsker(traces), panel)
    await ctx.runMutation(internal.reliability.saveShadow, {
      submissionId: args.submissionId,
      models: panel.flatMap((j) => [j.primary.model, j.fallback.model]),
      summary: summarize("shadow", r),
    })
  },
})

export const saveShadow = internalMutation({
  args: { submissionId: v.id("submissions"), models: v.array(v.string()), summary: scoreSummaryValidator },
  handler: async (ctx, args) => {
    const old = await ctx.db.query("shadowResults").withIndex("by_submission", (q) => q.eq("submissionId", args.submissionId)).unique()
    if (old) await ctx.db.delete(old._id)
    await ctx.db.insert("shadowResults", { ...args, at: Date.now() })
  },
})

/** One-off for results graded before metricRows existed: `npx convex run reliability:backfillMetricRows`. */
export const backfillMetricRows = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("submissions").paginate({ cursor: args.cursor ?? null, numItems: 50 })
    let added = 0
    for (const s of page.page) {
      if (s.status === "graded" && (s.machineResult ?? s.result)) added += Number(await writeMetricRow(ctx, s))
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.reliability.backfillMetricRows, { cursor: page.continueCursor })
    return added
  },
})

export const step = internalAction({
  args: { runId: v.id("evalRuns"), index: v.number() },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.reliability.loadRun, { runId: args.runId })
    if (!run || run.status !== "running" || args.index >= run.plan.length) return
    const unit = run.plan[args.index]
    const traces: Trace[] = []
    const ask = liveAsker(traces)
    try {
      let summary
      if (run.kind === "adversarial") {
        const c = ADVERSARIAL_CASES.find((x) => x.label === unit)!
        const r = await gradeSubmission(c.submission, ANSWER_KEYS[REF_SCENARIO], ask)
        summary = { ...summarize(unit, r), expectation: c.expectation, passed: c.check(r) }
      } else {
        const subId = (run.kind === "golden" ? unit : run.submissionId) as Id<"submissions">
        const sub = await ctx.runQuery(internal.submissions.getInternal, { id: subId })
        if (!sub) throw new Error(`Submission ${subId} no longer exists`)
        let input: EvalSubmission = { candidateName: sub.candidateName, comments: sub.comments, verdict: sub.verdict }
        if (run.kind === "perturbation") {
          const p = PERTURBATIONS.find((x) => x.name === unit)!
          input = p.apply(input)
          if (p.llm) input = { ...input, comments: await Promise.all(input.comments.map(async (c) => ({ ...c, text: await rewrite(c.text) }))) }
        }
        const r = await gradeSubmission({ ...input, candidateEmail: sub.candidateEmail }, ANSWER_KEYS[sub.scenarioId], ask)
        summary = summarize(unit, r)
      }
      const finished = args.index + 1 >= run.plan.length
      await ctx.runMutation(internal.reliability.appendRun, { runId: args.runId, summary, finished })
      if (!finished) await ctx.scheduler.runAfter(0, internal.reliability.step, { runId: args.runId, index: args.index + 1 })
    } catch (err) {
      await ctx.runMutation(internal.reliability.appendRun, {
        runId: args.runId,
        error: err instanceof Error ? err.message : "Evaluation failed",
        finished: true,
      })
    } finally {
      if (traces.length) {
        await ctx.runMutation(internal.tracing.record, { evalRunId: args.runId, promptVersion: PROMPT_VERSION, traces })
      }
    }
  },
})

// ---------------------------------------------------------------------------
// Dashboard (REL-8)
// ---------------------------------------------------------------------------

const m1Overall = (m: Slim) =>
  overallFrom(Object.fromEntries(Object.entries(m.components).map(([k, c]) => [k, c.value])) as ComponentVec, m.weights as ComponentVec)

async function loadDashboard(ctx: QueryCtx) {
  // Slim rows (~2 KB each, written at grading time) keep this inside per-query read limits.
  const rows = await ctx.db.query("metricRows").withIndex("by_submittedAt").order("desc").take(2000)
  const subs = rows.map((r) => ({ _id: r.submissionId as string, scenarioId: r.scenarioId, submittedAt: r.submittedAt, machine: r.machine }))
  const labels = (await ctx.db.query("goldenLabels").take(8000)).map((l) => ({ ...l, submissionId: l.submissionId as string }))
  const runs = await ctx.db.query("evalRuns").order("desc").take(200)
  // EX-3: live (M1 machine) vs shadow panel on the same submissions.
  const live = new Map(rows.map((r) => [r.submissionId as string, r.machine]))
  const shadows = (await ctx.db.query("shadowResults").order("desc").take(500)).filter((x) => live.has(x.submissionId))
  const shadow = shadows.length
    ? {
        n: shadows.length,
        models: shadows[0].models,
        // The shadow grade is M1 only, so compare with the live M1 score (before the trajectory blend).
        meanAbsDelta: shadows.reduce((s, x) => s + Math.abs(x.summary.overall - m1Overall(live.get(x.submissionId)!)), 0) / shadows.length,
        itemAgreement: (() => {
          let agree = 0, n = 0
          for (const x of shadows) {
            const m = live.get(x.submissionId)!
            for (const it of x.summary.items) {
              const li = m.items.find((i) => i.id === it.id)
              if (!li) continue
              n++
              if ((itemOrdinal(li.kind, li.outcome, li.explanation) > 0) === (it.score > 0)) agree++
            }
          }
          return n ? agree / n : NaN
        })(),
      }
    : null
  return { data: { ...buildDashboard(subs, labels as any, runs), shadow }, runs }
}

// ---------------------------------------------------------------------------
// REL-7 in CI (scripts/ci-gate.mjs): start a golden-set run on a staging
// deployment with real models, then poll until the gate passes or fails.
// ---------------------------------------------------------------------------

export const ciStartGolden = internalMutation({
  args: {},
  handler: async (ctx) => {
    const labels = await ctx.db.query("goldenLabels").take(5000)
    const ids = [...new Set(labels.map((l) => l.submissionId as string))].slice(0, MAX_GOLDEN)
    if (!ids.length) return null
    return await createRun(ctx, "golden", ids, "ci")
  },
})

export const ciGateStatus = internalQuery({
  args: { runId: v.id("evalRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) return { status: "error" as const, error: "run not found" }
    if (run.status !== "done") return { status: run.status, done: run.runs.length, total: run.plan.length, error: run.error ?? null }
    const { data } = await loadDashboard(ctx)
    return { status: "done" as const, gate: data.gate && data.gate.candidateId === run._id ? data.gate : null }
  },
})

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    const { data, runs } = await loadDashboard(ctx)
    const recent = runs.slice(0, 20).map((r) => ({
      _id: r._id,
      kind: r.kind,
      status: r.status,
      done: r.runs.length,
      total: r.plan.length,
      baseline: !!r.baseline,
      error: r.error ?? null,
      startedAt: r.startedAt,
      startedBy: r.startedBy,
      versions: r.versions,
    }))
    return { ...data, recent }
  },
})

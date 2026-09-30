import { v } from "convex/values"
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireOwner, requireRecruiter } from "./access"
import { ANSWER_KEYS } from "./answerKey"
import { gradeSubmission } from "./grading"
import { PROMPT_VERSION, RUBRIC_VERSION, getPanel, liveAsker } from "./judges"
import type { Trace } from "./judges"
import { SCORING_VERSION, itemOrdinal } from "./scoring"
import type { Result } from "./scoring"
import { ADVERSARIAL_CASES, PERTURBATIONS } from "./evaluation"
import type { EvalSubmission } from "./evaluation"
import { buildDashboard } from "./dashboard"
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
        if (run.kind === "perturbation") input = PERTURBATIONS.find((p) => p.name === unit)!.apply(input)
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

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    // Bounded to stay well inside Convex per-query read limits (~20 KB per result).
    // Beyond a few hundred graded submissions, move these metrics to incremental aggregates.
    const rows = await ctx.db.query("submissions").withIndex("by_submittedAt").order("desc").take(300)
    const subs = rows
      .filter((r) => r.status === "graded" && (r.machineResult ?? r.result))
      .map((r) => ({ _id: r._id as string, scenarioId: r.scenarioId, submittedAt: r.submittedAt, machine: (r.machineResult ?? r.result)! }))
    const labels = (await ctx.db.query("goldenLabels").take(8000)).map((l) => ({ ...l, submissionId: l.submissionId as string }))
    const runs = await ctx.db.query("evalRuns").order("desc").take(200)
    const data = buildDashboard(subs, labels as any, runs)
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

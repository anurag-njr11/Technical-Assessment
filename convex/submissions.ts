import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { commentValidator, resultValidator, verdictValidator } from "./schema"
import { ANSWER_KEYS, SCENARIO_META } from "./answerKey"
import { requireOwner, requireRecruiter } from "./access"
import { requireActive } from "./candidates"
import { LIMITS, hit } from "./rateLimit"
import { applyOverrides } from "./scoring"
import type { Override, Result } from "./scoring"

// FR-C-18 server limits.
export const MAX_COMMENTS = 40
export const MAX_TEXT = 4000
export const MAX_ANSWERS = 10

type CommentIn = { id: string; file: string; line: number; severity: string; text: string }

export function validateWork(comments: CommentIn[], answers: string[], opts: { allowEmptyAnswers?: boolean } = {}) {
  if (comments.length > MAX_COMMENTS) throw new Error("Too many comments.")
  if (answers.length > MAX_ANSWERS) throw new Error("Too many answers.")
  const ids = new Set<string>()
  for (const c of comments) {
    if (!c.text.trim()) throw new Error("Comments cannot be empty.")
    if (c.text.length > MAX_TEXT) throw new Error("A comment is too long.")
    if (c.id.length > 64 || c.file.length > 300) throw new Error("Invalid comment.")
    if (ids.has(c.id)) throw new Error("Duplicate comment id.")
    ids.add(c.id)
  }
  for (const a of answers) {
    if (a.length > MAX_TEXT) throw new Error("An answer is too long.")
    if (!opts.allowEmptyAnswers && !a.trim()) throw new Error("Answer every follow-up question.")
  }
}

function decisionComment(sections: string[], answers: string[]): CommentIn[] {
  const text = sections
    .map((q, i) => ({ q, a: (answers[i] ?? "").trim() }))
    .filter((x) => x.a)
    .map((x) => `${x.q}\n${x.a}`)
    .join("\n\n")
  return text ? [{ id: "critique", file: "decision.md", line: 1, severity: "high", text }] : []
}

/** Creates the submission for a candidate, marks the invite used, schedules grading. */
export async function insertSubmission(
  ctx: MutationCtx,
  candidate: Doc<"candidates">,
  work: {
    verdict: "approve" | "request_changes" | "none"
    comments: CommentIn[]
    answers: string[]
    autoSubmitted: boolean
    build?: Doc<"submissions">["build"]
  },
): Promise<Id<"submissions">> {
  const meta = SCENARIO_META[candidate.scenarioId]
  // M2: the structured critique is graded as one combined comment.
  const comments =
    meta.kind === "decision"
      ? decisionComment(meta.followUps, work.answers)
      : work.comments
  const id = await ctx.db.insert("submissions", {
    candidateName: candidate.name,
    candidateId: candidate._id,
    scenarioId: candidate.scenarioId,
    scenarioVersion: meta.version,
    level: meta.level,
    verdict: work.verdict,
    comments: comments.map((c) => ({ ...c, severity: c.severity as "critical" | "high" | "medium" | "low" })),
    followUps: meta.followUps.map((question, i) => ({ question, answer: (work.answers[i] ?? "").trim() })),
    autoSubmitted: work.autoSubmitted || undefined,
    build: work.build,
    status: "grading",
    submittedAt: Date.now(),
  })
  await ctx.db.patch(candidate._id, { status: "submitted", submissionId: id })
  const draft = await ctx.db
    .query("autosaves")
    .withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id))
    .unique()
  if (draft) await ctx.db.delete(draft._id)
  await ctx.scheduler.runAfter(0, internal.grading.grade, { submissionId: id })
  return id
}

// Public: authorised only by the single-use invite token. Returns nothing (SEC-12).
export const submit = mutation({
  args: {
    token: v.string(),
    // Required for code and decision reviews; M3 builds have no verdict.
    verdict: v.optional(verdictValidator),
    comments: v.array(commentValidator),
    answers: v.array(v.string()),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const candidate = await requireActive(ctx, args.token)
    await hit(ctx, "submit:global", LIMITS.submitsPerHour())
    const meta = SCENARIO_META[candidate.scenarioId]
    if (meta.kind === "build") {
      const code = args.code ?? ""
      if (!code.trim() || code.length > 20000) throw new Error("Submit your code (max 20,000 characters).")
      const draft = await ctx.db
        .query("autosaves")
        .withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id))
        .unique()
      await insertSubmission(ctx, candidate, {
        verdict: "none",
        comments: [],
        answers: [],
        autoSubmitted: false,
        build: { code, events: draft?.events ?? [] },
      })
      return null
    }
    if (!args.verdict) throw new Error("Choose a verdict before submitting.")
    if (args.answers.length !== meta.followUps.length) throw new Error("Answer every follow-up question.")
    validateWork(args.comments, args.answers)
    // FR-C-8: the review locked when the candidate moved to follow-ups.
    const draft = await ctx.db
      .query("autosaves")
      .withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id))
      .unique()
    const locked = draft?.step === "followup"
    await insertSubmission(ctx, candidate, {
      verdict: locked && draft.verdict ? draft.verdict : args.verdict!,
      comments: locked ? draft.comments : args.comments,
      answers: args.answers,
      autoSubmitted: false,
      // PR-author chat on code reviews.
      build: draft?.events?.length ? { code: "", events: draft.events } : undefined,
    })
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
      autoSubmitted: !!r.autoSubmitted,
      overall: r.result?.overall,
      band: r.result?.band,
      found: r.result?.foundCount,
      total: r.result?.issueCount,
      needsReview: r.result?.needsReview,
      reviewResolved: r.humanReview?.status === "resolved",
      kind: SCENARIO_META[r.scenarioId]?.kind ?? "code",
      appealOpen: r.appeal?.status === "open",
      released: !!r.released,
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

/** Owner-only: permanently deletes a submission and everything derived from it (SEC-17). */
export const remove = mutation({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    await requireOwner(ctx)
    const row = await ctx.db.get(args.id)
    if (!row) return
    for (const table of ["reviews", "goldenLabels", "judgeCalls", "outcomes"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_submission", (q) => q.eq("submissionId", args.id))
        .collect()
      for (const r of rows) await ctx.db.delete(r._id)
    }
    if (row.candidateId) {
      const c = await ctx.db.get(row.candidateId)
      if (c) await ctx.db.delete(c._id)
    }
    await ctx.db.delete(args.id)
  },
})

/** TR-4: share (or stop sharing) the results summary with the candidate. */
export const setReleased = mutation({
  args: { id: v.id("submissions"), released: v.boolean() },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const row = await ctx.db.get(args.id)
    if (!row || row.status !== "graded") throw new Error("Only graded submissions can be shared.")
    await ctx.db.patch(args.id, { released: args.released })
  },
})

export const getInternal = internalQuery({
  args: { id: v.id("submissions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id)
    if (!sub) return null
    const candidate = sub.candidateId ? await ctx.db.get(sub.candidateId) : null
    return { ...sub, candidateEmail: candidate?.email }
  },
})

export async function loadOverrides(ctx: { db: MutationCtx["db"] }, id: Id<"submissions">): Promise<Override[]> {
  const rows = await ctx.db
    .query("reviews")
    .withIndex("by_submission", (q) => q.eq("submissionId", id))
    .collect()
  return rows
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) =>
      r.target === "item"
        ? { target: "item" as const, targetId: r.targetId, after: r.after, afterExplanation: r.afterExplanation, commentId: r.commentId }
        : { target: "comment" as const, targetId: r.targetId, after: r.after },
    )
}

export function effectiveResult(sub: Doc<"submissions">, machine: Result, overrides: Override[]): Result {
  if (overrides.length === 0) return machine
  const key = ANSWER_KEYS[sub.scenarioId]
  return applyOverrides(machine, overrides, {
    comments: sub.comments,
    verdict: sub.verdict,
    // M3 builds have no answer key; their "verdict" slot is task completion.
    expectedVerdict: key?.expectedVerdict ?? "none",
  })
}

export const saveResult = internalMutation({
  args: { id: v.id("submissions"), result: resultValidator },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.id)
    if (!sub) return
    // A regrade keeps earlier human overrides: they are re-applied to the new machine result.
    const overrides = await loadOverrides(ctx, args.id)
    await ctx.db.patch(args.id, {
      status: "graded",
      machineResult: args.result,
      result: effectiveResult(sub, args.result, overrides),
      error: undefined,
    })
  },
})

export const saveError = internalMutation({
  args: { id: v.id("submissions"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "error", error: args.error })
  },
})

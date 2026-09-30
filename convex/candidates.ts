import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { commentValidator, verdictValidator } from "./schema"
import { ANSWER_KEYS, SCENARIO_META } from "./answerKey"
import { requireRecruiter } from "./access"
import { LIMITS, hit } from "./rateLimit"
import { insertSubmission, validateWork } from "./submissions"

// FR-C-12 single-use invite links, FR-C-13 autosave, FR-C-14 enforced timer,
// FR-C-16 extra-time accommodations.

/** Submissions are accepted this long after the deadline (network slack). */
export const GRACE_MS = 2 * 60 * 1000

function newToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function byToken(ctx: { db: QueryCtx["db"] }, token: string): Promise<Doc<"candidates"> | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null
  return await ctx.db
    .query("candidates")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique()
}

/** Throws unless the attempt behind `token` is in progress and within time. */
export async function requireActive(ctx: MutationCtx, token: string): Promise<Doc<"candidates">> {
  const c = await byToken(ctx, token)
  if (!c) throw new Error("This assessment link is not valid.")
  if (c.status === "revoked") throw new Error("This assessment link has been withdrawn.")
  if (c.status === "submitted") throw new Error("This assessment has already been submitted.")
  if (c.status !== "started" || !c.deadline) throw new Error("Start the assessment first.")
  if (Date.now() > c.deadline + GRACE_MS) throw new Error("Time is up. Your saved work was submitted automatically.")
  return c
}

// ---------------------------------------------------------------------------
// Recruiter side
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    scenarioId: v.string(),
    extraMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const name = args.name.trim()
    if (!name || name.length > 120) throw new Error("Enter the candidate's name (max 120 characters).")
    const email = args.email?.trim().toLowerCase() || undefined
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
      throw new Error("Enter a valid email address.")
    }
    if (!ANSWER_KEYS[args.scenarioId]) throw new Error("Unknown scenario.")
    const extraMinutes = args.extraMinutes ?? 0
    if (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 120) {
      throw new Error("Extra time must be a whole number of minutes between 0 and 120.")
    }
    const token = newToken()
    const id = await ctx.db.insert("candidates", {
      name,
      email,
      scenarioId: args.scenarioId,
      token,
      extraMinutes,
      status: "invited",
      createdBy: me.userId,
      createdAt: Date.now(),
    })
    return { id, token }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRecruiter(ctx)
    const rows = await ctx.db.query("candidates").withIndex("by_createdAt").order("desc").take(200)
    return rows.map((c) => ({
      _id: c._id,
      name: c.name,
      email: c.email ?? null,
      scenarioId: c.scenarioId,
      token: c.token,
      extraMinutes: c.extraMinutes,
      status: c.status,
      createdAt: c.createdAt,
      deadline: c.deadline ?? null,
      submissionId: c.submissionId ?? null,
    }))
  },
})

export const revoke = mutation({
  args: { id: v.id("candidates") },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const c = await ctx.db.get(args.id)
    if (!c) return
    if (c.status === "submitted") throw new Error("This candidate has already submitted.")
    await ctx.db.patch(args.id, { status: "revoked" })
  },
})

// ---------------------------------------------------------------------------
// Candidate side (public, authorised by the unguessable token)
// ---------------------------------------------------------------------------

export const session = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const c = await byToken(ctx, args.token)
    if (!c) return null
    const meta = SCENARIO_META[c.scenarioId]
    const draft =
      c.status === "started"
        ? await ctx.db
            .query("autosaves")
            .withIndex("by_candidate", (q) => q.eq("candidateId", c._id))
            .unique()
        : null
    return {
      name: c.name,
      scenarioId: c.scenarioId,
      status: c.status,
      minutes: meta.minutes + c.extraMinutes,
      extraMinutes: c.extraMinutes,
      deadline: c.deadline ?? null,
      graceMs: GRACE_MS,
      draft: draft
        ? { step: draft.step, comments: draft.comments, verdict: draft.verdict ?? null, answers: draft.answers, updatedAt: draft.updatedAt }
        : null,
    }
  },
})

export const start = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await hit(ctx, "start:global", LIMITS.startsPerHour())
    const c = await byToken(ctx, args.token)
    if (!c) throw new Error("This assessment link is not valid.")
    if (c.status === "revoked") throw new Error("This assessment link has been withdrawn.")
    if (c.status === "submitted") throw new Error("This assessment has already been submitted.")
    if (c.status === "started") return { deadline: c.deadline! }
    const meta = SCENARIO_META[c.scenarioId]
    const startedAt = Date.now()
    const deadline = startedAt + (meta.minutes + c.extraMinutes) * 60 * 1000
    await ctx.db.patch(c._id, { status: "started", startedAt, deadline })
    await ctx.db.insert("autosaves", {
      candidateId: c._id,
      step: "review",
      comments: [],
      answers: meta.followUps.map(() => ""),
      updatedAt: startedAt,
    })
    await ctx.scheduler.runAt(deadline + GRACE_MS, internal.candidates.autoClose, { candidateId: c._id })
    return { deadline }
  },
})

export const saveDraft = mutation({
  args: {
    token: v.string(),
    step: v.union(v.literal("review"), v.literal("followup")),
    comments: v.array(commentValidator),
    verdict: v.optional(verdictValidator),
    answers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const c = await requireActive(ctx, args.token)
    await hit(ctx, `draft:${c._id}`, LIMITS.draftSavesPerHour)
    validateWork(args.comments, args.answers, { allowEmptyAnswers: true })
    const draft = await ctx.db
      .query("autosaves")
      .withIndex("by_candidate", (q) => q.eq("candidateId", c._id))
      .unique()
    // FR-C-8: once the candidate moved on to follow-ups, the review is locked.
    const locked = draft?.step === "followup"
    const patch = {
      step: locked ? ("followup" as const) : args.step,
      comments: locked ? draft.comments : args.comments,
      verdict: locked ? draft.verdict : args.verdict,
      answers: args.answers,
      updatedAt: Date.now(),
    }
    if (draft) await ctx.db.patch(draft._id, patch)
    else await ctx.db.insert("autosaves", { candidateId: c._id, ...patch })
    return { savedAt: patch.updatedAt }
  },
})

/** FR-C-14: at deadline + grace, whatever was autosaved is submitted. */
export const autoClose = internalMutation({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.candidateId)
    if (!c || c.status !== "started") return
    const draft = await ctx.db
      .query("autosaves")
      .withIndex("by_candidate", (q) => q.eq("candidateId", c._id))
      .unique()
    await insertSubmission(ctx, c, {
      verdict: draft?.verdict ?? "none",
      comments: draft?.comments ?? [],
      answers: draft?.answers ?? [],
      autoSubmitted: true,
    })
  },
})

import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { commentValidator, verdictValidator } from "./schema"
import { BATTERIES, SCENARIO_META } from "./answerKey"
import { requireRecruiter } from "./access"
import { LIMITS, hit } from "./rateLimit"
import { insertSubmission, validateWork } from "./submissions"

// FR-C-12 single-use invite links, FR-C-13 autosave, FR-C-14 enforced timer,
// FR-C-16 extra-time accommodations.

/** Submissions are accepted this long after the deadline (network slack). */
export const GRACE_MS = 2 * 60 * 1000

export function newToken(): string {
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

/** Time limit before accommodations: the assessment's if the candidate joined via one, else the scenario's. */
async function baseMinutes(ctx: { db: QueryCtx["db"] }, c: Doc<"candidates">): Promise<number> {
  const a = c.assessmentId ? await ctx.db.get(c.assessmentId) : null
  return a?.minutes ?? SCENARIO_META[c.scenarioId].minutes
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
    // Exactly one of scenarioId (single module) or batteryId (CU-3 battery).
    scenarioId: v.optional(v.string()),
    batteryId: v.optional(v.string()),
    extraMinutes: v.optional(v.number()),
    benchmark: v.optional(v.boolean()),
    group: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const name = args.name.trim()
    if (!name || name.length > 120) throw new Error("Enter the candidate's name (max 120 characters).")
    const email = args.email?.trim().toLowerCase() || undefined
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
      throw new Error("Enter a valid email address.")
    }
    const battery = args.batteryId ? BATTERIES[args.batteryId] : undefined
    if (args.batteryId && !battery) throw new Error("Unknown battery.")
    const scenarioIds = battery ? battery.scenarioIds : args.scenarioId ? [args.scenarioId] : []
    if (!scenarioIds.length || scenarioIds.some((id) => !SCENARIO_META[id])) throw new Error("Unknown scenario.")
    const extraMinutes = args.extraMinutes ?? 0
    if (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 120) {
      throw new Error("Extra time must be a whole number of minutes between 0 and 120.")
    }
    const group = args.group?.trim().slice(0, 60) || undefined
    const groupToken = battery ? newToken() : undefined
    let first: { id: Id<"candidates">; token: string } | null = null
    for (const scenarioId of scenarioIds) {
      const token = newToken()
      const id = await ctx.db.insert("candidates", {
        name,
        email,
        scenarioId,
        token,
        extraMinutes,
        status: "invited",
        createdBy: me.userId,
        createdAt: Date.now(),
        groupToken,
        batteryId: args.batteryId,
        benchmark: args.benchmark || undefined,
        group,
      })
      first ??= { id, token }
    }
    return { ...first!, groupToken: groupToken ?? null }
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
      groupToken: c.groupToken ?? null,
      batteryId: c.batteryId ?? null,
      benchmark: !!c.benchmark,
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
      kind: meta.kind,
      groupToken: c.groupToken ?? null,
      status: c.status,
      minutes: (await baseMinutes(ctx, c)) + c.extraMinutes,
      extraMinutes: c.extraMinutes,
      deadline: c.deadline ?? null,
      graceMs: GRACE_MS,
      draft: draft
        ? {
            step: draft.step,
            comments: draft.comments,
            verdict: draft.verdict ?? null,
            answers: draft.answers,
            code: draft.code ?? null,
            // The chat transcript is rebuilt from the recorded trajectory.
            chat: (draft.events ?? [])
              .filter((e) => e.type === "ai_prompt" || e.type === "ai_response")
              .map((e) => ({ id: e.id, type: e.type, data: e.data ?? "" })),
            updatedAt: draft.updatedAt,
          }
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
    const deadline = startedAt + ((await baseMinutes(ctx, c)) + c.extraMinutes) * 60 * 1000
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
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const c = await requireActive(ctx, args.token)
    if (args.code !== undefined && args.code.length > 20000) throw new Error("The code is too long.")
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
      ...(args.code !== undefined ? { code: args.code } : {}),
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
      build:
        SCENARIO_META[c.scenarioId].kind === "build"
          ? { code: draft?.code ?? "", events: draft?.events ?? [] }
          : draft?.events?.length ? { code: "", events: draft.events } : undefined,
    })
  },
})

// ---------------------------------------------------------------------------
// CU-3 battery landing page
// ---------------------------------------------------------------------------

export const group = query({
  args: { groupToken: v.string() },
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{48}$/.test(args.groupToken)) return null
    const rows = await ctx.db.query("candidates").withIndex("by_group", (q) => q.eq("groupToken", args.groupToken)).collect()
    if (!rows.length) return null
    const battery = rows[0].batteryId ? BATTERIES[rows[0].batteryId] : undefined
    const order = battery?.scenarioIds ?? rows.map((r) => r.scenarioId)
    return {
      name: rows[0].name,
      battery: battery?.name ?? "Assessment",
      modules: order
        .map((id) => rows.find((r) => r.scenarioId === id))
        .filter((r): r is Doc<"candidates"> => !!r)
        .map((r) => ({
          scenarioId: r.scenarioId,
          title: SCENARIO_META[r.scenarioId].title,
          kind: SCENARIO_META[r.scenarioId].kind,
          minutes: SCENARIO_META[r.scenarioId].minutes + r.extraMinutes,
          status: r.status,
          token: r.token,
        })),
    }
  },
})

// ---------------------------------------------------------------------------
// TR-4 candidate results and TR-5 appeals
// ---------------------------------------------------------------------------

export const results = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const c = await byToken(ctx, args.token)
    if (!c || !c.submissionId) return null
    const sub = await ctx.db.get(c.submissionId)
    if (!sub) return null
    const meta = SCENARIO_META[c.scenarioId]
    if (!sub.released || !sub.result) {
      return { released: false as const, name: c.name, title: meta.title, appeal: sub.appeal ?? null }
    }
    const r = sub.result
    const cats = (outcome: string) => [
      ...new Set(r.items.filter((i) => i.kind === "issue" && i.outcome === outcome).map((i) => i.category)),
    ]
    return {
      released: true as const,
      name: c.name,
      title: meta.title,
      kind: meta.kind,
      overall: r.overall,
      band: r.band,
      components: r.components,
      weights: r.weights,
      strengths: cats("found"),
      gaps: cats("missed").filter((x) => !cats("found").includes(x)),
      falseAlarms: r.items.filter((i) => i.kind === "decoy" && i.outcome === "false_alarm").length,
      // The answer key is only revealed for retired scenarios.
      answerKey: meta.retired ? r.items.map((i) => ({ title: i.title, outcome: i.outcome })) : null,
      humanReviewed: !!sub.humanReview,
      appeal: sub.appeal ?? null,
    }
  },
})

export const appeal = mutation({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const c = await byToken(ctx, args.token)
    if (!c || !c.submissionId) throw new Error("No submission found for this link.")
    const sub = await ctx.db.get(c.submissionId)
    if (!sub) throw new Error("No submission found for this link.")
    if (sub.appeal) throw new Error("You have already requested a review.")
    const text = args.text.trim()
    if (text.length < 20) throw new Error("Tell us briefly what you think was graded wrongly (at least 20 characters).")
    if (text.length > 4000) throw new Error("Please keep your request under 4000 characters.")
    await ctx.db.patch(sub._id, { appeal: { text, at: Date.now(), status: "open" } })
  },
})

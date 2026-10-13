import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"
import { SCENARIO_META } from "./answerKey"
import { requireRecruiter } from "./access"
import { hit } from "./rateLimit"
import { newToken } from "./candidates"
import { internal } from "./_generated/api"
import { siteUrl } from "./email"

// One reusable link / QR per role config. Each visitor who joins gets their
// own `candidates` row and token, then continues the normal /assess flow.

export const ROLES = ["AI Engineer", "Software Engineer", "Backend Engineer", "ML Engineer", "Full-Stack Engineer"]
const LEVELS = ["Junior", "Mid", "Senior"]
/** Joins allowed per assessment link per hour. */
const JOINS_PER_HOUR = 200
/** A joined link must be started within this many days. */
export const JOIN_EXPIRY_DAYS = 7

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function byToken(ctx: { db: QueryCtx["db"] }, token: string): Promise<Doc<"assessments"> | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null
  return await ctx.db
    .query("assessments")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique()
}

async function candidatesOf(ctx: { db: QueryCtx["db"] }, a: Doc<"assessments">) {
  return await ctx.db
    .query("candidates")
    .withIndex("by_assessment", (q) => q.eq("assessmentId", a._id))
    .collect()
}

// ---------------------------------------------------------------------------
// Recruiter side
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    role: v.string(),
    scenarioId: v.string(),
    level: v.string(),
    minutes: v.number(),
    aiAssisted: v.boolean(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    if (!ROLES.includes(args.role)) throw new Error("Unknown role.")
    const meta = SCENARIO_META[args.scenarioId]
    if (!meta) throw new Error("Unknown scenario.")
    if (!LEVELS.includes(args.level)) throw new Error("Level must be Junior, Mid or Senior.")
    if (!Number.isInteger(args.minutes) || args.minutes < 10 || args.minutes > 90) {
      throw new Error("Time limit must be a whole number of minutes between 10 and 90.")
    }
    if (args.aiAssisted && meta.kind === "decision") throw new Error("AI-assisted mode needs a code review or build module.")
    if (!args.aiAssisted && meta.kind === "build") throw new Error("Build with AI modules need AI-assisted mode on.")
    const title = args.title?.trim().slice(0, 120) || `${args.role} · ${meta.title}`
    const token = newToken()
    const id = await ctx.db.insert("assessments", {
      title,
      role: args.role,
      scenarioId: args.scenarioId,
      level: args.level,
      minutes: args.minutes,
      aiAssisted: args.aiAssisted,
      token,
      status: "active",
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
    const rows = await ctx.db.query("assessments").withIndex("by_createdAt").order("desc").take(100)
    return await Promise.all(
      rows.map(async (a) => {
        const cands = await candidatesOf(ctx, a)
        const count = (s: Doc<"candidates">["status"]) => cands.filter((c) => c.status === s).length
        const scores: number[] = []
        for (const c of cands) {
          const sub = c.submissionId ? await ctx.db.get(c.submissionId) : null
          if (sub?.status === "graded" && sub.result) scores.push(sub.result.overall)
        }
        return {
          ...a,
          counts: { invited: count("invited"), started: count("started"), submitted: count("submitted") },
          avgScore: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
        }
      }),
    )
  },
})

export const get = query({
  args: { id: v.id("assessments") },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    const a = await ctx.db.get(args.id)
    if (!a) return null
    const cands = await candidatesOf(ctx, a)
    const candidates = await Promise.all(
      cands.map(async (c) => {
        const sub = c.submissionId ? await ctx.db.get(c.submissionId) : null
        return {
          _id: c._id,
          name: c.name,
          email: c.email ?? null,
          status: c.status,
          createdAt: c.createdAt,
          startedAt: c.startedAt ?? null,
          submissionId: c.submissionId ?? null,
          gradingStatus: sub?.status ?? null,
          score: sub?.result?.overall ?? null,
          band: sub?.result?.band ?? null,
          needsReview: sub?.result?.needsReview ?? null,
          humanReview: sub?.humanReview?.status ?? null,
          submittedAt: sub?.submittedAt ?? null,
          verdict: sub?.verdict ?? null,
          // Per-dimension trajectory scores (0-100) for the comparison table.
          dimensions: Object.fromEntries((sub?.result?.trajectory?.dimensions ?? []).map((d) => [d.key, d.score])),
          tokens: (sub?.build?.events ?? []).reduce((t, e) => t + (e.tokens ? e.tokens.input + e.tokens.output : 0), 0),
        }
      }),
    )
    return { ...a, candidates }
  },
})

/** Emails the shared assessment link to a list of candidates. */
export const emailLink = mutation({
  args: { id: v.id("assessments"), emails: v.array(v.string()) },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    const a = await ctx.db.get(args.id)
    if (!a) throw new Error("Assessment not found.")
    if (a.status !== "active") throw new Error("Reopen the assessment before sending its link.")
    const emails = [...new Set(args.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
    if (!emails.length) throw new Error("Enter at least one email address.")
    if (emails.length > 50) throw new Error("Send to at most 50 addresses at a time.")
    const bad = emails.find((e) => !EMAIL_RE.test(e) || e.length > 254)
    if (bad) throw new Error(`Not a valid email address: ${bad}`)
    await hit(ctx, `emailLink:${me.userId}`, 20)
    for (const to of emails) {
      await ctx.scheduler.runAfter(0, internal.email.send, {
        to,
        subject: `Assessment: ${a.title}`,
        text: `Hi,

You've been invited to take "${a.title}" (${a.minutes} minutes). Open the link, enter your name and press Start when you're ready.

${siteUrl(`/a/${a.token}`)}`,
      })
    }
    return emails.length
  },
})

export const setStatus = mutation({
  args: { id: v.id("assessments"), status: v.union(v.literal("active"), v.literal("closed")) },
  handler: async (ctx, args) => {
    await requireRecruiter(ctx)
    if (!(await ctx.db.get(args.id))) throw new Error("Assessment not found.")
    await ctx.db.patch(args.id, { status: args.status })
  },
})

// ---------------------------------------------------------------------------
// Candidate side (public, authorised by the unguessable assessment token)
// ---------------------------------------------------------------------------

export const publicInfo = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const a = await byToken(ctx, args.token)
    if (!a) return null
    return { title: a.title, role: a.role, level: a.level, minutes: a.minutes, aiAssisted: a.aiAssisted, open: a.status === "active" }
  },
})

export const join = mutation({
  args: { token: v.string(), name: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const a = await byToken(ctx, args.token)
    if (!a) throw new Error("This assessment link is not valid.")
    await hit(ctx, `join:${a.token}`, JOINS_PER_HOUR)
    if (a.status !== "active") throw new Error("This assessment is closed.")
    const name = args.name.trim()
    if (!name || name.length > 120) throw new Error("Enter your name (max 120 characters).")
    const email = args.email?.trim().toLowerCase() || undefined
    if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
      throw new Error("Enter a valid email address.")
    }
    // Same email joining again (another device): never hand the existing token to whoever typed
    // the address; email it to the address instead.
    const existing = email ? (await candidatesOf(ctx, a)).find((c) => c.email === email) : undefined
    if (existing) {
      if (existing.status === "submitted") throw new Error("You have already submitted this assessment.")
      if (existing.status === "revoked") throw new Error("Your attempt was withdrawn. Contact the hiring team.")
      await ctx.scheduler.runAfter(0, internal.email.send, {
        to: email!,
        subject: `Continue your assessment: ${a.title}`,
        text: `Hi ${existing.name},

Here is your personal link to continue where you left off:

${siteUrl(`/assess?t=${existing.token}`)}`,
      })
      return { candidateToken: null, emailed: true }
    }
    const candidateToken = newToken()
    await ctx.db.insert("candidates", {
      name,
      email,
      scenarioId: a.scenarioId,
      token: candidateToken,
      extraMinutes: 0,
      status: "invited",
      createdBy: a.createdBy,
      createdAt: Date.now(),
      assessmentId: a._id,
      expiresAt: Date.now() + JOIN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    })
    return { candidateToken, emailed: false }
  },
})

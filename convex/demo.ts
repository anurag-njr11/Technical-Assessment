import { getAuthUserId } from "@convex-dev/auth/server"
import { internalMutation, mutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { SCENARIO_META } from "./answerKey"
import { newToken } from "./candidates"
import { PERSONAS } from "./demoData"
import { hit } from "./rateLimit"
import { deleteCandidate, deleteSubmission, insertSubmission } from "./submissions"

// Public demo (no sign-up). "Try the live demo" signs the visitor in
// anonymously and adds them as a read-only viewer of one shared demo
// workspace, created and seeded on first use: four assessments with live
// links, and six candidates whose work goes through the real grading
// pipeline. Visitors can take any of the assessments themselves and watch
// their own report appear. A nightly job removes visitor attempts and
// viewer memberships; the seeded candidates stay.

export const DEMO_NAME = "Northwind Payments (demo)"
const DAY = 24 * 60 * 60 * 1000

const ASSESSMENTS = [
  { role: "Backend Engineer", scenarioId: "pay-217-mid", level: "Mid", minutes: 35 },
  { role: "Backend Engineer", scenarioId: "adr-031-mid", level: "Mid", minutes: 20 },
  { role: "Full-Stack Engineer", scenarioId: "disc-12-build", level: "Mid", minutes: 30 },
  { role: "Software Engineer", scenarioId: "ord-482-junior", level: "Junior", minutes: 25 },
]

async function demoWorkspace(ctx: MutationCtx) {
  return await ctx.db.query("workspaces").withIndex("by_demo", (q) => q.eq("demo", true)).first()
}

/** Creates and seeds the demo workspace the first time anyone opens the demo. */
async function ensureDemo(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"workspaces">> {
  const existing = await demoWorkspace(ctx)
  if (existing) return existing._id
  const now = Date.now()
  const workspaceId = await ctx.db.insert("workspaces", { name: DEMO_NAME, createdBy: userId, createdAt: now, demo: true })
  const assessmentOf = new Map<string, Id<"assessments">>()
  for (const a of ASSESSMENTS) {
    const meta = SCENARIO_META[a.scenarioId]
    assessmentOf.set(a.scenarioId, await ctx.db.insert("assessments", {
      workspaceId, title: `${a.role} · ${meta.title}`, ...a, aiAssisted: true,
      token: newToken(), status: "active", createdBy: userId, createdAt: now - 2 * DAY,
    }))
  }
  for (const p of PERSONAS) {
    const startedAt = now - p.startedAgoMin * 60_000
    const candidateId = await ctx.db.insert("candidates", {
      workspaceId, name: p.name, email: p.email, scenarioId: p.scenarioId, token: newToken(), extraMinutes: 0,
      status: "started", createdBy: userId, createdAt: startedAt - 60_000, startedAt,
      deadline: startedAt + 60 * 60_000, assessmentId: assessmentOf.get(p.scenarioId), demoSeed: true,
    })
    const candidate = (await ctx.db.get(candidateId))!
    const submissionId = await insertSubmission(ctx, candidate, {
      verdict: p.verdict ?? "none",
      comments: p.comments,
      answers: p.answers,
      autoSubmitted: false,
      build: p.events.length || p.code ? { code: p.code ?? "", events: p.events } : undefined,
    })
    await ctx.db.patch(submissionId, { submittedAt: startedAt + p.tookMin * 60_000 })
  }
  return workspaceId
}

export const join = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Sign in required.")
    await hit(ctx, "demo:join", 600)
    const workspaceId = await ensureDemo(ctx, userId)
    const member = await ctx.db.query("recruiters").withIndex("by_userId", (q) => q.eq("userId", userId)).unique()
    if (member?.workspaceId === workspaceId) return workspaceId
    if (member) throw new Error("You're signed in to your own workspace. Sign out to view the demo.")
    await ctx.db.insert("recruiters", { workspaceId, userId, email: "demo visitor", role: "viewer", joinedAt: Date.now() })
    return workspaceId
  },
})

/** Nightly: drop visitor attempts and viewer memberships older than a day; seeded candidates stay. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ws = await demoWorkspace(ctx)
    if (!ws) return { removed: 0 }
    let removed = 0
    for (const c of await ctx.db.query("candidates").withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id)).collect()) {
      if (c.demoSeed) continue
      if (c.submissionId) await deleteSubmission(ctx, c.submissionId)
      else await deleteCandidate(ctx, c._id)
      removed++
    }
    for (const m of await ctx.db.query("recruiters").withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id)).collect()) {
      if (m.role === "viewer" && m.joinedAt < Date.now() - DAY) await ctx.db.delete(m._id)
    }
    return { removed }
  },
})

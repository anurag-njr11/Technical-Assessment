import { internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import { deleteCandidate, deleteSubmission } from "./submissions"

// SEC-17: data retention. With RETENTION_DAYS set, a daily job deletes
// submissions (and everything derived from them) and unsubmitted candidates
// older than that. Unset = keep everything.

const DAY = 24 * 60 * 60 * 1000
const BATCH = 100

export const retentionDays = () => {
  const n = Number(process.env.RETENTION_DAYS)
  return Number.isFinite(n) && n > 0 ? n : null
}

export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Housekeeping: rate-limit windows older than a day are never read again.
    for (const r of await ctx.db.query("rateLimits").take(500)) {
      if (r.windowStart < Date.now() - DAY) await ctx.db.delete(r._id)
    }
    for (const r of await ctx.db.query("judgeCache").withIndex("by_at", (q) => q.lt("at", Date.now() - 30 * DAY)).take(500)) {
      await ctx.db.delete(r._id)
    }
    const days = retentionDays()
    if (!days) return 0
    const cutoff = Date.now() - days * DAY
    const subs = await ctx.db.query("submissions").withIndex("by_submittedAt", (q) => q.lt("submittedAt", cutoff)).take(BATCH)
    for (const s of subs) await deleteSubmission(ctx, s._id)
    // Never-submitted invites; a submitted candidate goes with its submission.
    let cands = 0
    for await (const c of ctx.db.query("candidates").withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))) {
      if (c.submissionId) continue
      await deleteCandidate(ctx, c._id)
      if (++cands >= BATCH) break
    }
    // Continue in batches so one run never exceeds mutation limits.
    if (subs.length === BATCH || cands === BATCH) await ctx.scheduler.runAfter(0, internal.retention.purge, {})
    return subs.length + cands
  },
})

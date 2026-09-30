import type { MutationCtx } from "./_generated/server"

// SEC-15: fixed-window rate limiting for public endpoints. Counters live in
// the rateLimits table so limits hold across all Convex instances.

export const HOUR = 60 * 60 * 1000

export const LIMITS = {
  // Global cap on graded submissions per hour: bounds paid judge calls.
  submitsPerHour: () => Number(process.env.SUBMISSIONS_PER_HOUR ?? 60),
  // Per-candidate cap on draft saves (autosave fires about once a second at most).
  draftSavesPerHour: 1200,
  // Global cap on attempts to start an assessment.
  startsPerHour: () => Number(process.env.STARTS_PER_HOUR ?? 300),
}

/** Increments `key` in the current window; throws once `limit` is exceeded. */
export async function hit(ctx: MutationCtx, key: string, limit: number, windowMs = HOUR): Promise<void> {
  const now = Date.now()
  const windowStart = now - (now % windowMs)
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  if (!row || row.windowStart !== windowStart) {
    if (row) await ctx.db.patch(row._id, { windowStart, count: 1 })
    else await ctx.db.insert("rateLimits", { key, windowStart, count: 1 })
    return
  }
  if (row.count >= limit) throw new Error("Too many requests. Please wait a few minutes and try again.")
  await ctx.db.patch(row._id, { count: row.count + 1 })
}

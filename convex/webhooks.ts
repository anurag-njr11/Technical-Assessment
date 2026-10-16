import { v } from "convex/values"
import { internalAction, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { siteUrl } from "./email"

// P6 ATS integration: with WEBHOOK_URL set, every graded submission is POSTed
// as JSON. With WEBHOOK_SECRET set, the body is signed:
//   X-ReviewBench-Signature: sha256=<hex HMAC-SHA256(secret, raw body)>
// Works with any receiver (Greenhouse/Lever via Zapier, Merge, a custom endpoint).

export async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("")
}

export const payload = internalQuery({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.submissionId)
    if (!sub?.result) return null
    const c = sub.candidateId ? await ctx.db.get(sub.candidateId) : null
    const a = c?.assessmentId ? await ctx.db.get(c.assessmentId) : null
    return {
      event: "submission.graded",
      submissionId: sub._id,
      candidate: { name: sub.candidateName, email: c?.email ?? null },
      assessment: a ? { id: a._id, title: a.title, role: a.role, level: a.level } : null,
      scenarioId: sub.scenarioId,
      overall: sub.result.overall,
      band: sub.result.band,
      needsReview: sub.result.needsReview,
      dimensions: Object.fromEntries((sub.result.trajectory?.dimensions ?? []).map((d) => [d.key, d.score])),
      reportUrl: siteUrl(`/report?id=${sub._id}`),
      submittedAt: new Date(sub.submittedAt).toISOString(),
    }
  },
})

export const graded = internalAction({
  args: { submissionId: v.id("submissions"), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const url = process.env.WEBHOOK_URL
    if (!url) return
    const data = await ctx.runQuery(internal.webhooks.payload, { submissionId: args.submissionId })
    if (!data) return
    const body = JSON.stringify(data)
    const secret = process.env.WEBHOOK_SECRET
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(secret ? { "X-ReviewBench-Signature": `sha256=${await sign(secret, body)}` } : {}) },
      body,
    }).catch(() => null)
    // Retry with backoff (1, 4, 16 min) on network errors and 5xx.
    const attempt = args.attempt ?? 0
    if ((!res || res.status >= 500) && attempt < 3) {
      await ctx.scheduler.runAfter(60_000 * 4 ** attempt, internal.webhooks.graded, { submissionId: args.submissionId, attempt: attempt + 1 })
    } else if (!res || !res.ok) {
      console.error(`webhook to ${url} failed for ${args.submissionId}: ${res ? res.status : "network error"}`)
    }
  },
})

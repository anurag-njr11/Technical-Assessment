import { v } from "convex/values"
import { mutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"
import { SCENARIO_META } from "./answerKey"
import { assistantReply } from "./buildScenario"
import type { BuildEvent } from "./buildScenario"
import { requireActive } from "./candidates"
import { hit } from "./rateLimit"

// M3 · Directed Build proxy (spec §7.3). The candidate's assistant requests go
// through here, so the trajectory is recorded server-side and planted faults
// are applied identically for everyone.

const MAX_EVENTS = 400

async function draftFor(ctx: MutationCtx, c: Doc<"candidates">) {
  if (SCENARIO_META[c.scenarioId]?.kind !== "build") throw new Error("This assessment has no AI assistant.")
  const draft = await ctx.db
    .query("autosaves")
    .withIndex("by_candidate", (q) => q.eq("candidateId", c._id))
    .unique()
  if (!draft) throw new Error("Start the assessment first.")
  return draft
}

function eventId(n: number) {
  return `e${n}`
}

export const ask = mutation({
  args: { token: v.string(), prompt: v.string() },
  handler: async (ctx, args) => {
    const c = await requireActive(ctx, args.token)
    await hit(ctx, `ask:${c._id}`, 120)
    const prompt = args.prompt.trim()
    if (!prompt) throw new Error("Type a message first.")
    if (prompt.length > 2000) throw new Error("Please keep messages under 2000 characters.")
    const draft = await draftFor(ctx, c)
    const events: BuildEvent[] = draft.events ?? []
    if (events.length + 3 > MAX_EVENTS) throw new Error("The assistant session is full. Please submit your work.")
    const t = Date.now() - (c.startedAt ?? Date.now())
    const reply = assistantReply(c.scenarioId, prompt)
    const promptEv = { id: eventId(events.length), t, type: "ai_prompt" as const, data: prompt }
    const responseEv = { id: eventId(events.length + 1), t, type: "ai_response" as const, data: JSON.stringify({ text: reply.text, code: reply.code }) }
    const added: BuildEvent[] = [promptEv, responseEv]
    if (reply.fault) added.push({ id: eventId(events.length + 2), t, type: "fault_injected", data: `${reply.fault}|${responseEv.id}` })
    await ctx.db.patch(draft._id, { events: [...events, ...added] as Doc<"autosaves">["events"], updatedAt: Date.now() })
    return { id: responseEv.id, text: reply.text, code: reply.code }
  },
})

export const log = mutation({
  args: {
    token: v.string(),
    type: v.union(v.literal("accept_suggestion"), v.literal("reject_suggestion"), v.literal("test_run"), v.literal("file_open")),
    data: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const c = await requireActive(ctx, args.token)
    await hit(ctx, `log:${c._id}`, 600)
    const draft = await draftFor(ctx, c)
    const events = draft.events ?? []
    if (events.length >= MAX_EVENTS) return
    const ev = { id: eventId(events.length), t: Date.now() - (c.startedAt ?? Date.now()), type: args.type, data: args.data?.slice(0, 500) }
    await ctx.db.patch(draft._id, { events: [...events, ev], updatedAt: Date.now() })
  },
})

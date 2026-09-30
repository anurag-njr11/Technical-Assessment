import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function verifiedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx)
  if (!userId) return null
  const user = await ctx.db.get(userId)
  if (!user || !user.email || !user.emailVerificationTime) return null
  return user
}

/** Throws unless the caller is a signed-in member of the hiring team. */
export async function requireRecruiter(ctx: QueryCtx | MutationCtx): Promise<Doc<"recruiters">> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Sign in required.")
  const member = await ctx.db
    .query("recruiters")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()
  if (!member) throw new Error("You don't have access to this workspace.")
  return member
}

/** Throws unless the caller is the workspace owner. */
export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<Doc<"recruiters">> {
  const member = await requireRecruiter(ctx)
  if (member.role !== "owner") throw new Error("Only the workspace owner can do this.")
  return member
}

/**
 * SEC-5 hardening: if WORKSPACE_OWNER_EMAIL is set, only that (verified) email
 * may claim the unclaimed workspace, so a stranger can't race the owner.
 */
function ownerEmailAllowed(email: string): boolean {
  const required = process.env.WORKSPACE_OWNER_EMAIL
  return !required || normEmail(required) === email
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { signedIn: false as const }
    const user = await ctx.db.get(userId)
    const email = user?.email ? normEmail(user.email) : null
    const member = await ctx.db
      .query("recruiters")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique()
    const anyMember = await ctx.db.query("recruiters").first()
    const invite = email
      ? await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
      : null
    return {
      signedIn: true as const,
      email,
      verified: !!user?.emailVerificationTime,
      role: member?.role ?? null,
      workspaceClaimed: !!anyMember,
      canClaim: !anyMember && !!email && ownerEmailAllowed(email),
      invited: !!invite,
    }
  },
})

export const claimWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await verifiedUser(ctx)
    if (!user) throw new Error("Verify your email before claiming the workspace.")
    const existing = await ctx.db.query("recruiters").first()
    if (existing) throw new Error("This workspace already has an owner. Ask them for an invite.")
    if (!ownerEmailAllowed(normEmail(user.email!))) {
      throw new Error("This workspace is reserved for a different owner email.")
    }
    await ctx.db.insert("recruiters", {
      userId: user._id,
      email: normEmail(user.email!),
      role: "owner",
      joinedAt: Date.now(),
    })
  },
})

export const acceptInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await verifiedUser(ctx)
    if (!user) throw new Error("Verify your email first.")
    const email = normEmail(user.email!)
    const already = await ctx.db
      .query("recruiters")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique()
    if (already) return
    const invites = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).collect()
    if (invites.length === 0) throw new Error("No invite found for this email.")
    await ctx.db.insert("recruiters", { userId: user._id, email, role: "recruiter", joinedAt: Date.now() })
    for (const inv of invites) await ctx.db.delete(inv._id)
  },
})

export const team = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireRecruiter(ctx)
    const members = await ctx.db.query("recruiters").take(200)
    const invites = me.role === "owner" ? await ctx.db.query("invites").take(200) : []
    return {
      myRole: me.role,
      members: members.map((m) => ({ _id: m._id, email: m.email, role: m.role, isMe: m._id === me._id })),
      invites: invites.map((i) => ({ _id: i._id, email: i.email })),
    }
  },
})

export const invite = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    if (me.role !== "owner") throw new Error("Only the workspace owner can invite teammates.")
    const email = normEmail(args.email)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.")
    const member = await ctx.db.query("recruiters").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (member) throw new Error("That person is already on the team.")
    const existing = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (existing) return
    await ctx.db.insert("invites", { email, invitedBy: me.userId, createdAt: Date.now() })
  },
})

export const revokeInvite = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    if (me.role !== "owner") throw new Error("Only the workspace owner can manage invites.")
    await ctx.db.delete(args.id)
  },
})

export const removeMember = mutation({
  args: { id: v.id("recruiters") },
  handler: async (ctx, args) => {
    const me = await requireRecruiter(ctx)
    if (me.role !== "owner") throw new Error("Only the workspace owner can remove teammates.")
    const target = await ctx.db.get(args.id)
    if (!target) return
    if (target.role === "owner") throw new Error("The owner can't be removed.")
    await ctx.db.delete(args.id)
  },
})

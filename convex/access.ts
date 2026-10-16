import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { internalMutation, mutation, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { googleEnabled } from "./auth"

// Multi-tenant access (§21.2). Each verified user belongs to at most one
// company workspace, as its owner, a recruiter, or (demo workspace only) a
// viewer. Every recruiter-facing query and mutation is scoped to the caller's
// workspace: list queries use a by_workspace index, and anything fetched by id
// goes through own(), which refuses rows from another workspace.

export type Member = Doc<"recruiters"> & { workspaceId: Id<"workspaces"> }
type Tenanted = { workspaceId?: Id<"workspaces"> }

/** Public: which sign-in options the login page should offer. */
export const signInOptions = query({
  args: {},
  handler: async () => ({ google: googleEnabled() }),
})

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function verifiedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx)
  if (!userId) return null
  const user = await ctx.db.get(userId)
  if (!user || !user.email || !user.emailVerificationTime) return null
  return user
}

async function membership(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("recruiters")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()
}

/** Throws unless the caller is a signed-in member of a workspace (any role, including demo viewers). */
export async function requireMember(ctx: QueryCtx | MutationCtx): Promise<Member> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Sign in required.")
  const member = await membership(ctx, userId)
  if (!member) throw new Error("You don't have access to this workspace.")
  if (!member.workspaceId) throw new Error("This workspace predates multi-tenancy: run `npx convex run access:migrateLegacy` once.")
  return member as Member
}

/** Throws unless the caller can act in the workspace (owner or recruiter; demo viewers are read-only). */
export async function requireRecruiter(ctx: QueryCtx | MutationCtx): Promise<Member> {
  const member = await requireMember(ctx)
  if (member.role === "viewer" && "insert" in ctx.db) {
    // Mutations only: viewers can read everything in the demo workspace.
    throw new Error("The demo is read-only for this action. Create your own workspace to try it.")
  }
  return member
}

/** Throws unless the caller is the workspace owner. */
export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<Member> {
  const member = await requireRecruiter(ctx)
  if (member.role !== "owner") throw new Error("Only the workspace owner can do this.")
  return member
}

/** Returns `doc` if it belongs to the caller's workspace; otherwise throws as if it did not exist. */
export function own<T extends Tenanted>(me: Member, doc: T | null, what = "Not found."): T {
  if (!doc || doc.workspaceId !== me.workspaceId) throw new Error(what)
  return doc
}

/** Same check for queries that return null instead of throwing. */
export const mine = <T extends Tenanted>(me: Member, doc: T | null): T | null =>
  doc && doc.workspaceId === me.workspaceId ? doc : null

/**
 * SEC-5 hardening / single-company mode: if WORKSPACE_OWNER_EMAIL is set,
 * only that verified email may create a workspace.
 */
function mayCreate(email: string): boolean {
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
    const member = await membership(ctx, userId)
    const workspace = member?.workspaceId ? await ctx.db.get(member.workspaceId) : null
    const invites = email ? await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).take(5) : []
    const invitedTo = await Promise.all(invites.map(async (i) => (i.workspaceId ? (await ctx.db.get(i.workspaceId))?.name : null)))
    return {
      signedIn: true as const,
      email,
      verified: !!user?.emailVerificationTime,
      role: member?.role ?? null,
      workspace: workspace ? { id: workspace._id, name: workspace.name, demo: !!workspace.demo } : null,
      canCreate: !member && !!email && !!user?.emailVerificationTime && mayCreate(email),
      invited: invites.length > 0,
      invitedTo: invitedTo.filter((n): n is string => !!n),
    }
  },
})

/** A verified user without a workspace creates their company's workspace and becomes its owner. */
export const createWorkspace = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await verifiedUser(ctx)
    if (!user) throw new Error("Verify your email before creating a workspace.")
    if (await membership(ctx, user._id)) throw new Error("You already belong to a workspace.")
    const email = normEmail(user.email!)
    if (!mayCreate(email)) throw new Error("Workspace creation is limited to the deployment owner on this instance.")
    const name = args.name.trim()
    if (!name || name.length > 80) throw new Error("Name your workspace (max 80 characters).")
    const workspaceId = await ctx.db.insert("workspaces", { name, createdBy: user._id, createdAt: Date.now() })
    await ctx.db.insert("recruiters", { workspaceId, userId: user._id, email, role: "owner", joinedAt: Date.now() })
    return workspaceId
  },
})

export const acceptInvite = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await verifiedUser(ctx)
    if (!user) throw new Error("Verify your email first.")
    const email = normEmail(user.email!)
    if (await membership(ctx, user._id)) throw new Error("You already belong to a workspace.")
    const invite = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (!invite?.workspaceId) throw new Error("No invite found for this email.")
    await ctx.db.insert("recruiters", { workspaceId: invite.workspaceId, userId: user._id, email, role: "recruiter", joinedAt: Date.now() })
    await ctx.db.delete(invite._id)
  },
})

export const team = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireMember(ctx)
    const members = await ctx.db.query("recruiters").withIndex("by_workspace", (q) => q.eq("workspaceId", me.workspaceId)).take(200)
    const invites = me.role === "owner"
      ? await ctx.db.query("invites").withIndex("by_workspace", (q) => q.eq("workspaceId", me.workspaceId)).take(200)
      : []
    return {
      myRole: me.role,
      members: members.filter((m) => m.role !== "viewer").map((m) => ({ _id: m._id, email: m.email, role: m.role, isMe: m._id === me._id })),
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
    if (!EMAIL_RE.test(email) || email.length > 254) throw new Error("Enter a valid email address.")
    const member = await ctx.db.query("recruiters").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (member?.workspaceId === me.workspaceId) throw new Error("That person is already on the team.")
    if (member) throw new Error("That person already belongs to another workspace.")
    const existing = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).first()
    if (existing?.workspaceId === me.workspaceId) return
    if (existing) throw new Error("That person already has a pending invite to another workspace.")
    await ctx.db.insert("invites", { workspaceId: me.workspaceId, email, invitedBy: me.userId, createdAt: Date.now() })
  },
})

export const revokeInvite = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    const me = await requireOwner(ctx)
    own(me, await ctx.db.get(args.id))
    await ctx.db.delete(args.id)
  },
})

export const removeMember = mutation({
  args: { id: v.id("recruiters") },
  handler: async (ctx, args) => {
    const me = await requireOwner(ctx)
    const target = own(me, await ctx.db.get(args.id))
    if (target.role === "owner") throw new Error("The owner can't be removed.")
    await ctx.db.delete(args.id)
  },
})

/** Leave the current workspace (not the owner): used by demo visitors who want their own workspace. */
export const leaveWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireMember(ctx)
    if (me.role === "owner") throw new Error("The owner can't leave their workspace.")
    await ctx.db.delete(me._id)
  },
})

/**
 * One-off: stamps rows written before multi-tenancy with a "Default workspace"
 * owned by the first owner. Idempotent: `npx convex run access:migrateLegacy`.
 */
export const migrateLegacy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const legacy = (await ctx.db.query("recruiters").take(500)).filter((r) => !r.workspaceId)
    const owner = legacy.find((r) => r.role === "owner")
    if (!owner) return { migrated: 0 }
    const workspaceId = await ctx.db.insert("workspaces", { name: "Default workspace", createdBy: owner.userId, createdAt: Date.now() })
    let migrated = 0
    for (const table of ["recruiters", "invites", "assessments", "candidates", "submissions", "itemSettings", "emphasis", "experiments", "goldenLabels", "evalRuns", "metricRows", "shadowResults"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        if (!row.workspaceId) {
          await ctx.db.patch(row._id, { workspaceId })
          migrated++
        }
      }
    }
    return { migrated, workspaceId }
  },
})

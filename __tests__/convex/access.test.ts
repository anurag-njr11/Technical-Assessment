import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import schema from "../../convex/schema"
import { api, internal } from "../../convex/_generated/api"

function makeT() {
  return convexTest(schema, import.meta.glob("../../convex/**/*.*s"))
}
type T = ReturnType<typeof makeT>

async function seedUser(t: T, email: string, verified = true) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { email, ...(verified ? { emailVerificationTime: Date.now() } : {}) }),
  )
}

const as = (t: T, user: string) => t.withIdentity({ subject: user })

async function workspaceOf(t: T, email: string, name: string) {
  const user = await seedUser(t, email)
  await as(t, user).mutation(api.access.createWorkspace, { name })
  return as(t, user)
}

describe("access control", () => {
  it("rejects anonymous access to candidate data", async () => {
    const t = makeT()
    await expect(t.query(api.submissions.list, {})).rejects.toThrow(/Sign in required/)
    await expect(t.query(api.submissions.get, { id: "anything" })).rejects.toThrow(/Sign in required/)
  })

  it("a verified user creates a workspace and owns it", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    expect(await as(t, owner).query(api.access.me, {})).toMatchObject({ role: null, canCreate: true, workspace: null })
    await as(t, owner).mutation(api.access.createWorkspace, { name: " Acme " })
    const me = await as(t, owner).query(api.access.me, {})
    expect(me).toMatchObject({ signedIn: true, role: "owner", canCreate: false, workspace: { name: "Acme", demo: false } })
    await expect(as(t, owner).query(api.submissions.list, {})).resolves.toEqual([])
    await expect(as(t, owner).mutation(api.access.createWorkspace, { name: "Second" })).rejects.toThrow(/already belong/)
  })

  it("an unverified user cannot create a workspace", async () => {
    const t = makeT()
    const u = await seedUser(t, "someone@acme.com", false)
    await expect(as(t, u).mutation(api.access.createWorkspace, { name: "X" })).rejects.toThrow(/Verify/)
  })

  it("a signed-in non-member cannot read candidate data", async () => {
    const t = makeT()
    await workspaceOf(t, "owner@acme.com", "Acme")
    const stranger = await seedUser(t, "stranger@else.com")
    await expect(as(t, stranger).query(api.submissions.list, {})).rejects.toThrow(/access/)
  })

  it("isolates workspaces: one company never sees or touches another's data", async () => {
    const t = makeT()
    const acme = await workspaceOf(t, "owner@acme.com", "Acme")
    const globex = await workspaceOf(t, "owner@globex.com", "Globex")
    const cfg = { role: "Backend Engineer", scenarioId: "ord-482-junior", level: "Junior", minutes: 25, aiAssisted: true }
    const { id } = await acme.mutation(api.assessments.create, cfg)
    await globex.mutation(api.assessments.create, cfg)
    expect(await acme.query(api.assessments.list, {})).toHaveLength(1)
    expect(await globex.query(api.assessments.list, {})).toHaveLength(1)
    expect(await globex.query(api.assessments.get, { id })).toBeNull()
    await expect(globex.mutation(api.assessments.setStatus, { id, status: "closed" })).rejects.toThrow(/not found/)
    const { id: candidateId } = await acme.mutation(api.candidates.create, { name: "Ana", scenarioId: "ord-482-junior" })
    expect(await globex.query(api.candidates.list, {})).toEqual([])
    await expect(globex.mutation(api.candidates.revoke, { id: candidateId })).rejects.toThrow(/not found/)
  })

  it("owner invites a teammate who can then join and read data", async () => {
    const t = makeT()
    const owner = await workspaceOf(t, "owner@acme.com", "Acme")
    const mate = await seedUser(t, "Mate@Acme.com")
    await owner.mutation(api.access.invite, { email: "  mate@acme.com " })
    expect(await as(t, mate).query(api.access.me, {})).toMatchObject({ role: null, invited: true, invitedTo: ["Acme"] })
    await as(t, mate).mutation(api.access.acceptInvite, {})
    await expect(as(t, mate).query(api.submissions.list, {})).resolves.toEqual([])
    const team = await owner.query(api.access.team, {})
    expect(team.members).toHaveLength(2)
    expect(team.invites).toHaveLength(0)
  })

  it("an uninvited user cannot accept an invite; members of one workspace can't be invited to another", async () => {
    const t = makeT()
    await workspaceOf(t, "owner@acme.com", "Acme")
    const other = await seedUser(t, "other@acme.com")
    await expect(as(t, other).mutation(api.access.acceptInvite, {})).rejects.toThrow(/No invite/)
    const globex = await workspaceOf(t, "owner@globex.com", "Globex")
    await expect(globex.mutation(api.access.invite, { email: "owner@acme.com" })).rejects.toThrow(/another workspace/)
  })

  it("only the owner can invite, and emails are validated", async () => {
    const t = makeT()
    const owner = await workspaceOf(t, "owner@acme.com", "Acme")
    const mate = await seedUser(t, "mate@acme.com")
    await expect(owner.mutation(api.access.invite, { email: "not-an-email" })).rejects.toThrow(/valid email/)
    await owner.mutation(api.access.invite, { email: "mate@acme.com" })
    await as(t, mate).mutation(api.access.acceptInvite, {})
    await expect(as(t, mate).mutation(api.access.invite, { email: "x@acme.com" })).rejects.toThrow(/Only the workspace owner/)
  })

  it("owner can remove a member, who then loses access; owner cannot be removed", async () => {
    const t = makeT()
    const owner = await workspaceOf(t, "owner@acme.com", "Acme")
    const mate = await seedUser(t, "mate@acme.com")
    await owner.mutation(api.access.invite, { email: "mate@acme.com" })
    await as(t, mate).mutation(api.access.acceptInvite, {})
    const team = await owner.query(api.access.team, {})
    const mateRow = team.members.find((m) => m.email === "mate@acme.com")!
    const ownerRow = team.members.find((m) => m.role === "owner")!
    await owner.mutation(api.access.removeMember, { id: mateRow._id })
    await expect(as(t, mate).query(api.submissions.list, {})).rejects.toThrow(/access/)
    await expect(owner.mutation(api.access.removeMember, { id: ownerRow._id })).rejects.toThrow(/owner can't be removed/)
  })

  it("WORKSPACE_OWNER_EMAIL limits workspace creation to one email (single-company mode, SEC-5)", async () => {
    process.env.WORKSPACE_OWNER_EMAIL = " Owner@Acme.com "
    try {
      const t = makeT()
      const intruder = await seedUser(t, "intruder@evil.com")
      const owner = await seedUser(t, "owner@acme.com")
      expect(await as(t, intruder).query(api.access.me, {})).toMatchObject({ canCreate: false })
      await expect(as(t, intruder).mutation(api.access.createWorkspace, { name: "Evil" })).rejects.toThrow(/limited/)
      expect(await as(t, owner).query(api.access.me, {})).toMatchObject({ canCreate: true })
      await as(t, owner).mutation(api.access.createWorkspace, { name: "Acme" })
      expect(await as(t, owner).query(api.access.me, {})).toMatchObject({ role: "owner" })
    } finally {
      delete process.env.WORKSPACE_OWNER_EMAIL
    }
  })

  it("migrates pre-workspace data into a default workspace", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    await t.run(async (ctx) => {
      await ctx.db.insert("recruiters", { userId: owner, email: "owner@acme.com", role: "owner", joinedAt: 1 })
      await ctx.db.insert("candidates", { name: "Old", scenarioId: "ord-482-junior", token: "a".repeat(48), extraMinutes: 0, status: "invited", createdBy: owner, createdAt: 1 })
    })
    await expect(as(t, owner).query(api.submissions.list, {})).rejects.toThrow(/migrateLegacy/)
    expect(await t.mutation(internal.access.migrateLegacy, {})).toMatchObject({ migrated: 2 })
    expect(await as(t, owner).query(api.candidates.list, {})).toHaveLength(1)
    expect(await t.mutation(internal.access.migrateLegacy, {})).toEqual({ migrated: 0 })
  })

  it("offers Google sign-in only when it is configured", async () => {
    expect(await makeT().query(api.access.signInOptions, {})).toEqual({ google: false })
  })
})

import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import schema from "../../convex/schema"
import { api } from "../../convex/_generated/api"

function makeT() {
  return convexTest(schema, import.meta.glob("../../convex/**/*.*s"))
}
type T = ReturnType<typeof makeT>

async function seedUser(t: T, email: string, verified = true) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { email, ...(verified ? { emailVerificationTime: Date.now() } : {}) }),
  )
}

describe("access control", () => {
  it("rejects anonymous access to candidate data", async () => {
    const t = makeT()
    await expect(t.query(api.submissions.list, {})).rejects.toThrow(/Sign in required/)
    await expect(t.query(api.submissions.get, { id: "anything" })).rejects.toThrow(/Sign in required/)
  })

  it("first verified user can claim the workspace as owner", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    const me = await t.withIdentity({ subject: owner }).query(api.access.me, {})
    expect(me).toMatchObject({ signedIn: true, role: "owner", workspaceClaimed: true })
    await expect(t.withIdentity({ subject: owner }).query(api.submissions.list, {})).resolves.toEqual([])
  })

  it("a second user cannot claim an already-claimed workspace", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    const intruder = await seedUser(t, "intruder@evil.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    await expect(
      t.withIdentity({ subject: intruder }).mutation(api.access.claimWorkspace, {}),
    ).rejects.toThrow(/already has an owner/)
  })

  it("an unverified user cannot claim the workspace", async () => {
    const t = makeT()
    const u = await seedUser(t, "someone@acme.com", false)
    await expect(t.withIdentity({ subject: u }).mutation(api.access.claimWorkspace, {})).rejects.toThrow(/Verify/)
  })

  it("a signed-in non-member cannot read candidate data", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    const stranger = await seedUser(t, "stranger@else.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    await expect(t.withIdentity({ subject: stranger }).query(api.submissions.list, {})).rejects.toThrow(/access/)
  })

  it("owner invites a teammate who can then join and read data", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    const mate = await seedUser(t, "Mate@Acme.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    await t.withIdentity({ subject: owner }).mutation(api.access.invite, { email: "  mate@acme.com " })

    const before = await t.withIdentity({ subject: mate }).query(api.access.me, {})
    expect(before).toMatchObject({ role: null, invited: true })

    await t.withIdentity({ subject: mate }).mutation(api.access.acceptInvite, {})
    await expect(t.withIdentity({ subject: mate }).query(api.submissions.list, {})).resolves.toEqual([])

    const team = await t.withIdentity({ subject: owner }).query(api.access.team, {})
    expect(team.members).toHaveLength(2)
    expect(team.invites).toHaveLength(0)
  })

  it("an uninvited user cannot accept an invite", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    const other = await seedUser(t, "other@acme.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    await expect(t.withIdentity({ subject: other }).mutation(api.access.acceptInvite, {})).rejects.toThrow(/No invite/)
  })

  it("only the owner can invite, and emails are validated", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    const mate = await seedUser(t, "mate@acme.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    await expect(
      t.withIdentity({ subject: owner }).mutation(api.access.invite, { email: "not-an-email" }),
    ).rejects.toThrow(/valid email/)
    await t.withIdentity({ subject: owner }).mutation(api.access.invite, { email: "mate@acme.com" })
    await t.withIdentity({ subject: mate }).mutation(api.access.acceptInvite, {})
    await expect(
      t.withIdentity({ subject: mate }).mutation(api.access.invite, { email: "x@acme.com" }),
    ).rejects.toThrow(/Only the workspace owner/)
  })

  it("owner can remove a member, who then loses access; owner cannot be removed", async () => {
    const t = makeT()
    const owner = await seedUser(t, "owner@acme.com")
    const mate = await seedUser(t, "mate@acme.com")
    await t.withIdentity({ subject: owner }).mutation(api.access.claimWorkspace, {})
    await t.withIdentity({ subject: owner }).mutation(api.access.invite, { email: "mate@acme.com" })
    await t.withIdentity({ subject: mate }).mutation(api.access.acceptInvite, {})

    const team = await t.withIdentity({ subject: owner }).query(api.access.team, {})
    const mateRow = team.members.find((m) => m.email === "mate@acme.com")!
    const ownerRow = team.members.find((m) => m.role === "owner")!
    await t.withIdentity({ subject: owner }).mutation(api.access.removeMember, { id: mateRow._id })
    await expect(t.withIdentity({ subject: mate }).query(api.submissions.list, {})).rejects.toThrow(/access/)
    await expect(
      t.withIdentity({ subject: owner }).mutation(api.access.removeMember, { id: ownerRow._id }),
    ).rejects.toThrow(/owner can't be removed/)
  })
})

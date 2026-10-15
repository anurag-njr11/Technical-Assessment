import { describe, expect, it } from "vitest"
import { runHiddenTests } from "../../convex/sandbox"
import { HIDDEN_TESTS } from "../../convex/hiddenTests"
import { assistantReply } from "../../convex/buildScenario"

const DISC = HIDDEN_TESTS["disc-12-build"]
const ORD = HIDDEN_TESTS["orders-api-build"]
const byFault = (r: Awaited<ReturnType<typeof runHiddenTests>>) => Object.fromEntries(r.filter((x) => x.fault).map((x) => [x.fault, x.pass]))

const FIXED = `const CODES = {
  SAVE10: (total) => total * 0.9,
  FLAT5: (total) => total - 5,
}
export function applyDiscount(cart, code) {
  const rule = CODES[String(code).toUpperCase()]
  if (!rule) throw new Error("Invalid code")
  if (cart.subtotal < 50) return cart.subtotal
  return Math.max(0, Math.round(rule(cart.subtotal) * 100) / 100)
}`

describe("hidden tests in the QuickJS sandbox", () => {
  it("passes a correct DISC-12 solution", async () => {
    const r = await runHiddenTests(FIXED, DISC)
    expect(r.filter((x) => !x.pass)).toEqual([])
  })

  it("catches the AI's planted faults by running the code", async () => {
    // The assistant's full implementation is case-sensitive (F3).
    const scripted = assistantReply("disc-12-build", "Please write the full applyDiscount function").code
    expect(byFault(await runHiddenTests(scripted, DISC))).toEqual({ F1: true, F2: true, F3: false })
    // > 50 instead of >= 50 (F1) and the hallucinated cart.getSubtotalAfterTax() (F2) fail at runtime.
    const f1 = FIXED.replace("if (cart.subtotal < 50) return cart.subtotal", "if (!(cart.subtotal > 50)) return cart.subtotal")
    expect(byFault(await runHiddenTests(f1, DISC)).F1).toBe(false)
    const f2 = FIXED.replace("rule(cart.subtotal)", "rule(cart.getSubtotalAfterTax())")
    const r2 = await runHiddenTests(f2, DISC)
    expect(byFault(r2).F2).toBe(false)
    expect(r2.find((x) => x.fault === "F2")!.detail).toMatch(/cart has no property getSubtotalAfterTax/)
  })

  it("checks ORD-519 for injection, ownership, hallucinated API and LIMIT", async () => {
    const good = `export async function searchOrders(db, userId, query) {
  return db.query("SELECT * FROM orders WHERE user_id = ? AND description LIKE ? ORDER BY created_at DESC LIMIT 50", [userId, "%" + query + "%"])
}`
    expect((await runHiddenTests(good, ORD)).filter((x) => !x.pass)).toEqual([])
    const bad = assistantReply("orders-api-build", "search the description text with LIKE").code
    const wrapped = `export async function searchOrders(db, userId, query) {\n${bad}\n}`
    expect(byFault(await runHiddenTests(wrapped, ORD))).toMatchObject({ F1: false })
    const noOwner = assistantReply("orders-api-build", "write the whole searchOrders function").code
    expect(byFault(await runHiddenTests(noOwner, ORD))).toMatchObject({ F2: false })
    const halluc = `export async function searchOrders(db, userId, query) {\n${assistantReply("orders-api-build", "make it safe from injection").code}\nreturn rows }`
    expect(byFault(await runHiddenTests(halluc, ORD))).toMatchObject({ F3: false })
  })

  it("contains hostile code: no host access, and runaway loops are stopped", async () => {
    const snoop = `export function applyDiscount() { return typeof process === "undefined" && typeof require === "undefined" && typeof fetch === "undefined" ? 90 : 0 }`
    expect((await runHiddenTests(snoop, DISC))[0].pass).toBe(true)
    const started = Date.now()
    const loop = await runHiddenTests("export function applyDiscount() { for (;;) {} }", DISC)
    expect(loop.every((x) => !x.pass)).toBe(true)
    expect(Date.now() - started).toBeLessThan(10_000)
    const broken = await runHiddenTests("export function applyDiscount( {", DISC)
    expect(broken[0].detail).toMatch(/does not run/)
  })
})

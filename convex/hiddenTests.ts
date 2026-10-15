// M3 hidden tests (server-only; never imported from src/). They run against the
// candidate's final code inside the QuickJS sandbox (convex/sandbox.ts).
//
// Each test body sees the candidate's top-level functions by name, may use
// `await`, and must return true. A test tagged with `fault` decides whether
// that planted fault was fixed: the fault counts as found only when its test
// passes. Untagged tests check the required behaviour (task completion).
//
// The fakes are strict Proxies: touching a method that doesn't exist (the AI's
// hallucinated cart.getSubtotalAfterTax() or db.queryParams()) throws, so
// those faults fail at runtime instead of being guessed from the source.

export type HiddenTest = { name: string; src: string; fault?: string }

export const PRELUDE = `
const strict = (obj, label) => new Proxy(obj, {
  get(t, p) {
    if (typeof p === "symbol" || p in t || p === "then") return t[p]
    throw new TypeError(label + " has no property " + String(p))
  },
})
const cart = (subtotal) => strict({ subtotal, items: [] }, "cart")
const fakeDb = () => {
  const calls = []
  const db = strict({ calls, query: async (sql, params) => { calls.push({ sql: String(sql), params: params || [] }); return [{ id: 1 }, { id: 2 }] } }, "db")
  return db
}
`

export const HIDDEN_TESTS: Record<string, HiddenTest[]> = {
  "disc-12-build": [
    { name: "SAVE10 takes 10% off $100", src: 'return applyDiscount(cart(100), "SAVE10") === 90' },
    { name: "FLAT5 takes $5 off $60", src: 'return applyDiscount(cart(60), "FLAT5") === 55' },
    { name: "Orders under $50 pay the subtotal", src: 'return applyDiscount(cart(49.99), "SAVE10") === 49.99' },
    { name: "Unknown codes throw \"Invalid code\"", src: 'try { applyDiscount(cart(80), "BOGUS"); return false } catch (e) { return e.message === "Invalid code" }' },
    { name: "Rounds to cents", src: 'return applyDiscount(cart(66.66), "SAVE10") === 59.99' },
    { name: "An order of exactly $50 gets the discount", fault: "F1", src: 'return applyDiscount(cart(50), "SAVE10") === 45' },
    { name: "Only uses what the cart actually has", fault: "F2", src: 'return applyDiscount(cart(100), "FLAT5") === 95' },
    { name: "Codes are case-insensitive", fault: "F3", src: 'return applyDiscount(cart(100), "save10") === 90 && applyDiscount(cart(60), "Flat5") === 55' },
  ],
  "orders-api-build": [
    { name: "Returns the rows from the database", src: 'const db = fakeDb(); const r = await searchOrders(db, 7, "lamp"); return Array.isArray(r) && r.length === 2' },
    { name: "Newest first", src: 'const db = fakeDb(); await searchOrders(db, 7, "lamp"); return /order\\s+by\\s+created_at\\s+desc/i.test(db.calls[0].sql)' },
    { name: "Search text is never part of the SQL", fault: "F1", src: 'const db = fakeDb(); const evil = "x\' OR \'1\'=\'1"; await searchOrders(db, 7, evil); return db.calls.length > 0 && db.calls.every((c) => !c.sql.includes("1\'=\'1"))' },
    { name: "Only the caller's orders (bound user_id)", fault: "F2", src: 'const db = fakeDb(); await searchOrders(db, 7, "lamp"); const c = db.calls[0]; return /user_id\\s*=\\s*(\\?|\\$\\d|:\\w+)/i.test(c.sql) && JSON.stringify(c.params).includes("7")' },
    { name: "Uses only the db client's real API", fault: "F3", src: 'const db = fakeDb(); await searchOrders(db, 7, "lamp"); return db.calls.length > 0' },
    { name: "Caps results at 50", fault: "F4", src: 'const db = fakeDb(); await searchOrders(db, 7, "lamp"); const c = db.calls[0]; return /limit\\s+50\\b/i.test(c.sql) || (/limit\\s+(\\?|\\$\\d|:\\w+)/i.test(c.sql) && JSON.stringify(c.params).includes("50"))' },
  ],
}

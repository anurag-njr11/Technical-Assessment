// Candidate-visible scenario content. The answer key lives server-side only
// (convex/answerKey.ts) and must never be imported here.

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type DiffLine = { n: number; kind: 'add' | 'ctx'; code: string }

export type ScenarioFile = {
  path: string
  added: number
  removed: number
  lines: DiffLine[]
}

export type Scenario = {
  kind: 'code'
  id: string
  ticketId: string
  title: string
  role: string
  level: string
  stack: string
  minutes: number
  summary: string
  criteria: string[]
  files: ScenarioFile[]
  followUps: string[]
}

export const SCENARIO: Scenario = {
  kind: 'code',
  id: 'ord-482-junior',
  ticketId: 'ORD-482',
  title: 'Add pagination & date filtering to the Orders API',
  role: 'Backend Engineer',
  level: 'Junior',
  stack: 'Python / Flask',
  minutes: 40,
  summary:
    'Support teams need to page through large order lists and filter them by date range. Add these capabilities to GET /api/orders without breaking existing clients.',
  criteria: [
    'Accepts page and per_page query params; per_page is capped at 100',
    'Accepts start_date and end_date filters (ISO 8601)',
    'Invalid parameters return 400 Bad Request',
    'All existing tests continue to pass',
  ],
  files: [
    {
      path: 'orders/views.py',
      added: 11,
      removed: 1,
      lines: [
        { n: 10, kind: 'ctx', code: '@orders_bp.route("/api/orders")' },
        { n: 11, kind: 'ctx', code: '@require_auth' },
        { n: 12, kind: 'ctx', code: 'def list_orders():' },
        { n: 13, kind: 'ctx', code: "    page = int(request.args.get('page', 1))" },
        { n: 14, kind: 'ctx', code: "    per_page = int(request.args.get('per_page', 25))" },
        { n: 15, kind: 'add', code: '    per_page = min(per_page, 100)' },
        { n: 16, kind: 'add', code: '    offset = page * per_page' },
        { n: 17, kind: 'add', code: "    start_date = request.args.get('start_date')" },
        { n: 18, kind: 'add', code: "    end_date = request.args.get('end_date')" },
        { n: 19, kind: 'add', code: '    if start_date:' },
        { n: 20, kind: 'add', code: '        start_date = utils.parse_date_safe(start_date)' },
        { n: 21, kind: 'add', code: '    if end_date:' },
        { n: 22, kind: 'add', code: '        end_date = utils.parse_date_safe(end_date)' },
        {
          n: 23,
          kind: 'add',
          code: "    query = f\"SELECT * FROM orders WHERE created_at >= '{start_date}' AND created_at <= '{end_date}'\"",
        },
        { n: 24, kind: 'add', code: '    rows = db.execute(query)' },
        { n: 25, kind: 'add', code: '    return jsonify(rows[offset:offset + per_page])' },
      ],
    },
    {
      path: 'orders/tests.py',
      added: 3,
      removed: 0,
      lines: [
        { n: 1, kind: 'add', code: 'def test_list_orders_paginated(client):' },
        { n: 2, kind: 'add', code: "    resp = client.get('/api/orders?page=1&per_page=10')" },
        { n: 3, kind: 'add', code: '    assert resp.status_code == 200' },
      ],
    },
    {
      path: 'utils/dates.py',
      added: 0,
      removed: 0,
      lines: [
        { n: 1, kind: 'ctx', code: 'from datetime import datetime' },
        { n: 2, kind: 'ctx', code: '' },
        { n: 3, kind: 'ctx', code: '' },
        { n: 4, kind: 'ctx', code: 'def parse_iso_date(value: str) -> datetime:' },
        { n: 5, kind: 'ctx', code: '    """Parse an ISO 8601 date string. Raises ValueError if invalid."""' },
        { n: 6, kind: 'ctx', code: '    return datetime.fromisoformat(value)' },
      ],
    },
  ],
  followUps: [
    'What would you verify before approving any change that builds a database query from request parameters?',
    'What would you test before merging the date-filter change, beyond what is already in the test file?',
    'If you had to give the AI agent one instruction to fix the most serious problem you found, what would you tell it?',
  ],
}

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']

// ---------------------------------------------------------------------------
// M1 · Code Review, mid level
// ---------------------------------------------------------------------------

const ctx = (n: number, code: string): DiffLine => ({ n, kind: 'ctx', code })
const add = (n: number, code: string): DiffLine => ({ n, kind: 'add', code })

export const PAY_217: Scenario = {
  kind: 'code',
  id: 'pay-217-mid',
  ticketId: 'PAY-217',
  title: 'Add partial refunds to the Payments API',
  role: 'Backend Engineer',
  level: 'Mid',
  stack: 'Python / Flask',
  minutes: 35,
  summary:
    'Merchants want to refund part or all of a payment from the API. Add POST /api/payments/<id>/refunds. Refunds go through our card gateway and must be safe to retry.',
  criteria: [
    'POST /api/payments/<id>/refunds creates a refund for part or all of a payment',
    'Only the merchant who owns the payment may refund it',
    'The total of all refunds may not exceed the original payment',
    'Invalid amounts (missing, zero or negative) return 400',
    'Repeating a request with the same Idempotency-Key returns the original refund instead of refunding twice',
  ],
  files: [
    {
      path: 'payments/refunds.py',
      added: 15,
      removed: 0,
      lines: [
        ctx(10, '@payments_bp.route("/api/payments/<payment_id>/refunds", methods=["POST"])'),
        ctx(11, '@require_auth'),
        ctx(12, 'def create_refund(payment_id):'),
        add(13, '    payment = Payment.query.get_or_404(payment_id)'),
        add(14, '    body = request.get_json()'),
        add(15, '    amount = body["amount"]'),
        add(16, '    if amount > payment.amount:'),
        add(17, '        return jsonify(error="Refund exceeds payment"), 400'),
        add(18, '    key = request.headers.get("Idempotency-Key")'),
        add(19, '    existing = Refund.query.filter_by(idempotency_key=key).first()'),
        add(20, '    if existing:'),
        add(21, '        return jsonify(existing.to_dict()), 200'),
        add(22, '    refund = Refund(payment_id=payment.id, amount=amount, idempotency_key=key)'),
        add(23, '    db.session.add(refund)'),
        add(24, '    gateway.refund(payment.gateway_ref, amount)'),
        add(25, '    db.session.commit()'),
        add(26, '    log.info(f"refund {refund.id} for payment {payment.id} card={payment.card_number}")'),
        add(27, '    return jsonify(refund.to_dict()), 201'),
      ],
    },
    {
      path: 'payments/models.py',
      added: 0,
      removed: 0,
      lines: [
        ctx(1, 'class Payment(db.Model):'),
        ctx(2, '    id = db.Column(db.String, primary_key=True)'),
        ctx(3, '    merchant_id = db.Column(db.String, nullable=False)'),
        ctx(4, '    amount = db.Column(db.Integer, nullable=False)  # cents'),
        ctx(5, '    refunded_total = db.Column(db.Integer, default=0)  # cents already refunded'),
        ctx(6, '    gateway_ref = db.Column(db.String)'),
        ctx(7, '    card_number = db.Column(db.String)  # full PAN, PCI scope'),
      ],
    },
    {
      path: 'payments/gateway.py',
      added: 0,
      removed: 0,
      lines: [
        ctx(1, 'class GatewayClient:'),
        ctx(2, '    def charge(self, card_token, amount_cents): ...'),
        ctx(3, ''),
        ctx(4, '    def issue_refund(self, charge_id, amount_cents):'),
        ctx(5, '        """Refund part or all of a charge. Raises GatewayError on failure."""'),
        ctx(6, '        ...'),
        ctx(7, ''),
        ctx(8, 'gateway = GatewayClient()'),
      ],
    },
    {
      path: 'payments/auth.py',
      added: 0,
      removed: 0,
      lines: [
        ctx(1, 'def require_auth(fn):'),
        ctx(2, '    """Checks the API key and sets g.merchant to the calling merchant.'),
        ctx(3, '    It does not check who owns a resource."""'),
        ctx(4, '    ...'),
      ],
    },
  ],
  followUps: [
    'Which problem in this PR could cost the company money or trust soonest, and why?',
    'How would you test that refunds are safe to retry and never exceed the payment?',
    'What single instruction would you give the AI agent to fix the most serious problem?',
  ],
}

// ---------------------------------------------------------------------------
// M2 · Decision Review
// ---------------------------------------------------------------------------

export type DecisionScenario = {
  kind: 'decision'
  id: string
  ticketId: string
  title: string
  role: string
  level: string
  stack: string
  minutes: number
  summary: string
  context: string[]
  constraints: string[]
  recommendation: string[]
  followUps: string[]
}

export const ADR_031: DecisionScenario = {
  kind: 'decision',
  id: 'adr-031-mid',
  ticketId: 'ADR-031',
  title: 'Should the Orders service move from PostgreSQL to MongoDB?',
  role: 'Backend Engineer',
  level: 'Mid',
  stack: 'Architecture decision',
  minutes: 20,
  summary:
    "An AI agent was asked to fix slow order-history pages and wrote the architecture decision record below. Critique it as you would a teammate's proposal before it goes to architecture review.",
  context: [
    'The Orders service stores 2.1 million orders in PostgreSQL, joined to customers and invoices.',
    'The order-history page has a p95 read latency of 180 ms; the product target is 100 ms. Nobody has profiled it yet.',
    'Finance runs nightly SQL reports directly against the Orders database.',
    'The team is four backend engineers, all experienced with PostgreSQL; none has run MongoDB in production.',
    'Company policy requires order data to be kept for 7 years.',
  ],
  constraints: [
    'No more than 5 minutes of downtime for any migration.',
    'No new headcount this year.',
    'SOC 2 audit next quarter: every datastore needs documented backups and access controls.',
  ],
  recommendation: [
    'Recommendation: migrate the Orders service to MongoDB this quarter.',
    'A vendor benchmark shows MongoDB is 3x faster, which will fix the order-history latency.',
    'Storing each order as one document removes the joins that slow down reads.',
    'A flexible schema will speed up future feature work.',
    'As part of the work, add a composite index on orders(customer_id, created_at) for the history query.',
    'Move orders older than 7 years to cold storage, as the retention policy allows.',
    'Expected result: order-history p95 under 60 ms.',
  ],
  followUps: [
    'Which claims or assumptions in the recommendation are flawed, and why?',
    'Which constraints, costs or risks does it ignore?',
    'What would you recommend instead, and what would you check first?',
  ],
}

// ---------------------------------------------------------------------------
// M3 · Directed Build (pilot)
// ---------------------------------------------------------------------------

export type BuildScenario = {
  kind: 'build'
  id: string
  ticketId: string
  title: string
  role: string
  level: string
  stack: string
  minutes: number
  summary: string
  criteria: string[]
  apiReference: string[]
  starterCode: string
  followUps: string[]
}

export const DISC_12: BuildScenario = {
  kind: 'build',
  id: 'disc-12-build',
  ticketId: 'DISC-12',
  title: 'Implement discount codes at checkout',
  role: 'Full-stack Engineer',
  level: 'All levels',
  stack: 'JavaScript',
  minutes: 30,
  summary:
    'Implement applyDiscount(cart, code), which returns the new order total. You have an AI assistant: use it however you like, but you are responsible for the code you submit.',
  criteria: [
    'Codes are case-insensitive (save10 works the same as SAVE10)',
    'SAVE10 gives 10% off; FLAT5 gives $5 off; any other code throws Error("Invalid code")',
    'Discounts only apply to orders of $50 or more (cart.subtotal >= 50); smaller orders pay the subtotal',
    'The total never goes below 0 and is rounded to cents',
  ],
  apiReference: [
    'cart = { subtotal: number, items: Array<{ sku: string, price: number, qty: number }> }',
    'cart.subtotal is already computed. The cart object has no methods.',
  ],
  starterCode: `const CODES = {
  // TODO
}

export function applyDiscount(cart, code) {
  // TODO: return the new total
}
`,
  followUps: [],
}

export type AnyScenario = Scenario | DecisionScenario | BuildScenario

export const SCENARIOS: Record<string, AnyScenario> = {
  [SCENARIO.id]: SCENARIO,
  [PAY_217.id]: PAY_217,
  [ADR_031.id]: ADR_031,
  [DISC_12.id]: DISC_12,
}

export const MODULE_LABEL: Record<AnyScenario['kind'], string> = {
  code: 'M1 · Code Review',
  decision: 'M2 · Decision Review',
  build: 'M3 · Directed Build (pilot)',
}

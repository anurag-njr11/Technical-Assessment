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

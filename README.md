# ReviewBench

ReviewBench doesn't ask whether you can write code without AI. It evaluates
whether you can effectively work with AI to produce reliable engineering work.

A recruiter creates an assessment and shares a link or QR code. The candidate
reviews an AI-written PR together with the agent's rationale and assumptions,
questions the agent in a chat, and submits a verdict (or builds a feature with
a live AI assistant). ReviewBench records the whole interaction; a panel of
three AI judges from different model families answers narrow yes/no questions
about it, every vote must cite real events and quotes, and deterministic code
computes the score. The recruiter gets an evidence-first report.

## Quick start

Needs Node 22+ (CI uses 22) and npm.

```bash
npm install
npx convex dev        # terminal 1. First run creates a deployment and writes .env.local
                      # (no account needed: CONVEX_AGENT_MODE=anonymous npx convex dev)
npx @convex-dev/auth  # once per deployment: sets JWT_PRIVATE_KEY, JWKS, SITE_URL
npm run dev           # terminal 2, then open http://localhost:3000
```

Then, in the browser:

1. Go to `/recruiter`, sign up with email + password. The 6-digit code is
   emailed (with Resend) or printed in `npx convex logs`.
2. Claim the workspace (the first verified account becomes owner).
3. **Create assessment**: pick a role and module (default: PAY-217 AI PR review),
   level, time limit, AI-assisted → you get a link and QR code.
4. Open the link in a private window (or scan the QR on a phone), enter a name
   and take the assessment as a candidate.
5. Back as the recruiter, open the assessment → candidates table → **Compare**
   → a candidate's report.

### Check before running

| # | Check | How |
|---|---|---|
| 1 | Node 22+ | `node -v` |
| 2 | Dependencies installed (includes `qrcode.react`) | `npm install` |
| 3 | `.env.local` has `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT` | Written by `npx convex dev`; see `.env.example`. Never commit it |
| 4 | Convex Auth keys set on the deployment | `npx convex env list` shows `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` (`http://localhost:3000` locally) |
| 5 | Owner lock set **before** anyone signs up (shared/deployed instances) | `npx convex env set WORKSPACE_OWNER_EMAIL you@company.com` |
| 6 | AI key set, for the live assistant, the PR agent and the judges | `npx convex env set LLM_API_KEY ...` (OpenRouter by default) |
| 7 | Every model ID is served by your endpoint: the 6 judge models and `ASSISTANT_MODEL` | Compare `convex/judges.ts` `DEFAULT_PANEL` with your provider's model list; override with `JUDGE_PANEL_JSON` / `ASSISTANT_MODEL` |
| 8 | Emails (optional) | `RESEND_API_KEY` + `EMAIL_FROM` on a Resend-verified domain; otherwise read codes from `npx convex logs` |
| 9 | Tests, typecheck and build pass | `npm test` (100 tests), `npx tsc --noEmit -p .`, `npx tsc --noEmit -p convex`, `npm run build` |
| 10 | `npx convex dev` shows no TypeScript errors | It typechecks `convex/` on every push; a failure means functions were not deployed |

**Without `LLM_API_KEY`** the site still works end to end: the assistant and PR
agent use scripted replies, and grading falls back to deterministic scoring
with every submission flagged "AI judges were unavailable" for human review.
Use this for a UI walkthrough, not for a real demo of the judges.

**Known limitation:** the assessment's *AI-assisted* flag and *level* are
labels only. The agent chat appears on every code-review and build task
regardless (see `LATER.md` §P7).

**Cost and limits:** each PR review with chat triggers dozens of judge calls
plus one assistant call per candidate prompt. Global caps:
`SUBMISSIONS_PER_HOUR` (60), `STARTS_PER_HOUR` (300); per link: 200 joins/hour;
per candidate: 120 assistant messages/hour.

## Stack
- TanStack Start (React) + Tailwind CSS: `src/`
- Convex (database, server functions, auth): `convex/`
- Vitest + convex-test: `__tests__/`

## Key files
| Path | What it does |
|---|---|
| `src/lib/scenario.ts` | Candidate-visible scenarios (ticket, diff, agent rationale + assumptions, build tasks) |
| `convex/answerKey.ts` | Server-only answer keys, `ASSUMPTION_KEYS`, scenario metadata. Never import from `src/` |
| `convex/assessments.ts` | Recruiter assessments, reusable link tokens, public join |
| `convex/trajectory.ts` | Trajectory council: judges score the candidate–AI interaction on nine dimensions |
| `convex/grading.ts` | Grading pipeline: location match, judge council, evidence check (pure core + action) |
| `convex/judges.ts` | Judge panel (family-distinct fallbacks), transport, tracing, anonymization |
| `convex/scoring.ts` | Deterministic score, bands, human-override recompute |
| `convex/candidates.ts` | Invite links, start/autosave, enforced deadline + auto-submit |
| `convex/submissions.ts` | Token-authorised submit (public) + recruiter queries (protected) |
| `convex/reviews.ts` | Human review queue: audited overrides, resolve |
| `convex/golden.ts` | Golden-set labels from human graders |
| `convex/reliability.ts` | Evaluation runs (retest, perturbation, adversarial, golden) + dashboard |
| `convex/metrics.ts`, `convex/dashboard.ts` | Kappa, Wilson/bootstrap CIs, regression gate, weight calibration |
| `convex/access.ts` | Workspace owner claim, invites, `requireRecruiter` / `requireOwner` |
| `convex/auth.ts` | Email + password sign-in with emailed verification codes |
| `src/routes/a.$token.tsx` | Assessment link / QR landing page (`/a/<token>`) |
| `src/routes/assess.tsx` | Candidate flow (`/assess?t=<token>`): PR + agent notes + "Ask the agent" chat |
| `src/routes/recruiter.tsx` | Dashboard: create assessment, link + QR, assessments, submissions, team |
| `src/routes/assessment.tsx` | All candidates of one assessment across dimensions + comparison view |
| `src/routes/report.tsx` | Evidence-first report + override, golden-set and evaluation tools |
| `src/components/evidence.tsx` | Dimensions, judge evidence, disagreements, interaction timeline, agent PR |
| `src/routes/review.tsx` | Human review queue (escalations + candidate appeals) |
| `src/routes/reliability.tsx` | Reliability, fairness, validity, experiment log, audit pack |
| `src/routes/items.tsx` | Item bank: detection rates, IRT difficulty, item/emphasis config |
| `src/routes/results.tsx` | Candidate-facing results + appeal (`/results?t=<token>`) |
| `src/routes/methodology.tsx` | Public methodology / technical manual summary |
| `src/components/build-workspace.tsx` | Task → editor → AI assistant → tests → submit; shared chat component |
| `convex/builds.ts`, `convex/buildScenario.ts` | Assistant / PR-agent proxy (live LLM, scripted faults, fallback), deterministic build grading |
| `convex/items.ts`, `convex/insights.ts` | Item config + adverse-impact check; norms, IRT, outcomes, validity |
| `LATER.md` | Deferred enhancements |

## External services
No platform lock-in; both services are optional for local use.
- **AI judges** (`convex/judges.ts`, `callModel`): any OpenAI-compatible chat
  endpoint. Default is OpenRouter, which serves every model on the default
  panel with one key. Without a key, grading still completes but every judge is
  "unavailable" and submissions escalate to human review.
- **Verification emails** (`convex/ResendOTP.ts`): Resend. Without a key, the
  6-digit code is printed to the Convex logs (`npx convex logs`).

Convex environment variables (`npx convex env set NAME value`):
| Variable | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | unset | API key for the judges and the assistant |
| `ASSISTANT_MODEL` | `anthropic/claude-sonnet-5` | Model for the candidate's AI assistant and the PR agent |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Any OpenAI-compatible base URL, e.g. `http://localhost:11434/v1` for Ollama (then set `JUDGE_PANEL_JSON` to local models) |
| `RESEND_API_KEY` | unset | Send verification codes by email |
| `EMAIL_FROM` | `ReviewBench <onboarding@resend.dev>` | Sender address (must be a domain verified in Resend) |

Optional Convex environment variables:
| Variable | Default | Purpose |
|---|---|---|
| `WORKSPACE_OWNER_EMAIL` | unset | Only this verified email may claim the unclaimed workspace |
| `SUBMISSIONS_PER_HOUR` | 60 | Global cap on graded submissions (bounds judge spend) |
| `STARTS_PER_HOUR` | 300 | Global cap on assessment starts |
| `JUDGE_PANEL_JSON` | built-in panel | Replace judge models; all 6 families must be distinct |
| `RAG_EXAMPLES` | off | `on` adds up to 2 similar human-graded examples to each issue prompt |

## Status
AI-native flow (P7): assessments with link/QR, AI PR review with a live agent,
live Directed Build assistant, trajectory council, evidence-first recruiter
views and candidate comparison. Plus P1–P6 at demo depth. Not yet clicked
through in a browser or run against real models. See `ReviewBench — Progress Report.md` for what is done, what still
needs real data or owner action, and the roadmap.

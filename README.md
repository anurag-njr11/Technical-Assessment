# ReviewBench

Assess how engineers review AI-written code. Candidates review a pull request
containing planted, known flaws; a panel of three independent AI judges grades
each comment against a hidden answer key, and every positive vote must quote
the candidate's own words.

## Stack
- TanStack Start (React) + Tailwind CSS: `src/`
- Convex (database, server functions, auth): `convex/`
- Vitest + convex-test: `__tests__/`

## Key files
| Path | What it does |
|---|---|
| `src/lib/scenario.ts` | Candidate-visible scenario (ticket, diff, follow-up questions) |
| `convex/answerKey.ts` | Server-only answer key + scenario metadata. Never import from `src/` |
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
| `src/routes/assess.tsx` | Candidate flow (`/assess?t=<token>`) |
| `src/routes/recruiter.tsx` | Dashboard: invite links, filters, team |
| `src/routes/report.tsx` | Evidence-backed report + override, golden-set and evaluation tools |
| `src/routes/review.tsx` | Human review queue (escalations + candidate appeals) |
| `src/routes/reliability.tsx` | Reliability, fairness, validity, experiment log, audit pack |
| `src/routes/items.tsx` | Item bank: detection rates, IRT difficulty, item/emphasis config |
| `src/routes/results.tsx` | Candidate-facing results + appeal (`/results?t=<token>`) |
| `src/routes/methodology.tsx` | Public methodology / technical manual summary |
| `src/components/build-workspace.tsx` | M3 Directed Build editor + assistant + visible tests |
| `convex/builds.ts`, `convex/buildScenario.ts` | M3 assistant proxy (server-side), planted faults, grading |
| `convex/items.ts`, `convex/insights.ts` | Item config + adverse-impact check; norms, IRT, outcomes, validity |
| `LATER.md` | Deferred enhancements |

## Run locally
```bash
npm install
npx convex dev               # one terminal; first run creates a deployment and .env.local
                             # (no account needed: CONVEX_AGENT_MODE=anonymous npx convex dev)
npm run dev                  # another terminal, then open http://localhost:3000
npm test                     # 79 tests
```

Convex Auth needs signing keys once per deployment: `npx @convex-dev/auth`
(or set `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` with `npx convex env set`).

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
| `LLM_API_KEY` | unset | API key for the judge endpoint |
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
Three modules (Code Review, Decision Review, Directed Build pilot) with
P1–P6 website functionality at demo depth. See `ReviewBench — Progress Report.md` for what is done, what still
needs real data or owner action, and the roadmap.

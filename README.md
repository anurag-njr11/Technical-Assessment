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
| `src/routes/review.tsx` | Human review queue |
| `src/routes/reliability.tsx` | Reliability dashboard and regression gate |

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in your Convex deployment values
npx convex dev               # in one terminal
npm run dev                  # in another, then open http://localhost:3000
npm test                     # 66 tests
```

## Platform dependencies (read before self-hosting)
This project was built on Macaly Cloud. Two pieces call Macaly services and
must be replaced to run elsewhere:
- `convex/macaly.ts` - the AI judge calls go through Macaly's LLM endpoint.
  Swap `callMacalyJson` for direct calls to your model providers.
- `convex/ResendOTP.ts` - verification emails are sent via Macaly's OTP
  endpoint. Swap in Resend or another email provider.

Required Convex environment variables on the Macaly setup: `MACALY_API_TOKEN`,
`MACALY_BASE_URL`, `MACALY_CHAT_ID`, `OTP_ENDPOINT`, `CHAT_ID`, `APP_NAME`,
`SECRET_KEY`, plus the standard Convex Auth keys (`JWT_PRIVATE_KEY`, `JWKS`).

Optional Convex environment variables:
| Variable | Default | Purpose |
|---|---|---|
| `WORKSPACE_OWNER_EMAIL` | unset | Only this verified email may claim the unclaimed workspace |
| `SUBMISSIONS_PER_HOUR` | 60 | Global cap on graded submissions (bounds judge spend) |
| `STARTS_PER_HOUR` | 300 | Global cap on assessment starts |
| `JUDGE_PANEL_JSON` | built-in panel | Replace judge models; all 6 families must be distinct |

## Status
Code Review module with Phase P1 (safe to use) and the Phase P2 reliability
tooling. See `ReviewBench — Progress Report.md` for what is done, what still
needs real data or owner action, and the roadmap.

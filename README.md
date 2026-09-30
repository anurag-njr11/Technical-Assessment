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
| `convex/answerKey.ts` | Server-only answer key: planted issues + decoys. Never import from `src/` |
| `convex/grading.ts` | Grading pipeline: location match, judge council, evidence check, scoring |
| `convex/submissions.ts` | Candidate submit (public) + recruiter queries (protected) |
| `convex/access.ts` | Workspace owner claim, invites, `requireRecruiter` guard |
| `convex/auth.ts` | Email + password sign-in with emailed verification codes |
| `src/routes/assess.tsx` | Candidate flow |
| `src/routes/recruiter.tsx` | Recruiter dashboard + team management |
| `src/routes/report.tsx` | Evidence-backed candidate report |

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in your Convex deployment values
npx convex dev               # in one terminal
npm run dev                  # in another, then open http://localhost:3000
npm test                     # 24 tests
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

## Status
MVP slice of the Code Review module. See the project status report for known
issues (open assessment link, no autosave, no human-review workflow yet) and
the roadmap.

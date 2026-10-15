# ReviewBench

**ReviewBench doesn't ask whether you can write code without AI. It measures
whether you can work *with* AI to produce reliable engineering work.**

Engineers now spend their day reviewing and steering AI output. ReviewBench
assesses exactly that skill. A candidate reviews a pull request written by an
AI agent, reads the agent's own notes (some of its assumptions are wrong on
purpose) and can question the agent in a chat. Or they critique an AI
architecture recommendation, or build a feature with an AI assistant that
sometimes hallucinates. A council of three LLM judges from different model
families grades the work and the whole human–AI interaction, **every
judgment must quote the candidate's own words**, and deterministic code
computes the score.

> **Live demo:** _link goes here after deploy_ · no sign-up: browse graded
> candidates, then take an assessment yourself and watch your report appear.

<!-- screenshots: docs/screenshots/*.png -->

## Why it's different

- **It tests the job as it is now.** The flagship task is an AI-written PR plus
  the agent's rationale and assumptions. Strong candidates verify claims
  ("where is `gateway.refund()` defined?"), push back with evidence, and catch
  what the AI got wrong; weak ones accept it.
- **Judges answer narrow questions; code computes the score.** No model emits
  a grade. Every "yes" must cite a verbatim quote or an event in the
  recorded interaction, or it's discarded. Disagreements and low quorum go
  to a human, who can override anything with an audit trail.
- **Hidden tests actually run.** Directed Build code is executed in a QuickJS
  WebAssembly sandbox (no network, no secrets, CPU and memory limits); a
  hallucinated API fails at runtime.
- **It measures itself.** A synthetic golden set, adversarial suite
  (prompt injection, keyword stuffing, JSON bait), perturbation tests
  (name swap, non-native English rewrite), test–retest, a regression gate in
  CI, shadow grading of candidate panels, fairness monitoring and 2PL IRT
  item statistics. See **[EVALUATION.md](EVALUATION.md)**.
- **It costs $0 to run.** Free Gemini and Groq tiers or six small models on a
  laptop GPU via Ollama, with per-provider rate limiting, 429 backoff,
  caching and batched judging.

## What's inside

| For candidates | For hiring teams |
|---|---|
| One link or QR code, no account | Assessments by role, module, level and time limit |
| AI PR review with an "Ask the agent" chat (streamed replies) | Candidate table across nine dimensions, side-by-side comparison, CSV export |
| AI design-recommendation review with the agent | Evidence-first report: judge votes and quotes, disagreements, clickable interaction timeline |
| Build with an AI assistant: editor, visible tests | Human review queue, audited overrides of any decision, candidate appeals |
| Autosave, server-enforced timer, accommodations | Company workspaces, team invites, Google sign-in, ATS webhook |
| Results page (when shared) and appeals | Item bank with difficulty, configurable emphasis with an adverse-impact check |

**Scenarios:** ORD-482 (junior code review), PAY-217 and SUB-118 (mid,
equivalent variants that rotate between candidates so leaked answers help
less), INV-311 (senior: concurrency, transactions, cache coherence), ADR-031
and ADR-044 (mid and senior decision reviews), DISC-12 and ORD-519 (directed builds).

## How grading works

```
candidate work + recorded AI interaction
  │
  ├─ M1 answer key ──► location match ──► 3-judge council (6 model families) ──► verbatim-evidence check ──► consensus / escalate
  ├─ trajectory ─────► one batched prompt per judge: assumptions challenged? faults noticed? verified? ──► cited-event check
  └─ builds ─────────► hidden tests in a QuickJS sandbox
                                                  │
                         deterministic score (50% answer key/tests, 50% judged dimensions)
                                                  │
                         evidence-first report ──► human review & audited overrides
```

Details in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Run it locally

Needs Node 22+.

```bash
npm install
npx convex dev            # terminal 1: local backend (no account needed with CONVEX_AGENT_MODE=anonymous)
npx @convex-dev/auth      # once: auth keys
npm run dev               # terminal 2 → http://localhost:3000
```

Then open **/demo** for the seeded demo workspace, or **/recruiter** to create
your own workspace (the sign-up code is printed in `npx convex logs` when no
email provider is set).

### Free AI models

```bash
npx convex env set GEMINI_API_KEY ...   # https://aistudio.google.com/apikey
npx convex env set GROQ_API_KEY ...     # https://console.groq.com/keys
npx convex run models:check             # pings all 6 judges + the assistant
```

Fully offline instead: install [Ollama](https://ollama.com), pull the six
models in `LOCAL_PANEL` (`convex/judges.ts`) and
`npx convex env set JUDGE_PRESET local`. Without any model, everything still
works: grading falls back to deterministic scoring and flags results for
human review.

### Tests and evaluation

```bash
npm test                  # ~140 tests: Convex functions, UI, sandbox, providers, harness
npm run eval              # golden set + adversarial suite with real models → EVALUATION.md
```

## Deploy for $0

1. Create a free [Convex](https://convex.dev) project: `npx convex login`,
   then `npx convex deploy` once and `npx @convex-dev/auth --prod`.
2. On Convex, set `SITE_URL` to your site URL and the model keys above.
3. Import the GitHub repo in [Vercel](https://vercel.com) (free). `vercel.json`
   builds with `npx convex deploy --cmd 'npm run build'`; add the
   `CONVEX_DEPLOY_KEY` (production) environment variable from the Convex dashboard.

## Configuration

Convex environment variables (`npx convex env set NAME value`):

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY`, `GROQ_API_KEY` | unset | Free-tier keys; with either set the **$0 free panel** is used |
| `OPENROUTER_API_KEY` | `LLM_API_KEY` | OpenRouter key (`:free` models are capped at 50 requests a day without credits) |
| `JUDGE_PRESET` | auto | `free`, `local` (Ollama), `openrouter` (paid frontier models) |
| `JUDGE_PANEL_JSON` | preset | Custom panel: 3 judges × (primary, fallback), six distinct families |
| `ASSISTANT_MODEL` | preset default | Agent / assistant, e.g. `groq:openai/gpt-oss-120b`, `ollama:qwen3:4b` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | Local models (local deployments only) |
| `LLM_API_KEY`, `LLM_BASE_URL` | unset, OpenRouter | Models without a provider prefix |
| `TRAJECTORY_BATCH` | on | `off` asks trajectory questions one per call (for evaluation comparisons) |
| `SHADOW_PANEL_JSON` | unset | Candidate panel that also grades live submissions without changing them |
| `REWRITE_MODEL` | assistant | Model for the non-native-English perturbation test |
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | Email codes and links (otherwise printed to the Convex logs) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GOOGLE_HD` | unset | Google sign-in, optionally limited to one Workspace domain |
| `WORKSPACE_OWNER_EMAIL` | unset | Single-company mode: only this email can create a workspace |
| `SUBMISSIONS_PER_HOUR`, `STARTS_PER_HOUR` | 60, 300 | Per-workspace / global caps that bound model spend |
| `RETENTION_DAYS` | unset (keep) | Nightly deletion of old submissions and unused invites |
| `WEBHOOK_URL`, `WEBHOOK_SECRET` | unset | Signed `submission.graded` events for an ATS |

One-off after upgrading an older deployment: `npx convex run access:migrateLegacy`
(moves pre-workspace data into a workspace) and
`npx convex run reliability:backfillMetricRows`.

## Stack

TanStack Start (React 19) + Tailwind CSS · Convex (database, functions,
crons, auth) · QuickJS/WebAssembly sandbox · Vitest + convex-test ·
TypeScript in strict mode · GitHub Actions.

## Status and roadmap

Everything above is implemented and tested. What's left needs real-world
input rather than code: human-graded golden sets to calibrate the score
blend, pilot transcripts to tune the PR agent, and counsel review of the
candidate notice. See [LATER.md](LATER.md).

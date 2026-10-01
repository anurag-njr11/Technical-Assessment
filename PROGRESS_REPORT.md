# ReviewBench — Progress Report

Sep 30, 2026 · @Ace · updated after the P7 AI-native flow build

## Summary

**New in P7 (AI-native flow):** ReviewBench now tells one story: *it doesn't ask whether you can write code without AI; it evaluates whether you can effectively work with AI to produce reliable engineering work.*

- **Recruiter:** create an assessment (role, module, level, time limit, AI-assisted) → reusable link + QR code → a table of all candidates per assessment across the evaluation dimensions → side-by-side comparison of 2–4 candidates → an evidence-first report.
- **Candidate:** open the link or scan the QR → enter a name → the flagship task is **reviewing an AI-written PR together with the agent's rationale and assumptions**, questioning the agent in a chat ("Question this" on each assumption), then submitting comments, a verdict and follow-ups. Directed Build now uses a **live LLM assistant**. No judges, scores or planted issues are visible to candidates.
- **Grading:** the whole candidate–AI interaction is recorded (prompts, responses with token usage, accept/dismiss, manual edits, test runs). A **trajectory council** of the same three judges answers yes/no questions citing event IDs; citations and quotes are verified in code. Nine dimensions are reported with evidence, agreement ("3/3"), confidence and a human-review flag. Efficiency is outcomes per token: fewer tokens or more questions earn nothing by themselves.
- **Verified:** 100/100 automated tests pass; the typecheck (app and `convex/`) is clean; the production build succeeds. **Not verified:** clicking through in a browser, and runs against real models.

The website covers all six earlier roadmap phases, P1–P6, at demo or pilot depth. The code is on GitHub branch `ccr-327afa78-rdcapg`. It has **not been deployed or run against real models yet**. Heavy infrastructure (multi-tenancy, SSO, ATS webhooks, fine-tuning, LLM-generated scenarios) is deferred to `LATER.md`, alongside the checklist for running without Macaly.

- **P1–P2 (earlier today):**
  - Single-use invite links, rate limits, server autosave and an enforced timer.
  - A human review queue with audited overrides.
  - Judge fallbacks from six distinct model families.
  - Golden set, reliability metrics, evaluation runs and the regression gate.
- **P3 (Complete M1):**
  - A second, mid-level code-review scenario.
  - Follow-up answers and communication are scored (reported, not yet weighted).
  - A candidate results page with human-review requests (appeals).
  - A suggested interview guide and print-to-PDF reports.
- **P4 (Modules):**
  - M2 Decision Review (ADR-031, Postgres → MongoDB).
  - M3 Directed Build pilot (DISC-12): a scripted AI assistant with planted faults, trajectory recorded on the server, hidden code checks, and visible tests that run in the browser.
- **P5 (Customization):**
  - Batteries by role and level (one link, several modules).
  - An item bank with detection rates and IRT (Rasch) difficulty; items can be switched off and categories re-weighted within guardrails, with an automatic adverse-impact check on each change.
  - Local norms from internal engineers, hiring outcomes with 6-month ratings, and predictive validity.
- **P6 (Scale & compliance, partial):**
  - Adverse-impact monitoring (four-fifths rule).
  - A public methodology page with published weights and a candidate notice template.
  - Audit-pack export, CSV export for ATS, an experiment log, and RAG few-shot examples behind a flag.
- **Verified (P3–P6 build):** 79/79 tests at the time; public pages rendered at 390 px and 1280 px with no horizontal scroll or page errors.
- **Not verified:** a live deploy, real-model runs, and clicking through the logged-in pages.

Requirement IDs refer to *ReviewBench — Product & Technical Specification* (REVIEWBENCH\_SPEC.md, now v0.6).

## Demo script (for the presentation)

The core flow: **Recruiter** → **Candidate** → **ReviewBench** → **Recruiter**.

1. **Landing page:** the one-line story and the two entry points (Recruiter sign in; "Have an assessment link?").
2. **Recruiter → Create assessment:** role *Backend Engineer*, module *PAY-217 · Partial refunds*, level *Mid*, 35 min, AI-assisted on → Create. The link and QR code appear.
3. **Candidate (phone or second browser):** scan the QR / open `/a/<token>` → enter a name → Start.
4. **Candidate → AI PR review:** read the PR and "The AI agent's notes". Press **Question this** on "gateway.refund() is the SDK's refund method" and ask the agent to show where that method is defined; it defends, then concedes when you point out that `payments/gateway.py` has no such method. Challenge "callers are already authorized upstream". Leave line comments (hallucinated method, missing ownership check, card number in logs), choose *Request changes*, answer the follow-ups, submit.
5. **Optional, Build with AI:** create a second assessment on *ORD-519 · Order search*; as the candidate ask the assistant to "implement searchOrders", notice the string-built SQL and the missing `user_id` filter, ask it to fix them, run the tests, submit.
6. **ReviewBench (behind the scenes):** the trajectory is captured → judge council → evidence verification → deterministic scoring.
7. **Recruiter → Assessment page:** every candidate with overall, engineering judgment, AI verification, issue detection, prompt quality, AI interaction, efficiency (with tokens), time taken, testing/validation and outcome. Sort by a column; tick two candidates → **Compare**.
8. **Recruiter → Report:** overall + dimension table → judge evidence cards ("Judges: 3/3 agree", confidence) → **Judge disagreements** ("Human review recommended") → click an event ID to jump to that moment in the interaction timeline → the PR with the assumptions the candidate challenged marked.
9. **Human review:** override an item with a justification; the score is recomputed and keeps the trajectory blend.
10. **Supporting depth (if time):** Methodology, Item bank, Reliability (adversarial suite, gate, fairness, audit pack).

> Needs a deployed backend with `LLM_API_KEY` set. Without it, the assistant and the PR agent fall back to scripted replies, and grading falls back to deterministic scoring with every submission flagged "AI judges were unavailable".

## Completed

### Phase P0 · MVP slice (earlier)

| Area | What's built | Spec IDs |
| --- | --- | --- |
| Scenario | Reference scenario ord-482-junior: ticket, 3-file diff, 4 planted issues + 1 decoy, server-only answer key | SC-1 (MVP size), SC-3, SC-4, SC-5, SC-10 |
| Candidate flow | No-account intro, diff viewer with wrapping lines, line comments with severity, verdict, locked review, 3 required follow-ups, timer, confirmation screen, server input limits | FR-C-1, 2, 4–11, 18 |
| Grading engine | ±3-line matching; 3-judge checklist council; untrusted-input delimiters; evidence verification; unmatched-comment classification; majority consensus; escalation; deterministic 5-component score and bands | GR-1–6, GR-8–14, GR-16–21, §11 |
| Recruiter side | Dashboard with live status and stats; evidence-backed report with per-judge votes, escalation banner, follow-ups, retry | FR-R-1–4, FR-R-7–15 |
| Access and security | Email + password with emailed code; password reset; first-verified-account claim; owner invites/revokes/removes; server-side recruiter checks | SEC-1–13, FR-R-18–19 |

### Phase P1 · Safe to use (earlier today)

| Blocker | What's built | Spec IDs |
| --- | --- | --- |
| Open assessment link, unlimited submissions | Recruiters create a candidate (name, optional email, extra minutes) and get a 192-bit single-use link. `/assess?t=…` is the only way in. Each token submits once and can be revoked. Global hourly caps on starts (300) and graded submissions (60) bound AI spend, plus a per-candidate cap on draft saves. All caps are configurable. | FR-C-12, FR-R-6, SEC-15 |
| No autosave | The draft (comments, verdict, answers, step) saves to the server about 1 s after each change and restores on refresh. Once the candidate moves to follow-ups, the server locks the review and ignores later changes to it. | FR-C-13, FR-C-8 |
| Timer display-only | The deadline is set on the server at Start. Saves and submits are refused after deadline + 2 min grace. A scheduled job then auto-submits whatever was saved (verdict recorded as `none` if none was chosen, marked "auto" in the dashboard). The client timer counts down to the server deadline. | FR-C-14 |
| Extra time | 0–120 extra minutes per candidate, shown to them on the intro screen. | FR-C-16 |
| Clicks before hydration | Nothing interactive renders until React has hydrated; a spinner shows instead. The Start button also disables while starting. | FR-C-15 |
| Escalations have no workflow | `/review` queue lists escalated submissions with their specific reasons. In the report, reviewers can override any item (outcome, explanation 0–2, supporting comment) or reclassify any other comment; a written justification is required. Every change goes in an audit log (who, when, before/after, why). The score is recomputed deterministically from the untouched council result, and overrides survive a regrade. Item overrides also become golden-set labels. "Mark review complete" closes the item. | HR-1–4 |
| Fallbacks duplicate a family | Fallbacks are now Qwen (Alibaba), Mistral and DeepSeek, so all six models come from distinct families. The panel is validated at load time, and `JUDGE_PANEL_JSON` lets the owner swap models without a code change. | GR-7 |
| Whoever signs up first becomes owner | Mitigated in code: set `WORKSPACE_OWNER_EMAIL` and only that verified email can claim. The owner still has to claim it. | SEC-5 |

### Other known gaps closed

| Gap | What's built | Spec IDs |
| --- | --- | --- |
| Vague comments show as "undetermined" | New `vague_match` label with a specific escalation reason that names the comment location and the issue it probably refers to. | GR-15 |
| Result stored without schema | `result` and `machineResult` are validated by `resultValidator`. Fields added in this build are optional, so the existing demo result still validates on deploy. | NFR-DATA-1 |
| Every result reproducible | Each result records rubric, prompt, scoring and scenario versions, the models actually used, and the number of judge calls. | REL-9, SC-9, NFR-COST-1 |
| Demo submission and test data | Owner-only "Delete submission" removes the submission, its reviews, labels, traces and invite. It also serves candidate deletion requests. | SEC-17 (partial) |
| Dashboard triage | Search by candidate and filter by status (including "needs review"). | FR-R-5 (partial) |

### Phase P2 · Trustworthy (tooling built; needs real data)

| Capability | What's built | Spec IDs |
| --- | --- | --- |
| Golden set | "Golden set" panel on every report: a recruiter grades each item and an overall 0–100 score without looking at the judges. Each grader has one current set of labels per submission. | REL-1 |
| Accuracy vs humans | Quadratic weighted kappa per item and pooled, with bootstrap 95% CIs. Also detection accuracy (Wilson CI), human–human kappa, and mean error of the overall score against human scores. | REL-2, SM-1 |
| Test–retest | "Re-grade 5×" on any report: five live gradings of the same submission, with the standard deviation reported. | REL-3, SM-2 |
| Inter-judge agreement | Fleiss' kappa, unanimity rate, and each model's agreement with the consensus. | REL-4 |
| Evidence validity | Share of positive votes whose quote was verified, per model and overall. | REL-5, SM-3 |
| Perturbation tests | Six variants of a submission graded live: original, name swap, reformat, reversed order, verbose filler, injection string. The report shows each variant's score shift against a ±3-point target. | FB-2, SM-5 |
| Anonymization | Candidate names and emails are replaced with `[candidate]` / `[email]` before any judge sees a comment, and evidence is checked against the redacted text. | FB-1 |
| Adversarial suite | 7 live cases: pure injection, judge-JSON bait, keyword stuffing, decoy objection, correct-but-misplaced comment, perfect review, empty approve. Each case has pass/fail expectations. | REL-10 |
| Regression gate | Run the golden set, mark a run as baseline, re-run after any change. The gate fails if kappa drops by more than 0.05, falls below 0.70, or evidence validity is under 98%. CI (GitHub Actions) runs the typecheck and all unit tests on every push. | REL-7, EX-4 |
| Reliability dashboard | `/reliability`: tiles for SM-1, 2, 3, 4, 5 and 8, plus REL-4 and REL-10, each with a confidence interval, a target and a status. Also per-item and per-model tables, the gate, calibration and the run history. | REL-8 |
| Weight calibration | Grid search over the weight simplex (step 0.05) that best reproduces human overall scores. Shown as a suggestion with before/after error. | §11.2 |
| Tracing | Every judge call is logged: stage, judge, model, family, success, latency, input/output size, output. Each report shows its call count and estimated tokens. | EX-2, NFR-OBS-1 |
| Versioning | Rubric, prompt and scoring versions are recorded on every result and every evaluation run. | EX-1 (partial) |

### Phase P3 · Complete M1 (this build)

| Capability | What's built | Spec IDs |
| --- | --- | --- |
| More scenarios and levels | PAY-217 (Mid): partial refunds, with 6 planted issues (missing ownership check, cumulative refunds ignored, hallucinated `gateway.refund()`, gateway called before commit, full card number in logs, unvalidated amount) and 1 decoy (idempotent replay). Every candidate-visible scenario is kept in sync with the server by tests. | SC-1, SC-3–5, SC-9 |
| Follow-up scoring | Each answer gets a checklist (addresses the question / specific / actionable) with verified evidence. Shown on the report; not weighted into the score until calibrated (open question §29.1). | SCR-1 |
| Communication | The issue checklist adds "constructive" (specific and actionable); the report shows the share of found issues explained that way. | SCR-2 |
| Candidate report | `/results?t=…`, only after the recruiter shares it: score, component breakdown in plain language, strengths and gaps by category. The answer key is shown only for retired scenarios. | TR-4 |
| Appeals | The candidate requests a human review from the results page. It appears in the review queue marked "appeal"; the resolution note is shown back to the candidate. | TR-5 |
| Interview guide | Deterministic structured questions for each missed category, incomplete explanation and false alarm. | FR-R-16 |
| PDF export | Print-friendly report with a "PDF" button (browser print to PDF). | FR-R-17 |

### Phase P4 · Modules (this build)

| Capability | What's built | Spec IDs |
| --- | --- | --- |
| M2 Decision Review | ADR-031: context, constraints and an AI recommendation with 5 planted reasoning flaws (benchmark mismatch, breaks finance reporting, ignores ops cost and skills, no migration plan, unprofiled assumption) and 2 decoys (the index, archiving). The candidate approves or rejects, then writes three critique sections. Graded by the same council and scoring. | §7.2 |
| M3 Directed Build (pilot) | DISC-12: editor, AI assistant and visible tests (run in a Web Worker). The assistant is a server-side scripted proxy: 3 of 8 responses carry planted faults (`> 50` instead of `>= 50`, a hallucinated `cart.getSubtotalAfterTax()`, case-sensitive codes). Every prompt, response, fault, accept/dismiss and test run is recorded on the server. Grading is deterministic: exposed faults fixed (hidden code checks), calibrated trust, testing, instruction quality (heuristic) and task completion. Faults never triggered are "not exposed" and excluded. No AI credits needed. | §7.3, §10.7 |

### Phase P5 · Customization (this build)

| Capability | What's built | Spec IDs |
| --- | --- | --- |
| Batteries | Junior Backend, Mid Backend and AI collaboration batteries (all ≤ 60 min). One link opens a landing page listing the parts; each part has its own timer. | CU-1, CU-3 |
| Item bank | `/items`: every item's detection or false-alarm rate, sample size and Rasch difficulty. | SB-3, SCR-3 |
| Configuration within guardrails | Owners can switch planted issues off (decoys can't be; at least half the issues must stay on) and set category emphasis between 0.5× and 1.5×. It applies to new gradings and is recorded on each result. | SB-4, CU-2 |
| Adverse-impact check on change | Every configuration change recomputes stored results under the new settings and reports the four-fifths ratio. | FB-6, CU-8 |
| Local norms | Invite internal engineers as "benchmark"; reports show the candidate's percentile against them. | SCR-5, CU-6 |
| IRT ability | Rasch θ ± 95% CI on each report (3+ graded submissions per scenario). | SCR-3 |
| Outcome tracking | Record hired / not hired and a 6-month manager rating on each report; Reliability shows the score–rating correlation. | CU-7 |

### Phase P6 · Scale & compliance (partial, this build)

| Capability | What's built | Spec IDs |
| --- | --- | --- |
| Adverse-impact monitoring | Selection rate per self-identified, consented group, with impact ratios, on Reliability. | FB-3, SM-6, CO-4 |
| Public methodology | `/methodology`: pipeline, published weights and bands, reliability targets, candidate rights, notice template. | TR-2, TR-6, CO-1–3 |
| Audit pack | One-click JSON export of reliability, fairness, validity and the experiment log. | CO-1, CO-5 |
| ATS export | CSV export of the dashboard (webhooks: later). | §27 P6 |
| Experiment log | Hypothesis / change / result / decision, on Reliability. | EX-5 |
| RAG few-shot | With `RAG_EXAMPLES=on`, up to 2 lexically similar human-graded comments are added to each issue prompt; the count is recorded on the result. | KA-1–4 (partial) |
| Deferred | Multi-tenancy, SSO, ATS webhooks, fine-tuned judge, shadow mode, caching/queues, retention policy: see `LATER.md`. | SEC-4, KA-5–7, EX-3 |

### Phase P7 · AI-native flow (this build)

| Capability | What's built | Spec IDs |
| --- | --- | --- |
| Assessments with link and QR | Recruiters create an assessment: role (5 roles), module, level, time limit (10–90 min), AI-assisted. One reusable 192-bit link `/a/<token>` with a copy button and QR code. Close/reopen. Opening the link creates the candidate's own single-use token; the assessment's time limit applies. 200 joins/hour per link. | FR-R-20–22, FR-C-19–21, SEC-15, SEC-18 |
| AI PR review with the agent (flagship) | PAY-217 (7 assumptions) and ORD-482 (5) now show the agent's rationale and assumptions; all but the last are wrong and map to answer-key issues on the server (`ASSUMPTION_KEYS`). An "Ask the agent" chat where a live LLM role-plays the PR's author: it defends, concedes only to a correct concrete challenge, never volunteers flaws. "Question this" pre-fills the chat. The chat is saved with the submission. | §7.4, PR-1–5 |
| Live Directed Build assistant | `builds.ask` is now an action calling `ASSISTANT_MODEL`. Scripted fault intents still return the scripted faulty code, so faults stay identical for everyone. Scripted fallback when there is no key or the call fails. Token usage recorded per reply. Candidate identity never sent. | §7.3, AS-1–6 |
| New build scenario | ORD-519 order search (Backend, Mid, 35 min): SQL injection, missing ownership filter, hallucinated `db.queryParams()`, no `LIMIT`. Visible tests only check what the ticket states. | §7.3 |
| Simple candidate UI | Link landing page (mobile-first); workspace laid out as Task → Code editor → AI assistant → Tests → Submit; manual edits recorded after 3 s idle; no ReviewBench jargon anywhere candidate-facing; landing page tells the story. | FR-C-22–24, AS-6 |
| Trajectory council | Same 3-judge panel; yes/no questions per planted fault, per assumption and 11 behaviours; votes must cite real event IDs and quotes found in those events; agreement, confidence, human-review flag. Deterministic fallback if every judge is down. Runs for builds and for PR reviews with chat. | §10.8, TJ-1–12 |
| Dimensions and scoring | Nine dimensions (issue detection, engineering judgment, reasoning, trust calibration, prompt quality, interaction quality, verification, efficiency, challenging assumptions) with the signals behind each. Efficiency = outcomes per token; zero outcomes = 0. Overall = 50% deterministic grade + 50% judged dimensions; human overrides keep the blend. | §11.4 |
| Evidence-first recruiter views | Assessment page with every candidate across the dimensions (sortable); side-by-side comparison of 2–4 candidates; report opens with dimensions, judge evidence, disagreements and grouped findings; event IDs jump to the interaction timeline; the PR and challenged assumptions are shown. | FR-R-23–27 |

## Verification

All 100 automated tests pass. The typecheck is clean for the app and for `convex/`, and the production build succeeds. Nothing has been run against real models, a live Convex deployment, or clicked through in a browser.

| Check | Scope | Result |
| --- | --- | --- |
| Access control | 10 tests: the original 9 + owner-email lock | 10/10 pass |
| Grading pipeline | 16 tests: reference outcomes, perfect review, wrong verdict, fabricated evidence, low quorum, injection, misplaced comment, schema/versions, 6-family panel, cross-family failover, call tracing, panel override, `vague_match`, anonymization | 16/16 pass |
| Invites, autosave, timer | 12 tests: recruiter-only creation, validation, bad tokens, single use, revoke, required answers, limits, autosave + review lock, deadline + grace + auto-submit, extra time, restart keeps deadline, rate limit | 12/12 pass |
| Human review | 7 tests: queue, justification + audit + recompute + golden feed, comment reclassification, overrides survive regrade, resolve, non-members blocked, owner-only deletion | 7/7 pass |
| Statistics and scoring | 9 tests: kappa (checked by hand), Fleiss, Wilson, bootstrap, gate, weight recovery, score formula, override ordering | 9/9 pass |
| Evaluation runs + dashboard | 4 tests: perturbation variants, adversarial suite, end-to-end retest/perturbation/adversarial/golden/baseline/gate, errored run | 4/4 pass |
| Scenario integrity | 11 tests: answer-key isolation, visible lines and hallucination checks for every code scenario, server/client scenario and battery sync | 11/11 pass |
| Modules and assistant | 13 tests: Decision Review grading; Directed Build (fixed / unchanged / not exposed); live assistant sends no identity and keeps faults deterministic; scripted fallback; ORD-519 grading; PR-author chat records tokens and reaches the submission; assumption keys in sync; results + appeals; batteries; item guardrails; Rasch; four-fifths | 13/13 pass |
| Assessments | 4 tests: create → public info → join → session with the assessment's time limit, list counts; closed link rejects joins; validation; recruiter-only | 4/4 pass |
| Trajectory council | 8 tests: unanimous → high confidence and redacted transcript; split → review; missing event id discarded; unverified quote discarded; all judges down → deterministic; correct challenge credited with raw token totals; no reward for low tokens without outcomes; overrides keep the blend | 8/8 pass |
| UI components | 6 tests: workspace steps, restored chat and insert; code-edit logging; interview guide; evidence report (dimensions, disagreements, jump to event); challenged assumptions; link + QR | 6/6 pass |
| Build | Production build (`vite build`) | Pass |
| Layout | Landing, methodology, candidate, results, battery, item bank and reliability pages at 390 px and 1280 px | No horizontal overflow, no page errors |

**Found while testing:**

- **Fixed:** the fake judge used in tests matched issue titles against the whole prompt, including the candidate's comment. Its keyword matching is now restricted to the answer-key part of the prompt. The old tests had passed by accident.
- **Fixed:** the email redaction pattern swallowed an opening bracket before an email address.
- **Fixed (P7):** the trajectory schema validators were declared after the result validator that used them, which broke every Convex test and codegen until they were reordered.
- **Fixed (P7):** a human override recomputed the score from the deterministic grade alone and silently dropped the judged half. Both paths now share `blendOverall`; a regression test covers it.
- **Fixed (P7):** two ORD-519 visible tests checked the SQL-injection and ownership faults directly, handing candidates the answer. Removed; visible tests now cover only the ticket.
- **Fixed (P7):** `convex/tsconfig.json` lacked Node types, so `npx convex dev`/deploy failed their typecheck on `process.env`.
- **Known and expected:** with the keyword-based fake panel, the `keyword_stuffing` adversarial case "passes" the stuffed comment. That case exists to catch real models that behave like keyword matchers, so only the live run on `/reliability` means anything for it.

## Needs fixing

Eighteen items remain. The first six must be done before inviting real candidates.

| # | Priority | Issue | Impact | Fix | Spec ID |
| --- | --- | --- | --- | --- | --- |
| 1 | Blocker | Workspace not yet claimed | Whoever signs up first becomes owner | Set `WORKSPACE_OWNER_EMAIL`, deploy, sign up and claim | SEC-5 |
| 2 | Blocker | This build is not deployed | None of P1 is live yet | Sync the branch to Macaly, deploy, smoke-test (see Next steps) | — |
| 3 | Blocker | Fallback model IDs unconfirmed | If the endpoint doesn't serve them, a failover becomes "judge unavailable" and escalates rather than grading | Check the Macaly model catalogue; adjust with `JUDGE_PANEL_JSON` if needed | GR-7 |
| 4 | Blocker | Recruiter pages not browser-tested against a live backend | UI bugs in the review, golden-set or reliability screens would only show after deploy | Click through each flow on the preview once | — |
| 5 | Blocker | Invite links are copied, not emailed | Recruiters must paste links or share the QR code | Acceptable for pilots; add email sending later | FR-R-6 |
| 6 | Blocker | The P7 flow has not been clicked through | Assessment creation, the link landing page, the agent chat and the evidence report are only covered by component and backend tests | Run the demo script once end to end on a deployment with `LLM_API_KEY` | — |
| 6 | High | Weights and bands uncalibrated | Scores are not yet valid for decisions | 30–50 human-graded reviews, then use the calibration panel and the regression gate | §11.2, REL-1, AC-REL-1 |
| 7 | High | No real-model evaluation yet | Injection resistance and stability unproven | Run the adversarial suite, 5× retest and perturbation on a few real submissions | REL-3, REL-10, FB-2 |
| 8 | Medium | Non-native-English perturbation not implemented | FB-2 is partial | Needs an LLM rewrite step; add to the perturbation set | FB-2 |
| 9 | Medium | Dashboard and queue read the latest 300 submissions | Older data drops out of the metrics | Move to incremental aggregates when volume grows | REL-8, HR-1 |
| 10 | Low | Dashboard filters by status/name only | No role/level/date filter | Add when there is more than one scenario | FR-R-5 |
| 11 | Low | Demo submission still in the database | Clutter in the metrics | Delete it with the new owner-only Delete button | — |
| 12 | Medium | Directed Build is still a pilot | The assistant is live, but code runs only in the browser (no sandbox or server-side hidden tests); overrides of build items are blocked | See `LATER.md` §P4 | §7.3 |
| 13 | Medium | Follow-up scoring adds ~9 judge calls per code review | About 25–30 calls per submission (spec estimate 12–20) | Leave it on for the demo; decide on §29.1, then batch or drop it | NFR-COST-1 |
| 14 | Low | New scenarios have no human validation yet | Planted issues and agent assumptions may need wording tweaks after pilots | Pilot with 3–5 internal engineers each | SC-2, SC-6 |
| 15 | High | "AI-assisted" and level are labels only | Turning AI-assisted off does not hide the agent chat or assistant; the level does not change the scenario content | Pass the assessment flags to the candidate session and hide the chat when off; decide on §29.10 | FR-R-20 |
| 16 | High | Trajectory blend and efficiency constant uncalibrated | The 50/50 blend and 4000 tokens per outcome are guesses | Calibrate against human-graded trajectories with the golden set | §11.4, §29.8–9 |
| 17 | Medium | More judge and assistant calls | A PR review with chat adds dozens of trajectory calls plus one assistant call per prompt | Batch trajectory questions per judge call once accuracy is measured | NFR-COST-1 |
| 18 | Medium | PR-agent behaviour unmeasured | The live model may concede too early or volunteer its flaws, which would change what is being measured | Review transcripts from pilots; tighten `AUTHOR_SYSTEM`; consider a fixed model per scenario version | §7.4 |

## Remaining

Three of the six problem-statement objectives are now substantially met (up from one); the rest need data or later phases.

**Against the original problem statement**

| Objective | Status | What's missing |
| --- | --- | --- |
| 1. Evaluation pipeline | Built (M1, M2, M3 pilot) | Live-LLM Directed Build; queueing, caching, cascade routing at scale |
| 2. Evaluation methodology | Built, unmeasured | Checklists, evidence checks, diversity, anonymization and perturbation tooling exist; real-data results and FB-3–6 bias audits are missing |
| 3. Knowledge alignment | Partial | Lexical RAG built behind a flag; embeddings and a fine-tuned judge (KA-5–7) later |
| 4. Benchmarking and QA | Tooling built | Golden set to be collected; regression gate to be exercised on real runs |
| 5. Experimental framework | Mostly built | Versioning, tracing, gate and experiment log done; shadow mode (EX-3) later |
| 6. Transparency and trust | Built | Full technical manual beyond the summary page; counsel review |
| Directing and collaborating with AI | Built (pilot depth) | AI PR review with a live agent, live Directed Build assistant, trajectory council and dimensions; needs pilots and calibration |

**By roadmap phase**

| Phase | Theme | Status |
| --- | --- | --- |
| P0 | MVP slice | Done |
| P1 | Safe to use | Built and tested; needs deploy and owner setup |
| P2 | Trustworthy | Tooling built; needs 30–50 human-graded reviews and live runs |
| P3 | Complete M1 | Built; variants and rotation (SC-7) later |
| P4 | New modules | M2 built; M3 pilot (live LLM + sandbox later) |
| P5 | Customization | Built except LLM scenario generation, job analysis and BYO code (later) |
| P6 | Scale and compliance | Partial: fairness, methodology, audit and CSV exports, RAG flag built; multi-tenancy, SSO, ATS webhooks and fine-tuning later |
| P7 | AI-native flow | Built and tested; needs a browser run-through, real-model runs and calibration |

## Next steps

**Owner actions (in order)**

- [ ] Review and merge branch `ccr-327afa78-rdcapg` on GitHub, then sync it to the Macaly project
- [ ] `npx convex env set WORKSPACE_OWNER_EMAIL you@company.com`, then deploy (the schema accepts the existing demo data)
- [ ] Sign up at /recruiter, verify your email, claim the workspace
- [ ] Confirm the three fallback models are served by the Macaly endpoint (or set `JUDGE_PANEL_JSON`)
- [ ] `npx convex env set LLM_API_KEY …` (and optionally `ASSISTANT_MODEL`)
- [ ] Smoke test: create an assessment → open the link on a phone via the QR → question the agent → refresh mid-way (draft and chat should survive) → submit → open the assessment page and the report → override one item → mark the review complete
- [ ] On `/reliability`: run the adversarial suite; on one report, run "Re-grade 5×" and "Run perturbation tests"
- [ ] Delete the demo submission

**Build order after that**

1. Enforce the assessment's AI-assisted flag in the candidate flow (Needs fixing #15).
2. P2 data: collect 30–50 human-graded reviews (two graders each where possible), run the golden set, set a baseline, then calibrate weights and bands.
3. Pilot the new scenarios with internal engineers; then add variants (SC-7).
4. Directed Build with a live LLM and sandboxed hidden tests; then multi-tenancy and SSO.

**Open decisions** (spec §29)

- What blend between the deterministic grade and the judged dimensions, and what token budget per outcome?
- Should the assessment's level pick different scenario content?
- Should follow-up answers count toward the score?
- Should candidates see their detailed report by default?
- Which model providers meet the no-training-on-inputs requirement for production?

## Work log

### 30 Sep 2026 · Checkpoint 1: P1 backend and P2 engine

Scope agreed with the owner: all P1 blockers, the remaining known gaps, and the P2 reliability tooling. Delivery is the GitHub branch `ccr-327afa78-rdcapg`; syncing to Macaly and deploying is done by the owner.

- **Backend:** invite tokens, rate limits, autosave, enforced deadline, extra time, review queue, family-distinct fallbacks, `vague_match`, result schema, tracing, anonymization, golden set, evaluation runs, dashboard query.
- **Tests:** 24 → 64.

### 30 Sep 2026 · Checkpoint 2: frontend, docs, CI

- **Candidate flow:** token-based `/assess?t=…`, autosave indicator, server-deadline timer, time-up screen, hydration guard.
- **Recruiter:** invite panel with copy/revoke, search and status filter, nav to the new pages; report gains override/reclassify forms, audit history, resolve, golden-set grading, evaluation buttons, trace summary and owner delete; new `/review` and `/reliability` pages.
- **Docs and CI:** spec updated to v0.4 to match the code; README and `.env.example` document the new env vars; GitHub Actions runs the typecheck and tests.
- **Tests:** 64 → 66; production build and layout checks pass.

### 30 Sep 2026 · Checkpoint 3: P3–P6 for the presentation

- **Scope:** website functionality first; heavy infrastructure moved to `LATER.md`, together with the checklist for running without Macaly.
- **Built:**
  - PAY-217 (M1 Mid), ADR-031 (M2) and DISC-12 (M3 pilot).
  - Batteries.
  - A candidate results page with appeals.
  - Follow-up and communication scoring.
  - Interview guide and print to PDF.
  - Item bank with IRT difficulty, item configuration and emphasis, with an adverse-impact check on each change.
  - Local norms, outcomes and predictive validity.
  - Methodology page, audit pack, CSV export, experiment log, and RAG behind a flag.
- **Tests:** 66 → 79. No tests were removed; browser end-to-end tests are deferred (`LATER.md` §C).
- **Not possible here:** a local Convex backend (download blocked by the network policy), so the logged-in pages were checked by typecheck, build and component tests only.

### 30 Sep 2026 · Checkpoint 4: P7 AI-native flow

- **Scope (from the owner):** separate recruiter and candidate experiences; assessments with a link/QR; the candidate works with a ReviewBench-provided AI; the flagship is an AI PR with the agent's rationale and assumptions that the candidate can challenge; judges evaluate the recorded trajectory; the recruiter sees every candidate per assessment, a comparison view and an evidence-first report. Do not reward fewer tokens or more questions by themselves.
- **Built:**
  - Assessments backend and link landing page.
  - Live assistant with deterministic planted faults; PR-author agent; ORD-519 build scenario.
  - Trajectory council, nine dimensions, blended overall.
  - Recruiter dashboard, assessment page, comparison view and evidence report.
  - Simplified, jargon-free candidate UI.
- **Tests:** 79 → 100. Typecheck clean for the app and `convex/`; production build passes.
- **Not done here:** browser run-through and real-model runs.

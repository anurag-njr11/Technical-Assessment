# ReviewBench — Progress Report

Sep 30, 2026 · @Ace · updated after the P1 + P2 build

## Summary

Phase P1 (safe to use) is built, and so is the Phase P2 reliability tooling. The code is on GitHub branch `ccr-327afa78-rdcapg`. It has **not been deployed or run against real models yet**. Several items still need the owner or real data before real candidates take the assessment.

- **Built:**
  - Single-use invite links with rate limits.
  - Server-side autosave and a server-enforced timer with auto-submit.
  - Extra-time accommodations and a hydration fix.
  - A human review queue with audited overrides.
  - Judge fallbacks from six distinct model families.
  - The `vague_match` label and a validated result schema.
  - Judge-call tracing and anonymization.
  - Golden-set labelling, evaluation runs (test–retest, perturbation, adversarial, golden-set regression), a reliability dashboard and weight calibration.
- **Verified:** 66/66 automated tests pass (up from 24). The typecheck is clean and the production build succeeds. The candidate pages render at 390 px and 1280 px with no horizontal scroll.
- **Not yet verified:**
  - A deploy to Macaly/Convex.
  - Any run with the real judge models, including the new fallback model IDs.
  - Browser QA of the recruiter pages against a live backend.
- **Still blocking real use:**
  - The owner must claim the workspace, deploy, and confirm the fallback models.
  - Collect 30–50 human-graded reviews and calibrate the weights before scores inform hiring decisions.

Requirement IDs refer to *ReviewBench — Product & Technical Specification* (REVIEWBENCH\_SPEC.md, now v0.4; it has been updated to match the code).

## Completed

### Phase P0 · MVP slice (earlier)

| Area | What's built | Spec IDs |
| --- | --- | --- |
| Scenario | Reference scenario ord-482-junior: ticket, 3-file diff, 4 planted issues + 1 decoy, server-only answer key | SC-1 (MVP size), SC-3, SC-4, SC-5, SC-10 |
| Candidate flow | No-account intro, diff viewer with wrapping lines, line comments with severity, verdict, locked review, 3 required follow-ups, timer, confirmation screen, server input limits | FR-C-1, 2, 4–11, 18 |
| Grading engine | ±3-line matching; 3-judge checklist council; untrusted-input delimiters; evidence verification; unmatched-comment classification; majority consensus; escalation; deterministic 5-component score and bands | GR-1–6, GR-8–14, GR-16–21, §11 |
| Recruiter side | Dashboard with live status and stats; evidence-backed report with per-judge votes, escalation banner, follow-ups, retry | FR-R-1–4, FR-R-7–15 |
| Access and security | Email + password with emailed code; password reset; first-verified-account claim; owner invites/revokes/removes; server-side recruiter checks | SEC-1–13, FR-R-18–19 |

### Phase P1 · Safe to use (this build)

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

## Verification

All 66 automated tests pass. The typecheck is clean and the production build succeeds. Nothing has been run against real models or a live Convex deployment from this environment.

| Check | Scope | Result |
| --- | --- | --- |
| Access control | 10 tests: the original 9 + owner-email lock | 10/10 pass |
| Grading pipeline | 16 tests: reference outcomes, perfect review, wrong verdict, fabricated evidence, low quorum, injection, misplaced comment, schema/versions, 6-family panel, cross-family failover, call tracing, panel override, `vague_match`, anonymization | 16/16 pass |
| Invites, autosave, timer | 12 tests: recruiter-only creation, validation, bad tokens, single use, revoke, required answers, limits, autosave + review lock, deadline + grace + auto-submit, extra time, restart keeps deadline, rate limit | 12/12 pass |
| Human review | 7 tests: queue, justification + audit + recompute + golden feed, comment reclassification, overrides survive regrade, resolve, non-members blocked, owner-only deletion | 7/7 pass |
| Statistics and scoring | 9 tests: kappa (checked by hand), Fleiss, Wilson, bootstrap, gate, weight recovery, score formula, override ordering | 9/9 pass |
| Evaluation runs + dashboard | 4 tests: perturbation variants, adversarial suite, end-to-end retest/perturbation/adversarial/golden/baseline/gate, errored run | 4/4 pass |
| Scenario integrity | 8 tests: the original 6 + server/candidate scenario metadata match | 8/8 pass |
| Build | Production build (`vite build`) | Pass |
| Layout | Landing and candidate pages at 390 px and 1280 px | No horizontal overflow |

**Found while testing:**

- **Fixed:** the fake judge used in tests matched issue titles against the whole prompt, including the candidate's comment. Its keyword matching is now restricted to the answer-key part of the prompt. The old tests had passed by accident.
- **Fixed:** the email redaction pattern swallowed an opening bracket before an email address.
- **Known and expected:** with the keyword-based fake panel, the `keyword_stuffing` adversarial case "passes" the stuffed comment. That case exists to catch real models that behave like keyword matchers, so only the live run on `/reliability` means anything for it.

## Needs fixing

Eleven items remain. The first five must be done before inviting real candidates.

| # | Priority | Issue | Impact | Fix | Spec ID |
| --- | --- | --- | --- | --- | --- |
| 1 | Blocker | Workspace not yet claimed | Whoever signs up first becomes owner | Set `WORKSPACE_OWNER_EMAIL`, deploy, sign up and claim | SEC-5 |
| 2 | Blocker | This build is not deployed | None of P1 is live yet | Sync the branch to Macaly, deploy, smoke-test (see Next steps) | — |
| 3 | Blocker | Fallback model IDs unconfirmed | If the endpoint doesn't serve them, a failover becomes "judge unavailable" and escalates rather than grading | Check the Macaly model catalogue; adjust with `JUDGE_PANEL_JSON` if needed | GR-7 |
| 4 | Blocker | Recruiter pages not browser-tested against a live backend | UI bugs in the review, golden-set or reliability screens would only show after deploy | Click through each flow on the preview once | — |
| 5 | Blocker | Invite links are copied, not emailed | Recruiters must paste links into their own email | Acceptable for pilots; add email sending later | FR-R-6 |
| 6 | High | Weights and bands uncalibrated | Scores are not yet valid for decisions | 30–50 human-graded reviews, then use the calibration panel and the regression gate | §11.2, REL-1, AC-REL-1 |
| 7 | High | No real-model evaluation yet | Injection resistance and stability unproven | Run the adversarial suite, 5× retest and perturbation on a few real submissions | REL-3, REL-10, FB-2 |
| 8 | Medium | Non-native-English perturbation not implemented | FB-2 is partial | Needs an LLM rewrite step; add to the perturbation set | FB-2 |
| 9 | Medium | Dashboard and queue read the latest 300 submissions | Older data drops out of the metrics | Move to incremental aggregates when volume grows | REL-8, HR-1 |
| 10 | Low | Dashboard filters by status/name only | No role/level/date filter | Add when there is more than one scenario | FR-R-5 |
| 11 | Low | Demo submission still in the database | Clutter in the metrics | Delete it with the new owner-only Delete button | — |

## Remaining

Three of the six problem-statement objectives are now substantially met (up from one); the rest need data or later phases.

**Against the original problem statement**

| Objective | Status | What's missing |
| --- | --- | --- |
| 1. Evaluation pipeline | Built (M1) | M2 and M3 modules; queueing, caching, cascade routing at scale |
| 2. Evaluation methodology | Built, unmeasured | Checklists, evidence checks, diversity, anonymization and perturbation tooling exist; real-data results and FB-3–6 bias audits are missing |
| 3. Knowledge alignment | Not started | RAG with graded examples (KA-1–4); fine-tuned judge (KA-5–7) |
| 4. Benchmarking and QA | Tooling built | Golden set to be collected; regression gate to be exercised on real runs |
| 5. Experimental framework | Partial | Versioning and tracing done; shadow mode and experiment log (EX-3, EX-5) missing |
| 6. Transparency and trust | Partial | Recruiter reports with full audit trail; no candidate report, appeals or technical manual (TR-4–6) |
| Directing and collaborating with AI | Not started | Decision Review (M2) and Directed Build (M3) |

**By roadmap phase**

| Phase | Theme | Status |
| --- | --- | --- |
| P0 | MVP slice | Done |
| P1 | Safe to use | Built and tested; needs deploy and owner setup |
| P2 | Trustworthy | Tooling built; needs 30–50 human-graded reviews and live runs |
| P3 | Complete M1 | Not started: follow-up scoring, candidate reports, appeals, more scenarios and levels |
| P4 | New modules | Not started: M2 Decision Review, M3 Directed Build |
| P5 | Customization | Not started: scenario builder, local norms, outcome tracking, IRT |
| P6 | Scale and compliance | Not started: multi-tenancy, SSO, ATS, compliance kit |

## Next steps

**Owner actions (in order)**

- [ ] Review and merge branch `ccr-327afa78-rdcapg` on GitHub, then sync it to the Macaly project
- [ ] `npx convex env set WORKSPACE_OWNER_EMAIL you@company.com`, then deploy (the schema accepts the existing demo data)
- [ ] Sign up at /recruiter, verify your email, claim the workspace
- [ ] Confirm the three fallback models are served by the Macaly endpoint (or set `JUDGE_PANEL_JSON`)
- [ ] Smoke test: create an invite for yourself → take the assessment → refresh mid-way (the draft should survive) → submit → open the report → override one item → mark the review complete
- [ ] On `/reliability`: run the adversarial suite; on one report, run "Re-grade 5×" and "Run perturbation tests"
- [ ] Delete the demo submission

**Build order after that**

1. P2 data: collect 30–50 human-graded reviews (two graders each where possible), run the golden set, set a baseline, then calibrate weights and bands.
2. P3 depth: follow-up scoring, candidate report and appeals, 2–3 more scenarios with variants and levels.
3. P4 breadth: Decision Review module first, then Directed Build.

**Open decisions** (spec §29)

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

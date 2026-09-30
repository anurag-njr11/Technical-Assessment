# ReviewBench — Progress Report

Sep 30, 2026 · @Ace

## Summary

Phase P0 (MVP slice) is complete: the Code Review module runs end to end in the cloud, graded by a three-judge council and verified by 24 automated tests. It is **not yet safe for real candidates**; seven Phase P1 items must land first.

- **Live:** candidate flow, grading engine, recruiter sign-in, dashboard, evidence-backed reports, team invites.
- **Verified:** 24/24 tests passing, one live grading run with real models, browser QA of the candidate flow.
- **Blocking real use:** open assessment link with no rate limit, no autosave, unenforced timer, no human-review workflow, reduced judge diversity on fallback.
- **Not started:** golden set and accuracy metrics, bias audits, RAG, Decision Review and Directed Build modules.

Requirement IDs refer to *ReviewBench — Product & Technical Specification* (REVIEWBENCH\_SPEC.md, v0.3).

## Completed

Thirty-plus spec requirements are implemented across five areas, all committed to the Macaly-hosted git repo.

| Area | What's built | Spec IDs |
| --- | --- | --- |
| Scenario | Reference scenario ord-482-junior: ticket, 3-file diff, 4 planted issues + 1 decoy, server-only answer key | SC-1 (MVP size), SC-3, SC-4, SC-5, SC-10 |
| Candidate flow | No-account intro, diff viewer with wrapping lines, line comments with severity, verdict, locked review, 3 required follow-ups, timer display, confirmation screen, server input limits | FR-C-1, 2, 4–11, 18 |
| Grading engine | ±3-line matching; 3-judge checklist council (Gemini, Claude, Llama); untrusted-input delimiters; evidence verification; unmatched-comment classification; majority consensus; escalation on splits or low quorum; deterministic 5-component score and bands; model fallback | GR-1–6, GR-8–14, GR-16–21, §11 |
| Recruiter side | Dashboard with live status and stats; candidate report with breakdown, per-item evidence, per-judge votes, escalation banner, follow-up answers, retry | FR-R-1–4, FR-R-7–15 |
| Access and security | Email + password with emailed verification code; password reset; first-verified-account workspace claim; owner invites, revokes, removes; server-side recruiter checks on all protected data; submit returns nothing | SEC-1–13, FR-R-18–19 |

Also delivered: clickable product wireframe (7 screens), research-backed design, the full spec, and a source-code zip with README, .env.example and .gitignore (deploy key excluded).

## Verification

All 24 automated tests pass with a clean typecheck, and one live run with the real judge models produced the expected result.

| Check | Scope | Result |
| --- | --- | --- |
| Access-control tests | 9 tests: anonymous blocked, claim rules, unverified blocked, non-members blocked, invite flow, owner-only actions, member removal | 9/9 pass |
| Grading-pipeline tests | 9 tests with a deterministic fake judge panel: reference outcomes, perfect review, wrong verdict, fabricated evidence, single usable judge, fallback, prompt injection, input validation | 9/9 pass |
| Scenario-integrity tests | 6 tests: no answer-key imports or text in browser code, key lines visible, hallucinated helper absent, decoy justified | 6/6 pass |
| Live grading run | Priya's review graded by real Gemini, Claude and Llama judges | 57, Borderline, correctly escalated a vague comment |
| Browser QA | Candidate flow driven on the cloud preview, stopped before submit | Passed after one fix |
| Visual QA | Vision-model check of 6 screenshots | 1 defect found and fixed |

**Defects found by testing:**

- **Fixed:** the SQL injection line (the critical planted issue) was clipped at the diff edge. Lines now wrap; confirmed no line overflows.
- **Fixed:** the answer-key leak test flagged a comment, not an import. Test now matches real imports only.
- **Open:** clicking Start review before the page hydrates does nothing (see Needs fixing).

## Needs fixing

Twelve known gaps; the first seven block use with real candidates.

| # | Priority | Issue | Impact | Fix | Spec ID |
| --- | --- | --- | --- | --- | --- |
| 1 | Blocker | Workspace not yet claimed | Whoever signs up first becomes owner | Owner signs up and claims now | SEC-5 |
| 2 | Blocker | Assessment link open to anyone, unlimited submissions | Spam; 12–20 paid AI calls per submission | Single-use invite links + rate limits | FR-C-12, SEC-15 |
| 3 | Blocker | No autosave | Refresh loses all comments | Autosave draft server-side | FR-C-13 |
| 4 | Blocker | Timer is display-only | Time limit not enforced | Server-side deadline + grace period | FR-C-14 |
| 5 | Blocker | Clicks before hydration do nothing | Candidates on slow connections stall | Disable controls until ready | FR-C-15 |
| 6 | Blocker | Escalations have no workflow | "Needs review" is a label only | Review queue with audited overrides | HR-1–4 |
| 7 | Blocker | Fallback models can duplicate a family (Llama → Gemini) | Council diversity collapses | Fallbacks from families not on the panel | GR-7 |
| 8 | High | Vague comments show as "undetermined" | Unclear escalation reason | Add vague\_match label | GR-15 |
| 9 | High | Weights and bands uncalibrated | Scores not yet valid for decisions | Calibrate on golden set | §11.2, REL-1 |
| 10 | High | Real-model testing limited to one run | Injection resistance unproven | Real-model and adversarial suite | REL-10 |
| 11 | Medium | Result stored without schema | Malformed results undetected | Validated result schema | NFR-DATA-1 |
| 12 | Low | Demo submission in database; mobile layout unchecked | Clutter; unknown mobile UX | Delete demo; mobile QA | NFR-UX-2 |

## Remaining

One of six problem-statement objectives is substantially met; the other five are partial or not started.

**Against the original problem statement**

| Objective | Status | What's missing |
| --- | --- | --- |
| 1. Evaluation pipeline | Built (M1 only) | M2 and M3 modules; queueing, caching, cascade routing at scale |
| 2. Evaluation methodology | Partial | Rubrics built as checklists; adherence not yet measured; no bias audits (FB-1–6) |
| 3. Knowledge alignment | Not started | RAG with graded examples (KA-1–4); fine-tuned judge (KA-5–7) |
| 4. Benchmarking and QA | Partial | Unit tests only; no golden set, kappa, retest or regression gate (REL-1–9) |
| 5. Experimental framework | Not started | Versioning, tracing, shadow mode (EX-1–5) |
| 6. Transparency and trust | Partial | Recruiter reports built; no candidate report, appeals or technical manual (TR-4–6) |
| Directing and collaborating with AI | Not started | Decision Review (M2) and Directed Build (M3) |

**By roadmap phase**

| Phase | Theme | Status |
| --- | --- | --- |
| P0 | MVP slice | Done |
| P1 | Safe to use | Not started — the 7 blockers above |
| P2 | Trustworthy | Not started — golden set, reliability dashboard, bias and injection tests, calibration |
| P3 | Complete M1 | Not started — follow-up scoring, candidate reports, appeals, more scenarios and levels |
| P4 | New modules | Not started — M2 Decision Review, M3 Directed Build |
| P5 | Customization | Not started — scenario builder, local norms, outcome tracking, IRT |
| P6 | Scale and compliance | Not started — multi-tenancy, SSO, ATS, compliance kit |

Platform note: code lives in Macaly's git repo, not GitHub. A snapshot zip exists; syncing to GitHub is manual.

## Next steps

Claim the workspace today, then complete Phase P1 in one focused build session before inviting any real candidate.

**Owner actions**

- [ ] Sign up at /recruiter, verify email, claim the workspace
- [ ] Download the source zip, push to a private GitHub repo, then ask for the download link to be deleted
- [ ] Review the demo report, then delete the demo submission

**Build order**

1. P1 blockers: invite links + rate limits, autosave, enforced timer, hydration fix, review queue, judge-diversity fix.
2. P2 trust: collect 30–50 human-graded reviews, build the agreement dashboard, run perturbation and injection tests on real models, calibrate weights.
3. P3 depth: follow-up scoring, candidate report and appeals, 2–3 more scenarios with variants and levels.
4. P4 breadth: Decision Review module first (no codebase needed), then Directed Build.

**Open decisions** (spec §29)

- Should follow-up answers count toward the score?
- Should candidates see their detailed report by default?
- Which model providers meet the no-training-on-inputs requirement for production?

## Work log

### 30 Sep 2026 · Checkpoint 1: P1 backend and P2 engine

Scope agreed with the owner: all P1 blockers, the remaining known gaps, and the P2 reliability tooling. Delivery is the GitHub branch `ccr-327afa78-rdcapg`; syncing to Macaly and deploying is done by the owner.

- **Backend built:** single-use invite tokens and rate limits (FR-C-12, SEC-15); server-side autosave with review lock (FR-C-13, FR-C-8); enforced deadline with auto-submit (FR-C-14); extra-time accommodations (FR-C-16); human review queue with audited overrides, deterministic recompute and golden-set feed (HR-1–4); family-distinct judge fallbacks (GR-7); `vague_match` label (GR-15); validated result schema (NFR-DATA-1); judge-call tracing (EX-2); anonymization (FB-1); golden-set labels, test–retest, perturbation, adversarial and golden-set regression runs, and a reliability dashboard query (REL-1–10, FB-2).
- **Tests:** 64/64 passing (was 24), typecheck clean for the backend.
- **Next:** frontend for the above, then a full rewrite of this report.


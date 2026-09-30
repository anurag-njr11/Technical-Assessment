# ReviewBench — Product & Technical Specification

> **Status:** Living spec · v0.6 · 30 Sep 2026 (AI-native assessment flow: recruiter assessments with link/QR, AI PR review with an interactive agent, live Directed Build assistant, trajectory judge council, evidence-first recruiter views. P1–P6 at demo/pilot depth; deferred work in `LATER.md`; see Progress Report)
> **Purpose:** Single source of truth for spec-driven development. Every feature, rule, and threshold the system implements should trace back to a requirement ID in this document (`FR-`, `NFR-`, `GR-`, `AC-`, etc.). When the code and this spec disagree, one of them is a bug — fix whichever is wrong and update the other.
> **Companion document:** *ReviewBench — Progress Report* (what is built vs. remaining, keyed to the IDs below).

> **Implementation note (v0.5).** Requirements marked *(Planned)* below that are now built: SCR-1, SCR-2 (reported, not yet weighted), SCR-3 (Rasch/1PL), SCR-5, TR-2, TR-4, TR-5, TR-6 (summary page), FR-R-16, FR-R-17 (print to PDF), SB-3, SB-4, CU-1, CU-2, CU-3, CU-6, CU-7, CU-8/FB-6, FB-3, EX-5, KA-1/KA-2 (lexical retrieval behind `RAG_EXAMPLES=on`), CO-1/CO-3 (audit pack export, notice template), M2 Decision Review, M3 Directed Build (pilot: scripted assistant, server-side trajectory, signature-based fault checks). Still deferred: SEC-4 SSO, multi-tenancy, ATS webhooks, KA-5–7 fine-tuning, EX-3 shadow mode, SB-1/SB-2 generated scenarios, CU-4/CU-5, SC-7 variants, SCR-4 equating.

> **Implementation note (v0.6).** New in this version and built: recruiter **assessments** with a reusable link and QR code (§15.6, FR-R-20–27); the flagship **AI PR review with the agent** (§7.4, PR-1–5, FR-C-19–24); a **live LLM assistant** for M3 with planted faults still scripted (§7.3, AS-1–6); the **trajectory council** (§10.8, TJ-1–12) and trajectory dimensions (§11.4); and **evidence-first** recruiter views with candidate comparison (§15.6). The product framing is now: *ReviewBench doesn't ask whether you can write code without AI. It evaluates whether you can effectively work with AI to produce reliable engineering work.*

---

## Table of contents

1. [Overview](#1-overview)
2. [Problem statement](#2-problem-statement)
3. [Goals, non-goals, and success metrics](#3-goals-non-goals-and-success-metrics)
4. [Users and personas](#4-users-and-personas)
5. [Glossary](#5-glossary)
6. [Design principles](#6-design-principles)
7. [Product structure: assessment modules](#7-product-structure-assessment-modules)
8. [Scenario specification](#8-scenario-specification)
9. [Candidate experience requirements](#9-candidate-experience-requirements)
10. [Grading engine specification](#10-grading-engine-specification)
11. [Scoring model](#11-scoring-model)
12. [Knowledge alignment (RAG and fine-tuning)](#12-knowledge-alignment-rag-and-fine-tuning)
13. [Reliability, benchmarking, and regression](#13-reliability-benchmarking-and-regression)
14. [Fairness and bias auditing](#14-fairness-and-bias-auditing)
15. [Recruiter and admin experience](#15-recruiter-and-admin-experience)
16. [Access control and security](#16-access-control-and-security)
17. [Transparency, reporting, and appeals](#17-transparency-reporting-and-appeals)
18. [Customization](#18-customization)
19. [Experimentation framework](#19-experimentation-framework)
20. [Compliance](#20-compliance)
21. [System architecture](#21-system-architecture)
22. [Data model](#22-data-model)
23. [Backend API surface](#23-backend-api-surface)
24. [Non-functional requirements](#24-non-functional-requirements)
25. [Model strategy and cost](#25-model-strategy-and-cost)
26. [Testing strategy](#26-testing-strategy)
27. [Roadmap and phases](#27-roadmap-and-phases)
28. [Risks and mitigations](#28-risks-and-mitigations)
29. [Open questions](#29-open-questions)
30. [Research basis](#30-research-basis)

---

## 1. Overview

**ReviewBench** is a technical assessment platform that measures how well software engineers work with AI. It doesn't ask whether you can write code without AI; it evaluates whether you can **evaluate, challenge, verify, and direct AI-generated engineering work** to produce reliable results.

The core flow:

```
Recruiter    Sign in → pick role + module → Create assessment → link / QR code
Candidate    Open link → Start → review the AI's PR + rationale and question the agent
             (or build with the AI assistant) → test / verify → Submit
ReviewBench  Record the trajectory → judge council → evidence verification → deterministic scoring
Recruiter    Candidates per assessment → compare → evidence-first report → human review
```

The core mechanism:

1. The candidate works with an artifact produced by an "AI agent" (a pull request with the agent's rationale and assumptions, an architecture decision, or a live AI session) and can interrogate the agent. Every prompt, response and decision is recorded as a **trajectory**.
2. The artifact contains **planted, known flaws** and **decoys** (suspicious-looking but correct code), defined in a hidden **answer key**.
3. A **council of three independent AI judges** from different model families answers narrow yes/no checklist questions about each candidate comment.
4. Every positive judge vote must **quote the candidate's own words**; fabricated evidence is discarded in code.
5. **Deterministic code** — not an LLM — computes the final score from verified outcomes.
6. Disagreements on serious items **escalate to a human**.
7. Hiring teams receive an **evidence-backed report** showing exactly why each score was given: dimension scores, judge findings with quoted evidence, judge disagreements, and the full candidate–AI interaction.

---

## 2. Problem statement

AI-assisted development has made traditional deterministic assessments (fixed test cases, pass/fail) inadequate. They cannot capture whether a developer can **direct, collaborate with, and validate** AI tools and autonomous agents.

Hiring teams need an evaluation framework that:

- Measures developer capability in AI-assisted workflows.
- Uses a **council of LLMs** to assess open-ended work while remaining:
  - **Consistent and scalable** — reliable across hundreds of thousands of assessments.
  - **Fair and defensible** — auditable, unbiased, trustworthy to candidates and employers.
  - **Rule-adherent** — minimal hallucination and reasoning drift; strict rubric compliance.
- Covers the full lifecycle: evaluation pipeline, methodology, knowledge alignment, benchmarking, experimentation, and transparency.

### 2.1 Why existing approaches fall short

| Approach | Shortcoming |
|---|---|
| Deterministic tests only | Cannot evaluate judgment, communication, or AI oversight |
| Build-with-AI tasks judged holistically | AI makes different (or no) mistakes per candidate → results not comparable |
| Single LLM giving a 1–10 score | Sensitive to prompt wording, position and verbosity bias, no audit trail |
| Detecting AI use after the fact | Unreliable; penalizes a skill employers now want |

### 2.2 ReviewBench's answer

Standardize the evidence (every candidate sees the same planted flaws), decompose judgment into narrow verifiable questions, verify every claim in code, and measure the evaluator itself against human graders.

---

## 3. Goals, non-goals, and success metrics

### 3.1 Goals

| ID | Goal |
|---|---|
| G-1 | Measure the ability to **validate** AI output (code and decisions). |
| G-2 | Measure the ability to **direct and collaborate** with AI in real time. |
| G-3 | Produce **comparable** results: identical evidence for every candidate at a given scenario version. |
| G-4 | Produce **defensible** results: every score traceable to candidate words and answer-key entries. |
| G-5 | Measure and continuously prove the evaluator's **reliability and fairness**. |
| G-6 | Let companies **customize** assessments to role, level, and stack within validated guardrails. |
| G-7 | Keep candidate tasks **short** (≤ 45 minutes per module). |
| G-8 | Measure **how** candidates work with AI (verification, challenge, trust calibration, instruction quality, efficiency), not only which planted bugs they find. |
| G-9 | Keep the candidate surface free of evaluation machinery: no judges, scores, planted issues or answer keys are visible to candidates. |

### 3.2 Non-goals (current phase)

- Proctoring, webcam monitoring, or covert-AI detection (integrity is achieved by design; see §16.5).
- Live, synchronous interviews.
- Making the final hiring decision. ReviewBench **informs** human decisions; it never auto-rejects.
- Multi-language scenarios beyond Python (later phase).

### 3.3 Success metrics

| ID | Metric | Target |
|---|---|---|
| SM-1 | Agreement with expert human graders (quadratic weighted kappa, per checklist item) | ≥ 0.70 |
| SM-2 | Test–retest stability (same submission graded 5×, score std. dev.) | ≤ 2 points |
| SM-3 | Evidence validity rate (positive votes whose quote exists verbatim) | ≥ 98% |
| SM-4 | Auto-resolution rate (submissions not needing human review) | 85–95% |
| SM-5 | Perturbation stability (score change under irrelevant edits) | ≤ 3 points |
| SM-6 | Adverse impact ratio across groups (four-fifths rule) | ≥ 0.80 |
| SM-7 | Candidate completion rate | ≥ 85% |
| SM-8 | Grading latency (submit → report) | p95 ≤ 3 min |

---

## 4. Users and personas

| Persona | Needs | Primary surfaces |
|---|---|---|
| **Candidate** | Clear task, fair evaluation, no account friction, feedback | `/a/$token` (assessment link), `/assess` |
| **Recruiter** | Create assessments, fast triage, compare candidates, trustworthy scores, clear escalations | `/recruiter`, `/assessment`, `/report` |
| **Hiring manager** | Evidence of judgment, interview guidance | `/report` |
| **Workspace owner** | Control who sees results; manage team | Team panel |
| **Assessment designer** (future) | Build and calibrate scenarios | Scenario builder |
| **Human reviewer** (future) | Resolve escalations, override with justification | Review queue |
| **Auditor / compliance** (future) | Export bias audits and methodology | Compliance kit |

---

## 5. Glossary

| Term | Definition |
|---|---|
| **Scenario** | A self-contained assessment task: ticket + artifact (e.g., PR diff) + follow-up questions. Versioned. |
| **Answer key** | Server-only list of planted issues and decoys for a scenario, with locations, severities, and weights. |
| **Planted issue** | A known, deliberate flaw inserted into the AI artifact (e.g., SQL injection). |
| **Decoy** | Code or reasoning that looks suspicious but is correct and required. Flagging it is a false alarm. |
| **Judge** | One LLM answering checklist questions. |
| **Council** | Three judges from different model families, voting independently. |
| **Checklist question** | A narrow yes/no question about one comment and one answer-key item. |
| **Evidence** | A verbatim quote from the candidate's comment that supports a positive vote. |
| **Valid vote** | A parseable vote whose evidence (if positive) exists verbatim in the comment. |
| **Consensus** | Majority of valid votes, requiring ≥ 2 valid votes. |
| **Escalation** | Routing a submission to human review due to disagreement or low quorum on a serious item. |
| **Band** | Human-readable score category (Strong / Meets bar / Borderline / Below bar). |
| **Golden set** | Human-graded submissions used to measure judge accuracy. |
| **Perturbation test** | Re-grading after an irrelevant change (name swap, formatting) to detect bias. |
| **Assessment** | A recruiter-created configuration (role, module, level, time limit, AI-assisted) with one reusable link / QR code. Each person who opens it becomes a candidate with their own token. |
| **Agent notes** | The AI agent's decision rationale and stated assumptions shown alongside an AI PR. Some assumptions are deliberately wrong and map to answer-key items. |
| **Trajectory** | The recorded sequence of candidate–AI events: prompts, AI responses (with token usage), accept/dismiss, manual code edits, test runs. |
| **Trajectory council** | The three-judge panel answering yes/no questions about a trajectory, citing event IDs as evidence (§10.8). |
| **Dimension** | One of nine reported evaluation dimensions (§11.4), each 0–100 with the signals behind it. |

---

## 6. Design principles

| ID | Principle | Consequence |
|---|---|---|
| DP-1 | **LLMs answer narrow questions; code computes scores.** | No holistic LLM scores anywhere in the pipeline. |
| DP-2 | **Standardize the evidence.** | Faults are planted by script, never left to AI chance. |
| DP-3 | **Verify, don't trust.** | Every positive vote must cite verbatim evidence, checked in code. |
| DP-4 | **Diversity reduces correlated error.** | Judges come from different model families, including fallbacks. |
| DP-5 | **Uncertainty goes to humans, not guesses.** | Splits and low quorum escalate; no silent coin-flips. |
| DP-6 | **Measure the measurer.** | Accuracy vs. humans is tracked continuously, not assumed. |
| DP-7 | **Candidate content is untrusted data.** | Delimited in prompts; injection attempts earn nothing. |
| DP-8 | **Simple surface, rigorous core.** | Candidate UI stays minimal; complexity lives in calibration and grading. |
| DP-9 | **Humans decide.** | The system recommends and explains; it never auto-rejects. |
| DP-10 | **Quality over quantity of AI use.** | Never reward fewer tokens or more questions per se; efficiency is outcomes per token (§11.4). |

---

## 7. Product structure: assessment modules

The platform is three modules sharing one evaluation engine. Each module covers one verb from the problem statement.

| Module | Verb | Candidate task | Typical level | Duration |
|---|---|---|---|---|
| **M1 · Code Review** | Validate | Review an AI-written PR with planted bugs | Junior–Mid | 25–40 min |
| **M2 · Decision Review** | Validate (judgment) | Critique an AI-written architecture decision (ADR) with planted reasoning flaws | Mid–Staff | 15–25 min |
| **M3 · Directed Build** | Direct & collaborate | Build a feature with a live AI assistant whose responses contain scripted faults | All | 30–60 min |

**Flagship (v0.6):** M1 is delivered as **AI PR review with the agent** (§7.4): the PR plus the agent's rationale and assumptions, and a chat to challenge the agent. M2 and M3 remain available.

Companies assemble **batteries** per role (e.g., Junior Backend = M1 short + M2 short). Total candidate time per battery: ≤ 60 minutes (NFR-UX-1).

### 7.1 M1 · Code Review (MVP module)

- Candidate reads a ticket, reviews a PR diff (≈150–250 changed lines), leaves line comments with severity, chooses a verdict, and answers 3 follow-up questions.
- PR size is bounded by code-review research: effective review rate < 400 LOC/hour; effectiveness drops after ~60 minutes.

### 7.2 M2 · Decision Review

- Candidate receives a short, self-contained brief (context, constraints, an AI agent's recommendation, e.g., "switch Postgres → MongoDB").
- Planted reasoning flaws: unstated assumptions, ignored constraints, benchmark mismatch, missing operational/maintenance cost, missing migration plan.
- Decoys: sound recommendations a junior might reflexively reject.
- Candidate writes a structured critique: approve/reject, flawed assumptions, trade-offs, alternative.
- Graded with the same council and checklist mechanism, anchored to the answer key of reasoning flaws.

### 7.3 M3 · Directed Build

- Candidate completes a ticket in a browser workspace laid out as **Task → Code editor → AI assistant → Tests → Submit**, using an AI assistant routed through a **ReviewBench proxy** (`builds.ask`).
- The assistant is a **live LLM** (`ASSISTANT_MODEL`); prompts that match a scripted fault intent receive the scripted faulty reply instead, so every candidate faces identical faults (AS-1–6). Without an LLM key the assistant is fully scripted.
- ~70–80% of AI responses remain correct; ~20–30% carry planted faults, so the test rewards **calibrated trust**, not blanket distrust.
- Full session recorded as a **trajectory** (see §10.7).
- Scored on: faults caught (deterministic, via hidden tests/signatures), how they were caught (council), quality of instructions given to the AI, delegation judgment.
- Unexposed faults (candidate never asked the AI about that area) are marked **not exposed** and excluded, not penalized.
- Scenarios: `disc-12-build` (DISC-12 discount codes: `>= 50` threshold, hallucinated `cart.getSubtotalAfterTax()`, case-sensitive codes) and `orders-api-build` (ORD-519 order search, Backend Mid, 35 min: F1 SQL injection, F2 missing ownership filter, F3 hallucinated `db.queryParams()`, F4 no `LIMIT`).
- Visible tests cover only what the ticket states. They never test a planted fault the ticket does not describe (e.g., ownership or injection in ORD-519), because spotting it is the assessment.

| ID | Requirement |
|---|---|
| AS-1 | The assistant runs server-side as an action; the candidate's name and email are never sent to the model. |
| AS-2 | Planted faults are deterministic: scripted intents with a fault return the scripted faulty code and record `fault_injected`. |
| AS-3 | Any model failure (or no key) falls back to the scripted reply; the candidate never sees a grading-related error. |
| AS-4 | Every `ai_response` records token usage (`usage` from the provider, or chars/4 on fallback). |
| AS-5 | Per-candidate limits: 120 asks/hour, 2,000-char prompts, 400 events, 800 KB of events. |
| AS-6 | Manual edits are recorded as `code_edit` snapshots (≤ 4,000 chars) after 3 s of idle typing. |

### 7.4 AI PR review with the agent (flagship)

- The candidate sees an AI-generated PR (code scenarios `pay-217-mid`, `ord-482-junior`) plus **"The AI agent's notes"**: its decision rationale and a list of stated assumptions.
- Some assumptions are deliberately wrong (e.g., "gateway.refund() is the SDK's refund method", "callers are already authorized upstream", "logging the full card number is fine because logs are internal"); the last one in each scenario is correct and maps to the decoy.
- The candidate can **question the agent** in an "Ask the agent" chat. The model role-plays the PR's author: it defends its choices plausibly, concedes only to a concrete and correct technical challenge, and never volunteers its own flaws.
- The candidate then leaves line comments, chooses approve / request changes, and answers the follow-ups, as in M1.
- Graded twice: the M1 council for issue detection (§10.2–10.6), and the trajectory council for how they worked with the agent (§10.8).

| ID | Requirement |
|---|---|
| PR-1 | Candidate-visible `rationale` and `assumptions[]` live in the public scenario; the mapping of each assumption to an answer-key item (`ASSUMPTION_KEYS`: `{ flawed, itemId }`) is server-only. |
| PR-2 | Each flawed assumption maps to a planted issue; each sound assumption maps to a decoy (enforced by test). |
| PR-3 | Each assumption has a "Question this" action that pre-fills the chat. |
| PR-4 | Chat events are stored in the autosave draft and copied to `submission.build.events` (`code: ""`) on submit and auto-close. |
| PR-5 | No fault injection in PR review: the flaws are already in the PR and the notes. |

---

## 8. Scenario specification

### 8.1 Scenario package

Every scenario is a versioned package:

| Part | Visibility | Description |
|---|---|---|
| `scenario` (public) | Candidate | Ticket, criteria, files/diff, follow-up questions |
| `answerKey` (private) | Server + recruiters only | Planted issues, decoys, expected verdict |
| `metadata` | Admin | Level, stack, domain, difficulty estimates, version, calibration data |

### 8.2 Public scenario schema

```ts
type Scenario = {
  id: string                // e.g. "ord-482-junior"
  version: number
  ticketId: string          // e.g. "ORD-482"
  title: string
  role: string              // e.g. "Backend Engineer"
  level: "Junior" | "Mid" | "Senior" | "Staff"
  stack: string             // e.g. "Python / Flask"
  minutes: number
  summary: string
  criteria: string[]        // acceptance criteria
  files: Array<{
    path: string
    added: number
    removed: number
    lines: Array<{ n: number; kind: "add" | "ctx" | "del"; code: string }>
  }>
  followUps: string[]
}
```

### 8.3 Answer key schema

```ts
type KeyItem = {
  id: string                          // "I1".."In", "D1".."Dn"
  kind: "issue" | "decoy"
  title: string
  category: "Hallucination" | "Correctness" | "Security" | "Edge cases"
          | "Performance" | "Test quality" | "Convention" | "Decoy"
  severity: "critical" | "high" | "medium" | "low" | "none"
  weight: number                      // detection points; decoys = 0
  file: string
  lineStart: number
  lineEnd: number
  description: string                 // what is wrong (or why a decoy is correct)
  acceptableFix: string
}

type AnswerKey = {
  scenarioId: string
  expectedVerdict: "approve" | "request_changes"
  items: KeyItem[]
}
```

### 8.4 Fault taxonomy and default weights

| Category | Example | Default severity | Default weight |
|---|---|---|---|
| Hallucination | Calls a helper that doesn't exist | High | 3 |
| Correctness | Off-by-one pagination, missing null check | High | 3 |
| Security | SQL built with string interpolation, missing auth check | Critical | 4 |
| Edge cases | Timezone bug, empty-list crash | Medium | 2 |
| Performance | N+1 query in a loop | Medium | 2 |
| Test quality | Test asserts only status code | Medium | 2 |
| Convention | Bypasses existing validation layer | Low | 1 |

Fault mix should over-represent security and hallucination relative to style, reflecting observed AI failure rates.

### 8.5 Scenario authoring requirements

| ID | Requirement |
|---|---|
| SC-1 | Each scenario contains 5–8 planted issues and 2–3 decoys (MVP scenario: 4 + 1). |
| SC-2 | **Solvability:** every planted issue must be diagnosable from the ticket, provided files, and PR alone. |
| SC-3 | Every answer-key line range must point at lines visible to the candidate (enforced by test). |
| SC-4 | Decoy behavior must be explicitly justified by the ticket (enforced by test). |
| SC-5 | Hallucinated references must be verifiably absent from provided files (enforced by test). |
| SC-6 | Faults are inserted by **scripted mutation** of a clean, correct artifact; a human verifies each. |
| SC-7 | Each issue has 2–3 **variants** (names, files, edge cases) for rotation against leakage. |
| SC-8 | New items start with simulated difficulty estimates; refined by pilot data (IRT). |
| SC-9 | Scenario content is versioned; results always record the scenario version graded against. |
| SC-10 | The answer key must never be importable from browser code (enforced by test). |

### 8.6 Reference scenario (MVP): `ord-482-junior`

Ticket: *Add pagination & date filtering to the Orders API* (Python/Flask, 40 min).

| ID | Kind | Title | Category | Severity | Weight | Location |
|---|---|---|---|---|---|---|
| I1 | issue | Calls `utils.parse_date_safe()`, which does not exist | Hallucination | High | 3 | views.py 20–22 |
| I2 | issue | Pagination offset off by one page | Correctness | High | 3 | views.py 16 |
| I3 | issue | Date filter builds SQL with an f-string | Security | Critical | 4 | views.py 23–24 |
| I4 | issue | New test only asserts the status code | Test quality | Medium | 2 | tests.py 1–3 |
| D1 | decoy | `per_page` capped at 100 (required by ticket) | Decoy | — | 0 | views.py 15 |

Expected verdict: **request changes**. Total detection weight: 12.

---

## 9. Candidate experience requirements

| ID | Requirement |
|---|---|
| FR-C-1 | Candidates take assessments **without creating an account**. |
| FR-C-2 | Intro screen shows ticket, acceptance criteria, estimated time, and a disclosure that the code is AI-written and may contain mistakes. |
| FR-C-3 | *(Superseded by FR-C-12.)* The candidate's name comes from the recruiter-created invite. |
| FR-C-4 | Review screen shows a file list, diff viewer with line numbers and add/context markers, and unchanged files needed for verification. |
| FR-C-5 | Long lines **wrap**; no planted issue may be hidden behind horizontal scrolling. |
| FR-C-6 | Candidate can add a comment on any line with text (≤ 4,000 chars) and severity (critical/high/medium/low); can delete their comments. |
| FR-C-7 | Candidate must choose a verdict (approve / request changes) before continuing. |
| FR-C-8 | Review locks when the candidate moves to follow-up questions. |
| FR-C-9 | Follow-up: 3 written questions, all required. |
| FR-C-10 | A visible countdown timer shows remaining time; turns red under 5 minutes. |
| FR-C-11 | Confirmation screen explains what happens next (automated grading, possible human check, recruiter notification). |
| FR-C-12 | Each candidate receives a **single-use invite link** tied to a recruiter-created candidate record. |
| FR-C-13 | Work **autosaves** server-side; refresh or disconnect does not lose comments. |
| FR-C-14 | Timer is **enforced** server-side; the saved draft auto-submits at the time limit plus a 2-minute grace period (verdict recorded as `none` if never chosen). |
| FR-C-15 | Interactive controls are disabled until the page is hydrated/ready. |
| FR-C-16 | Accessibility accommodations (extended time, 0–120 min) configurable per candidate. |
| FR-C-17 | *(Planned)* Candidate-facing results summary and appeal request (see §17). |
| FR-C-18 | Server limits: ≤ 40 comments, ≤ 10 follow-up answers, text ≤ 4,000 chars. |
| FR-C-19 | Candidates can enter through a recruiter's **assessment link or QR code** (`/a/$token`): role, title, time limit, whether an AI assistant is provided, name (+ optional email), Start. |
| FR-C-20 | Joining creates the candidate's own record and single-use token; the page remembers it (per assessment token) so a refresh resumes rather than re-joins. Closed or unknown links show a plain message. |
| FR-C-21 | The candidate's time limit is the assessment's `minutes` (10–90) when they joined through an assessment. |
| FR-C-22 | Candidate-facing copy never mentions judges, scoring, planted issues, answer keys, trajectories or module codes (M1/M2/M3). Modules are shown as "Code review", "Design review" and "Build with AI". |
| FR-C-23 | The candidate is told that the AI chat is shared with the hiring team. |
| FR-C-24 | The candidate flow has no path to recruiter pages; the done screen has no navigation back into the site. |

---

## 10. Grading engine specification

### 10.1 Pipeline stages

```
Submission
  │
  ├─ Stage 1  Location matching (deterministic)
  ├─ Stage 2  Checklist council (3 judges × each candidate pair)
  ├─ Stage 3  Evidence verification (deterministic)
  ├─ Stage 4  Unmatched-comment classification (council)
  ├─ Stage 5  Consensus + escalation (deterministic)
  ├─ Stage 6  Score computation (deterministic)
  └─ Stage 7  Persist result + audit trail
```

### 10.2 Stage 1 — Location matching

| ID | Rule |
|---|---|
| GR-1 | A comment is **near** a key item if same file and `lineStart − 3 ≤ line ≤ lineEnd + 3`. (`LINE_WINDOW = 3`) |
| GR-2 | Each (comment, nearby item) pair is judged independently; one comment may match multiple items. |

### 10.3 Stage 2 — Checklist council

| ID | Rule |
|---|---|
| GR-3 | Three judges, each from a **different model family**, answer independently at temperature 0. |
| GR-4 | Judges never produce scores; they answer yes/no checklist questions plus an evidence quote. |
| GR-5 | Candidate text is wrapped in `<candidate_comment>` delimiters; the system prompt declares it untrusted and instructs judges to ignore embedded instructions. |
| GR-6 | Judges respond with a single JSON object; unparseable responses are recorded as invalid votes. |
| GR-7 | If a judge's primary model fails, it falls back to a backup model **from a family not already on the panel**. All six models must come from distinct families; this is validated at load time (`validatePanel`). |

**Issue checklist (per issue pair):**

```json
{
  "identifies_issue": boolean,   // same underlying problem, not just same line
  "states_impact": boolean,      // concrete consequence stated
  "proposes_fix": boolean,       // fix consistent with acceptable fix
  "evidence": string             // verbatim 3–20 word quote if identifies_issue
}
```

**Decoy checklist (per decoy pair):**

```json
{ "objects_to_behavior": boolean, "evidence": string }
```

**Classification checklist (unmatched comments):**

```json
{
  "matches_item_id": string | null,
  "classification": "matched" | "valid_extra" | "nitpick" | "false_alarm",
  "evidence": string
}
```

### 10.4 Stage 3 — Evidence verification

| ID | Rule |
|---|---|
| GR-8 | Normalize both strings: lowercase, strip quote characters, collapse whitespace. |
| GR-9 | A **positive** vote is valid only if normalized evidence (≥ 3 chars) is a substring of the normalized comment. |
| GR-10 | Invalid votes are retained in the audit trail with `discardedReason` but excluded from consensus. |
| GR-11 | Classification votes require valid evidence regardless of outcome. |

### 10.5 Stage 4 — Unmatched comments

| ID | Rule |
|---|---|
| GR-12 | Comments with no positive nearby match are classified by the council. |
| GR-13 | If the council majority says a comment matches a known issue elsewhere, that pair is re-judged with the issue checklist. |
| GR-14 | Final classes: `valid_extra` (rewarded in precision; queued for answer-key review), `nitpick` (neutral), `false_alarm` (penalized), `undetermined` (escalated). |
| GR-15 | When classification says "matched" but the issue checklist says "not identified," label as **`vague_match`** with a specific escalation reason instead of `undetermined`. |

### 10.6 Stage 5 — Consensus and escalation

| ID | Rule |
|---|---|
| GR-16 | Consensus = true iff valid votes ≥ 2 **and** yes-votes > half of valid votes. |
| GR-17 | `states_impact` / `proposes_fix` = majority among valid votes that agree with the consensus. |
| GR-18 | An item's outcome uses the **best** pair (a positive consensus from any comment wins). |
| GR-19 | Escalate if, on any critical/high item, valid votes are **split** or **fewer than 2** valid votes exist. |
| GR-20 | Escalate if any comment is `undetermined`. |
| GR-21 | Escalation never changes the score; it flags the result for human review (§15.4). |

### 10.7 Directed Build trajectory format (M3)

```ts
type TrajectoryEvent = {
  id: string
  t: number                            // ms since session start
  type: "ai_prompt" | "ai_response" | "fault_injected" | "code_diff"
      | "test_run" | "terminal_cmd" | "file_open" | "accept_suggestion"
      | "reject_suggestion"
  payload: Record<string, unknown>
}
```

As implemented (`buildEventValidator`):

```ts
type TrajectoryEvent = {
  id: string                           // "e0", "e1", ...
  t: number                            // ms since session start
  type: "ai_prompt" | "ai_response" | "fault_injected" | "accept_suggestion"
      | "reject_suggestion" | "test_run" | "file_open" | "code_edit"
  data?: string                        // prompt text; response JSON {text, code};
                                       // "F1|<responseId>"; accepted response id;
                                       // code snapshot; test summary
  tokens?: { input: number; output: number }   // ai_response only
}
```

Used for both M3 builds and AI PR review chats (`code: ""`). Deterministic signals derived from trajectories: whether fault signatures remain in final code, test runs, correct suggestions used, scenario-specific completion. LLM judges cite **event IDs** as evidence; verification checks the event exists and contains the claimed content (§10.8).

### 10.8 Trajectory council

Runs for M3 builds and for code reviews whose submission has chat events. Implemented in `convex/trajectory.ts` (`gradeTrajectory`).

| ID | Rule |
|---|---|
| TJ-1 | The trajectory is rendered as a numbered, **redacted** transcript (names and emails removed) with event IDs; long code is truncated. A pseudo-event `final` holds the final code (build) or verdict and comments (review). |
| TJ-2 | `fault_injected` events are never shown as transcript events; judges get a grader-only header listing planted defects and assumptions marked wrong/correct. |
| TJ-3 | Each judge answers narrow yes/no questions with JSON `{ decision, evidence, event_ids }`. |
| TJ-4 | Questions: per exposed planted fault (F*n*) "did the candidate notice or question this problem?"; per flawed assumption (A*n*) "did the candidate challenge it with a correct technical reason?"; per sound assumption "did they reject it without basis?"; behaviour questions B1–B11 (verified AI code before accepting, challenged the AI when wrong, blindly accepted faulty output, gave specific instructions, tested, took over manually when appropriate (builds only), flagged a non-issue, recognised security/performance/design problems, asked for justification, prompts purposeful vs. redundant, …). |
| TJ-5 | A vote is **invalid** if it cites an event ID not in the transcript, or its quote is not found in the cited events; invalid votes are kept with `discardedReason`. |
| TJ-6 | Consensus = majority of valid votes with ≥ 2 valid. `agreement` = "yes/valid"; confidence **high** if unanimous with ≥ 3 valid, **medium** if 2/3, else **low**. |
| TJ-7 | A finding **needs review** when votes split or fewer than 2 are valid; each adds a specific reason to `reviewReasons`. |
| TJ-8 | Planted-fault outcomes (F*n*) stay deterministic (fault signature present in final code → missed); judges add *how* it was caught. |
| TJ-9 | Finding kinds: `detected`, `missed`, `false_positive`, `behavior`. Finding IDs: `F<n>` planted faults, `A<n>` assumptions (1-based, scenario order), `B<n>` behaviour. |
| TJ-10 | If every judge fails, the deterministic grade stands, findings keep deterministic outcomes, and the reason "AI judges were unavailable" is added. Grading never throws for this. |
| TJ-11 | Every trajectory judge call is traced like M1 calls (EX-2); `callCount` and `modelsUsed` include them. |
| TJ-12 | For code reviews, the M1 result is kept intact (items, votes, overrides) and the trajectory is attached as `result.trajectory`. |

---

## 11. Scoring model

### 11.1 Components (M1)

| Component | Definition | Weight |
|---|---|---|
| **Detection** | Σ weights of found issues ÷ Σ weights of all issues | 0.45 |
| **Precision** | valid comments ÷ (valid + false-alarm comments); nitpicks excluded | 0.20 |
| **Decoy discipline** | decoys left alone ÷ total decoys | 0.10 |
| **Explanation quality** | mean over found issues of (impact + fix) ÷ 2 | 0.15 |
| **Verdict** | 1 if verdict equals expected verdict, else 0 | 0.10 |

```
overall = round(100 × Σ weight_i × component_i)
```

Edge cases: no comments → precision 0; comments but none valid or false → precision 1; no found issues → explanation 0.

### 11.2 Bands

| Band | Score |
|---|---|
| Strong | ≥ 80 |
| Meets bar | 60–79 |
| Borderline | 50–59 |
| Below bar | < 50 |

> ⚠️ **Weights and band thresholds are provisional.** They must be calibrated against the golden set (§13) before results are used for hiring decisions (AC-REL-1).

### 11.3 Planned scoring evolution

| ID | Change |
|---|---|
| SCR-1 | Score follow-up answers with the same checklist approach (reasoning about missed issues, test plans, instruction quality). |
| SCR-2 | Add communication checklist items: specific, actionable, constructive. |
| SCR-3 | Replace raw percentage with an **IRT ability estimate** and standard error; report as a score band with confidence interval. |
| SCR-4 | Enable test equating across scenario variants. |
| SCR-5 | Local norms: percentile vs. the company's own engineers. |

### 11.4 Trajectory dimensions (v0.6)

Reported on every trajectory-graded result as `result.trajectory.dimensions`, each 0–100 with a `detail` string listing the signals behind it. A dimension with no usable signal is omitted (e.g., challengeAssumptions for builds).

| Key | Label | Signals (deterministic + judged) |
|---|---|---|
| issueDetection | Issue detection | Detection component (M1 or build faults); F-findings |
| engineeringJudgment | Technical/engineering judgment | Verdict or completion; decoys left alone; judged design/security/performance recognition |
| reasoning | Reasoning & evidence-seeking | Judged: asked for justification, verified claims |
| trustCalibration | AI trust calibration | Correct suggestions used; judged: blind acceptance (negative), challenged when wrong |
| promptQuality | Prompt quality | Prompt-specificity heuristic; judged: specific instructions |
| interactionQuality | AI interaction quality | Judged: useful questions, purposeful prompts |
| verification | Verification/validation | Test runs (build) or follow-up answer quality (review); judged: verified before accepting |
| efficiency | Token usage & efficiency | `min(1, outcomes × 4000 / tokens)`; outcomes = issues found + flawed assumptions correctly challenged; falls back to outcomes per prompt without token data; **zero outcomes scores 0**. Detail starts with raw totals (tokens in/out, prompts). |
| challengeAssumptions | Challenging incorrect AI assumptions | A-findings (flawed assumptions challenged; sound ones not rejected) |

The exact signal-to-dimension mapping is documented in a comment in `convex/trajectory.ts`.

**Overall (judged runs):** `overall = round(0.5 × base.overall + 0.5 × mean(dimensions except issueDetection))`, where `base` is the M1 score (review) or the deterministic build grade (M3). The band is recomputed. When every judge failed, the base overall stands. Human overrides (§15.4) recompute the base and re-apply the same blend (`blendOverall` in `convex/scoring.ts`).

> ⚠️ The 50/50 blend and the efficiency constant (4000 tokens per outcome) are provisional and must be calibrated with the golden set before hiring use (AC-REL-1).

---

## 12. Knowledge alignment (RAG and fine-tuning)

### 12.1 RAG (phase 2)

| ID | Requirement |
|---|---|
| KA-1 | Store rubric definitions, anchor examples, and human-graded snippets with embeddings (pgvector or equivalent). |
| KA-2 | For each checklist question, retrieve the item definition plus 2–3 most similar human-graded examples and inject as few-shot calibration. |
| KA-3 | Rubrics include worked examples; complexity is minimized (research shows examples raise agreement, complexity lowers it). |
| KA-4 | Retrieved examples are versioned; results record which example set was used. |

### 12.2 Fine-tuning (phase 3, after ≥ 500 human-verified labels)

| ID | Requirement |
|---|---|
| KA-5 | QLoRA a 7–8B open-weight model on council consensus corrected by humans. |
| KA-6 | Fine-tuned model serves as a cheap first-pass judge in a cascade; full council runs on borderline/high-stakes cases. |
| KA-7 | A fine-tuned judge must meet SM-1 on the golden set before deployment. |

---

## 13. Reliability, benchmarking, and regression

| ID | Requirement |
|---|---|
| REL-1 | **Golden set:** 150–300 submissions (MVP: 30–50), each graded by ≥ 2 humans, spanning weak → strong, including tricky cases. |
| REL-2 | Metrics per checklist item: quadratic weighted kappa vs. humans; per-stage accuracy (matching, classification, explanation). |
| REL-3 | **Test–retest:** each golden submission graded 5×; report score variance. |
| REL-4 | **Inter-judge agreement** within the council, per item and per model. |
| REL-5 | **Evidence validity rate** tracked per model. |
| REL-6 | Consistency alone is never accepted as proof of validity (a consistently biased judge is still wrong). |
| REL-7 | **Regression gate:** any change to prompts, rubric, models, or weights re-runs the golden set in CI; blocked if kappa drops or variance rises beyond thresholds. |
| REL-8 | **Reliability dashboard** shows all of the above with confidence intervals. |
| REL-9 | Every result records rubric version, prompt version, model IDs actually used, and scenario version. |
| REL-10 | Real-model test suite (not only mocked judges), including adversarial/prompt-injection comments. |

---

## 14. Fairness and bias auditing

| ID | Requirement |
|---|---|
| FB-1 | **Anonymization** before grading: judges never see candidate names or identifying data. |
| FB-2 | **Perturbation tests:** swap candidate names across perceived gender/ethnicity, rewrite comments in non-native English, change verbosity, reformat, shuffle comment order, inject prompt-injection strings. Score change must meet SM-5. |
| FB-3 | **Adverse impact monitoring:** four-fifths rule with intersectional analysis where demographic data is lawfully available and consented. |
| FB-4 | **Differential item functioning (DIF):** items that behave differently across groups at equal ability are flagged and removed or revised. |
| FB-5 | Per-company fairness dashboard for their own pipeline, with alerts. |
| FB-6 | Custom configurations trigger an automatic adverse-impact check before saving. |

---

## 15. Recruiter and admin experience

### 15.1 Dashboard (`/recruiter`)

| ID | Requirement |
|---|---|
| FR-R-1 | List submissions (newest first, up to 100) with candidate, level, score band, issues found, status, submitted time. |
| FR-R-2 | Summary stats: submitted, graded, flagged for human review. |
| FR-R-3 | Status indicators: grading (live), graded, error, needs review. |
| FR-R-4 | Real-time updates as grading completes. |
| FR-R-5 | Filter by status and search by candidate *(role/level/date filters pending: one scenario today)*. |
| FR-R-6 | Create candidates and copy invite links (pairs with FR-C-12). Email delivery is manual for now. |

### 15.2 Candidate report (`/report?id=`)

| ID | Requirement |
|---|---|
| FR-R-7 | Header: candidate, level, time, verdict, overall score, band, confidence indicator. |
| FR-R-8 | Escalation banner listing specific review reasons. |
| FR-R-9 | Score breakdown per component with weight, detail, and bar. |
| FR-R-10 | Per-item table: title, category, severity, outcome, explanation score, split flag, discarded-vote count, the candidate's matching comment. |
| FR-R-11 | Expandable per-judge votes: model, decision, evidence quote, discard reason. |
| FR-R-12 | Other comments section with classification and votes. |
| FR-R-13 | Follow-up answers shown (currently unscored). |
| FR-R-14 | Judge panel listing with evidence-verification explanation. |
| FR-R-15 | Retry grading on error. |
| FR-R-16 | *(Planned)* Suggested structured interview questions targeting gaps. |
| FR-R-17 | *(Planned)* PDF export. |

### 15.3 Team management

| ID | Requirement |
|---|---|
| FR-R-18 | Owner sees members and pending invites; can invite by email, revoke invites, remove members. |
| FR-R-19 | Non-owners see the member list only. |

> The team panel and single-use candidate invites now sit in a collapsed section at the bottom of the dashboard; assessments (§15.6) are the primary way to invite candidates.

### 15.4 Human review queue

| ID | Requirement |
|---|---|
| HR-1 | Escalated submissions appear in a queue with the specific items needing review. |
| HR-2 | Reviewer can confirm or override an item outcome with a required written justification. |
| HR-3 | Overrides are audited (who, when, before/after, reason) and recomputed deterministically. |
| HR-4 | Resolved items feed the golden set as new labeled data. |

### 15.5 Scenario builder *(planned)*

| ID | Requirement |
|---|---|
| SB-1 | Choose stack, domain, level, and category emphasis. |
| SB-2 | LLM generates a clean artifact; scripted mutations insert issues from the library; human verifies. |
| SB-3 | Show per-item detection rate and calibrated difficulty. |
| SB-4 | Enable/disable items within validated guardrails. |

### 15.6 Assessments, candidate comparison and evidence-first reports (v0.6)

| ID | Requirement |
|---|---|
| FR-R-20 | The dashboard leads with **Create assessment**: role (AI Engineer, Software Engineer, Backend Engineer, ML Engineer, Full-Stack Engineer), module, level (Junior/Mid/Senior), time limit (10–90 min), AI-assisted (code review and build modules; not decision review). Default module: `pay-217-mid`. |
| FR-R-21 | Creating an assessment returns a reusable link `/a/<token>` (192-bit token), shown with a copy button and a **QR code**. |
| FR-R-22 | Assessments list: title, role, level, time, joined / in progress / submitted counts, average score, status; recruiters can close and reopen an assessment. |
| FR-R-23 | Assessment page (`/assessment?id=`): a sortable table of **all candidates** with Overall, Technical/engineering judgment, AI verification (trustCalibration), Issue detection, Prompt quality, AI interaction quality, Token usage/efficiency (score + total tokens), Time taken, Testing/validation (verification), Final outcome (band, verdict, review status). Unscored rows sort last. |
| FR-R-24 | **Candidate comparison:** select 2–4 candidates for a side-by-side view across the same dimensions, with the best value per row highlighted and links to each report. |
| FR-R-25 | Report, when `result.trajectory` exists: overall score and dimension table first; then judge evidence cards (title, candidate evidence quote, "Judges: k/n agree", confidence, "Human review recommended"); a **Judge disagreements** section with per-judge Yes/No; findings grouped as Detected issues / Missed issues / False positives / Other behaviours. |
| FR-R-26 | Each evidence card's event IDs link to the matching event in the **interaction timeline** (prompt → AI response with code and tokens → accepted/dismissed → edits → test runs → final submission). Responses carrying a planted fault are marked for the recruiter only. |
| FR-R-27 | For AI PR review, the report shows the AI's PR, rationale and numbered assumptions (A1…An), marking the ones the candidate challenged. |

The recruiter should be able to answer *"Why did ReviewBench give this candidate this score?"* in a few clicks.

---

## 16. Access control and security

### 16.1 Roles

| Role | Can do |
|---|---|
| Anonymous | Take assessments, submit |
| Signed-in non-member | See "no access" or claim/accept flows only |
| Recruiter | Read submissions, reports, answer keys; retry grading |
| Owner | Everything a recruiter can, plus invite/revoke/remove members |

### 16.2 Authentication

| ID | Requirement |
|---|---|
| SEC-1 | Recruiters authenticate with email + password (min 8 chars). |
| SEC-2 | Email ownership verified by a 6-digit one-time code (15-min expiry) before any session is issued. |
| SEC-3 | Password reset via emailed code. |
| SEC-4 | *(Planned)* SSO (Google Workspace, SAML) for enterprise. |

### 16.3 Workspace membership

| ID | Requirement |
|---|---|
| SEC-5 | The first verified account may claim an unclaimed workspace as owner; subsequent claims fail. |
| SEC-6 | Unverified accounts cannot claim or accept invites. |
| SEC-7 | Invites are keyed by normalized (trimmed, lowercased) email. |
| SEC-8 | Accepting an invite requires a verified account whose email matches a pending invite; the invite is consumed. |
| SEC-9 | Owners cannot be removed. |

### 16.4 Data protection

| ID | Requirement |
|---|---|
| SEC-10 | Every recruiter-facing query/mutation calls `requireRecruiter` **server-side**. |
| SEC-11 | The answer key lives only in server code; never shipped to the browser. |
| SEC-12 | The public submit endpoint returns nothing (no IDs usable to look up results). |
| SEC-13 | Candidate content is treated as untrusted in all prompts. |
| SEC-14 | Secrets (deploy keys, API tokens) never committed to source repositories. |
| SEC-15 | Rate limiting (global hourly caps on starts and submissions, per-candidate draft-save cap, 200 joins/hour per assessment link, per-candidate assistant and event-log caps) and single-use candidate tokens on the public endpoints. |
| SEC-18 | Public assessment endpoints (`assessments.publicInfo`, `assessments.join`) expose only title, role, level, minutes, AI-assisted and open state, never scenario or answer data. |
| SEC-16 | *(Planned)* Candidate data never sent to model providers that train on inputs. |
| SEC-17 | *(Planned)* Data retention policy and candidate data deletion on request. |

### 16.5 Assessment integrity (by design, no proctoring)

- Codebase-specific traps an outside AI cannot know about without full context.
- Follow-up questions requiring reasoning about specific lines.
- Variant rotation and scenario retirement.
- Optional proctoring only as a future add-on.

---

## 17. Transparency, reporting, and appeals

| ID | Requirement |
|---|---|
| TR-1 | Every score is decomposable into components, items, votes, and verbatim evidence. |
| TR-2 | Scoring weights and band thresholds are published to customers. |
| TR-3 | Candidates are told in advance that the code is AI-written and may contain mistakes. |
| TR-4 | *(Planned)* Candidate report: component breakdown, strengths, gaps; answer key shown only for retired scenarios. |
| TR-5 | *(Planned)* Appeal button routes to human review (HR-1) with an SLA. |
| TR-6 | *(Planned)* Public technical manual: methodology, validation results, bias audit results. |

---

## 18. Customization

| ID | Requirement |
|---|---|
| CU-1 | Role and level templates (Junior / Mid / Senior / Staff) built from calibrated item difficulty. |
| CU-2 | Category emphasis (e.g., security-heavy for fintech) adjustable **within validated ranges only**. |
| CU-3 | Module batteries per role, respecting the 60-minute cap. |
| CU-4 | Company-specific scenarios from a job analysis, including sanitized incident postmortems. |
| CU-5 | Bring-your-own-code: sanitized slice of the customer's codebase with planted issues (enterprise). |
| CU-6 | Local benchmarking: company engineers take the assessment to establish norms. |
| CU-7 | Outcome tracking: 6-month manager ratings linked to scores to measure per-company predictive validity. |
| CU-8 | Every configuration change runs an adverse-impact check (FB-6). |

---

## 19. Experimentation framework

| ID | Requirement |
|---|---|
| EX-1 | Version every prompt, rubric, model assignment, and weight set. |
| EX-2 | Trace every judge call (input, output, latency, cost, model). |
| EX-3 | **Shadow mode:** candidate variants grade live traffic without affecting reported scores; compare against production. |
| EX-4 | Promotion requires passing the regression gate (REL-7) and meeting SM-1…SM-5. |
| EX-5 | Experiment log records hypothesis, change, results, and decision. |

---

## 20. Compliance

| Jurisdiction | Obligation | Requirement |
|---|---|---|
| NYC Local Law 144 | Annual independent bias audit; public results; candidate notice ≥ 10 business days | CO-1: audit-ready exports; notice templates |
| Illinois (in force Jan 2026) | AI use in employment decisions | CO-2: disclosure support |
| Colorado (replacement law, from 2027) | Advance notice; explanation within 30 days of adverse decision; correction; human reconsideration | CO-3: explanation export; appeal flow (TR-5) |
| California (ADS regs, Oct 2025) | Anti-discrimination law applies to automated tools | CO-4: adverse impact monitoring (FB-3) |
| EU AI Act (high-risk hiring, from 2 Dec 2027) | Risk assessment, documentation, bias testing, human oversight, transparency, monitoring | CO-5: technical documentation; HR queue; monitoring dashboards |

Legal liability for hiring decisions stays with the employer; ReviewBench supplies the evidence and documentation they need. *Counsel review required before launch.*

---

## 21. System architecture

### 21.1 Current implementation (MVP)

```
Browser (TanStack Start, React, Tailwind)
  ├─ /             landing
  ├─ /a/$token     assessment link ── assessments.publicInfo / join (public)
  ├─ /assess       candidate flow  ── builds.ask (action → assistant LLM), builds.log,
  │                                   saveDraft, submit (public, token-scoped)
  ├─ /recruiter    dashboard       ──┐
  ├─ /assessment   candidates + compare
  └─ /report       evidence report ──┴── protected queries (requireRecruiter)
                                          │
Convex (database, functions, auth, scheduler)
  ├─ builds.ask ──► prepareAsk (validate, redact) ──► ASSISTANT_MODEL ──► recordAsk
  ├─ submissions.submit ──► scheduler ──► grading.grade (action)
  │                                          ├─ M1/M2 checklist council
  │                                          └─ trajectory council (M3, PR-review chat)
  │                                          │
  │                          ┌───────────────┼───────────────┐
  │                       Judge A          Judge B         Judge C
  │                     (Gemini)          (Claude)        (Llama)
  │                          └── OpenAI-compatible endpoint ─┘
  ├─ access.*  (claim, invite, team)
  └─ auth.*    (Password + emailed OTP via Resend)
```

- **Frontend:** TanStack Start, React, Tailwind CSS v4, lucide icons, IBM Plex fonts.
- **Backend:** Convex (reactive DB, queries/mutations/actions, scheduler), Convex Auth.
- **LLM access:** any OpenAI-compatible chat endpoint (`LLM_BASE_URL`, default OpenRouter), server-side only.
- **Hosting:** any Node host for the frontend (Nitro output) + Convex (cloud or self-hosted).

### 21.2 Target production architecture

- Provider abstraction layer for judges (e.g., LiteLLM or equivalent) so models are a config change.
- Self-hosted open-weight judges (vLLM) for privacy and cost at scale.
- Queue with retries and backoff; result caching by hash of (submission, rubric version, model).
- Cascade routing: cheap first-pass judge → full council on borderline/high-stakes.
- Tracing (Langfuse or equivalent), regression harness (promptfoo/DeepEval or equivalent).
- Sandboxed code execution for M3 (Docker/Judge0 equivalent).
- Vector store for RAG examples.
- Multi-tenant workspaces.

---

## 22. Data model

### 22.1 `submissions`

| Field | Type | Notes |
|---|---|---|
| candidateName | string | 1–120 chars |
| scenarioId | string | must exist in answer keys |
| level | string | |
| verdict | `"approve" \| "request_changes"` | |
| comments | `Comment[]` | `{ id, file, line, severity, text }` |
| followUps | `{ question, answer }[]` | |
| status | `"grading" \| "graded" \| "error"` | |
| result | object (optional) | see §22.4 |
| error | string (optional) | |
| submittedAt | number | index `by_submittedAt` |

### 22.2 `recruiters`

| Field | Type | Notes |
|---|---|---|
| userId | Id<"users"> | index `by_userId` |
| email | string | normalized; index `by_email` |
| role | `"owner" \| "recruiter"` | |
| joinedAt | number | |

### 22.3 `invites`

| Field | Type | Notes |
|---|---|---|
| email | string | normalized; index `by_email` |
| invitedBy | Id<"users"> | |
| createdAt | number | |

Plus Convex Auth tables (`users`, `authAccounts`, `authSessions`, verification codes, etc.).

### 22.4 Result object

```ts
type Result = {
  overall: number
  band: "Strong" | "Meets bar" | "Borderline" | "Below bar"
  components: Record<"detection" | "precision" | "decoyDiscipline"
                   | "explanationQuality" | "verdict", { value: number; detail: string }>
  weights: Record<string, number>
  items: Array<{
    id: string; kind: "issue" | "decoy"; title: string; category: string
    severity: string; weight: number
    outcome: "found" | "missed" | "false_alarm" | "clean"
    explanation: number | null          // 0–2
    commentText: string | null; commentLine: number | null; commentFile: string | null
    split: boolean
    votes: Array<{ judge; model; decision; impact; fix; evidence; valid; discardedReason? }>
  }>
  extraComments: Array<{ text; file; line; classification; votes }>
  foundCount: number
  issueCount: number
  needsReview: boolean
  reviewReasons: string[]
  judges: Array<{ name: string; model: string }>
  gradedAt: number
}
```

> The `result` and `machineResult` fields are validated by `resultValidator` (NFR-DATA-1). `machineResult` is the untouched council output; `result` has human overrides applied.

`result.trajectory` (v0.6, optional):

```ts
trajectory?: {
  dimensions: Array<{ key: string; label: string; score: number; detail: string }>
  findings: Array<{
    id: string                // "F1", "A2", "B7"
    title: string
    dimension: string
    kind: "detected" | "missed" | "false_positive" | "behavior"
    question: string
    votes: Array<{ judge; model; family?; decision: boolean; evidence: string;
                   eventIds: string[]; valid: boolean; discardedReason? }>
    agreement: string         // "yes/valid", e.g. "3/3"
    confidence: "high" | "medium" | "low"
    needsReview: boolean
  }>
}
```

### 22.5 `assessments` (v0.6)

| Field | Type | Notes |
|---|---|---|
| title | string | default `${role} · ${scenario title}`, ≤ 120 chars |
| role | string | one of the five roles (FR-R-20) |
| scenarioId | string | must exist in `SCENARIO_META` |
| level | `"Junior" \| "Mid" \| "Senior"` | stored and shown; does not yet change scenario content |
| minutes | number | 10–90; overrides the scenario time limit |
| aiAssisted | boolean | stored and shown; not yet enforced by the candidate flow |
| token | string | 48 hex chars; index `by_token` |
| status | `"active" \| "closed"` | |
| createdBy / createdAt | Id<"users"> / number | index `by_createdAt` |

`candidates` gains optional `assessmentId` (index `by_assessment`). `submissions.build` (`{ code, events }`) is now also used for PR-review chats.

### 22.6 Planned tables

`scenarios` (versioned content), `answerKeys` (versioned, server-only), `workspaces` (multi-tenancy).

---

## 23. Backend API surface

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `assessments.create` | mutation | recruiter | Create an assessment; returns `{ id, token }` |
| `assessments.list` | query | recruiter | Assessments with counts and average score |
| `assessments.get` | query | recruiter | Assessment + candidate rows (scores, dimensions, tokens, review status) |
| `assessments.setStatus` | mutation | recruiter | Close / reopen |
| `assessments.publicInfo` | query | public | Title, role, level, minutes, AI-assisted, open |
| `assessments.join` | mutation | public (rate-limited) | Create a candidate from a link; returns `{ candidateToken }` |
| `builds.ask` | action | candidate token | Assistant / PR-author reply; returns `{ id, text, code }` |
| `builds.log` | mutation | candidate token | Record accept/reject, test runs, file opens, code edits |
| `submissions.submit` | mutation | public | Validate and store a submission; schedule grading; returns `null` |
| `submissions.list` | query | recruiter | Dashboard rows |
| `submissions.get` | query | recruiter | Full submission + result |
| `submissions.regrade` | mutation | recruiter | Re-run grading |
| `grading.grade` | internal action | system | Full grading pipeline |
| `access.me` | query | any | Signed-in state, role, claim/invite status |
| `access.claimWorkspace` | mutation | verified user | Become owner if unclaimed |
| `access.acceptInvite` | mutation | verified user | Join via invite |
| `access.team` | query | recruiter | Members (+ invites for owner) |
| `access.invite` | mutation | owner | Invite by email |
| `access.revokeInvite` | mutation | owner | Revoke invite |
| `access.removeMember` | mutation | owner | Remove non-owner member |

---

## 24. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-UX-1 | Candidate time | ≤ 45 min per module; ≤ 60 min per battery |
| NFR-UX-2 | Responsiveness | Usable on laptop widths ≥ 1024px; mobile layout verified *(pending)* |
| NFR-UX-3 | Accessibility | Labeled controls, keyboard operable, WCAG AA contrast |
| NFR-PERF-1 | Grading latency | p95 ≤ 3 min from submit to report |
| NFR-PERF-2 | Parallelism | Judge calls within a stage run in parallel |
| NFR-REL-1 | Judge failure | Automatic fallback; low quorum escalates rather than fails |
| NFR-REL-2 | Grading failure | Status set to `error`; recruiter can retry |
| NFR-SEC-1 | Server-side authorization for all protected data (SEC-10) |
| NFR-DATA-1 | Schema validation for stored results |
| NFR-COST-1 | Track LLM calls and cost per submission; MVP ≈ 12–20 calls per submission. The trajectory council adds 3 judges × questions: 36 calls for a build with one exposed fault, more with more faults or assumptions. Assistant calls are one per candidate prompt. |
| NFR-OBS-1 | Log and trace every judge call (`judgeCalls` table) |

---

## 25. Model strategy and cost

### 25.1 Current judge panel

| Judge | Primary model | Fallback (current) |
|---|---|---|
| A | `google/gemini-3.6-flash` | `qwen/qwen3-235b-a22b-2507` (Alibaba) |
| B | `anthropic/claude-sonnet-5` | `mistralai/mistral-large` (Mistral) |
| C | `meta-llama/llama-3.3-70b-instruct` | `deepseek/deepseek-chat` (DeepSeek) |

The **assistant** (M3 and the PR-review agent) uses `ASSISTANT_MODEL` (default `anthropic/claude-sonnet-5`) on the same endpoint; it is live only when `LLM_API_KEY` or `LLM_BASE_URL` is set.

All six families are distinct (GR-7). The panel can be replaced without a code change through the `JUDGE_PANEL_JSON` environment variable, which is validated the same way. Fallback model IDs must be confirmed against the LLM endpoint's catalogue; an unavailable fallback simply counts as an unavailable judge and low quorum escalates.

### 25.2 Free-tier and open-weight options (development/prototype)

| Provider | Offering | Best role |
|---|---|---|
| Groq | Fast Llama and Qwen models | Judge, extraction |
| Google AI Studio | Gemini Flash-class, long context | Judge (long trajectories) |
| OpenRouter free models | Rotating open-weight models | Third judge, tiebreaker |
| Cerebras, Mistral, GitHub Models, Cloudflare Workers AI | Smaller quotas | Overflow, fallback |
| Ollama (local) | Qwen, Llama, Gemma 7–14B | Anonymization, extraction, dev |

Free tiers are for building and validation only. Some free tiers may train on inputs — never send real candidate data to them (SEC-16). Production moves to self-hosted open-weight models; checklist decomposition makes smaller models viable.

### 25.3 Cost controls

Cache by (submission hash, rubric version, model); batch checklist items per call where accuracy allows; cascade routing (KA-6); rate-limit public submissions (SEC-15).

---

## 26. Testing strategy

| Layer | Tooling | Scope |
|---|---|---|
| Backend unit/integration | Vitest + convex-test (edge runtime) | Access control, validation, full grading pipeline with a deterministic fake judge panel |
| Scenario integrity | Vitest (jsdom) | Answer-key isolation, solvability, visible line ranges, decoy justification |
| Browser QA | Headless browser against preview | Candidate flow end to end without submitting; layout checks |
| Real-model evaluation | Golden set + live runs (retest, perturbation, adversarial) from the Reliability page | Accuracy, stability, perturbation, injection resistance |
| Regression gate | Golden-set run vs. baseline run on the Reliability page; unit tests + typecheck in GitHub Actions | Block changes that degrade REL metrics |

### 26.1 Required test cases (current)

Access: anonymous blocked; first verified claim; second claim rejected; unverified claim rejected; non-member blocked; invite → accept → access; uninvited accept rejected; owner-only invite + email validation; member removal revokes access; owner not removable.
Grading: reference scenario outcomes; perfect review → Strong; wrong verdict lowers score; fabricated evidence discarded; single usable judge → no credit + escalation; fallback model used on failure; injection comment earns nothing.
Scenario: no answer-key imports in `src/`; no answer-key text in `src/`; key lines visible; hallucinated helper absent; decoy required by ticket; every stated assumption has a server-side key.
Assessments: create → public info → join → session with the assessment's time limit; closed links reject joins; input validation; recruiter-only management.
Assistant: live model receives no candidate identity; faults stay deterministic; scripted fallback when the model is down; PR-author role-play records tokens and the chat reaches the submission.
Trajectory council: unanimous → high confidence; split → review; vote citing a missing event or unverified quote → discarded; all judges down → deterministic fallback; correct challenge credited; low tokens without outcomes score 0 efficiency; human overrides keep the trajectory blend.

---

## 27. Roadmap and phases

| Phase | Theme | Scope |
|---|---|---|
| **P0 · MVP slice** | Prove the loop | M1 with one scenario; council grading; recruiter auth; reports; tests |
| **P1 · Safe to use** | Production hygiene | Invite links + rate limits (FR-C-12, SEC-15); autosave + enforced timer (FR-C-13/14); hydration fix (FR-C-15); human review queue (HR-1…3); judge diversity (GR-7); vague-match label (GR-15); result schema (NFR-DATA-1) |
| **P2 · Trustworthy** | Measure the measurer | Golden set + reliability dashboard (REL-1…8); real-model and injection tests (REL-10); perturbation/bias tests (FB-1…2); weight calibration; tracing (EX-2) |
| **P3 · Complete M1** | Depth | Follow-up scoring (SCR-1); communication items (SCR-2); candidate reports + appeals (TR-4/5); more scenarios, variants, levels; interview guide (FR-R-16) |
| **P4 · Modules** | Breadth | M2 Decision Review; M3 Directed Build with proxy + trajectories |
| **P5 · Customization** | Company fit | Scenario builder; job analysis; local norms; outcome tracking; BYO code; IRT |
| **P6 · Scale & compliance** | Enterprise | Multi-tenancy; SSO; ATS integrations; RAG + fine-tuned judge; compliance kit; technical manual |
| **P7 · AI-native flow** | Core story for the presentation | Assessments + link/QR; AI PR review with the agent; live assistant; trajectory council + dimensions; evidence-first report; candidate comparison; simplified candidate UI |

---

## 28. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Answer-key gaps (candidates find real unplanted issues) | `valid_extra` class + human review → improve scenarios |
| Scenario leakage | Variants, rotation, retirement; private repos |
| LLM judge bias/instability | Checklists, diverse council, evidence verification, golden-set validation |
| Prompt injection | Delimiters, untrusted-data instructions, evidence checks, adversarial tests |
| Small golden set early | Report confidence intervals; don't use for decisions until AC-REL-1 |
| Public endpoint abuse / cost | Invite tokens, rate limits, caching |
| Regulatory exposure | Compliance-by-design, human oversight, counsel review |
| Incumbents copy planted faults | Moat = calibrated item bank + validity data + published trust record |
| Platform lock-in | LLM calls use the standard OpenAI-compatible API (`judges.ts`); email via Resend (`ResendOTP.ts`) |

---

## 29. Open questions

1. Should follow-up answers affect the score, or remain interview guidance only?
2. What are the final calibrated weights and band thresholds (post golden set)?
3. How are demographic data collected lawfully and with consent for adverse-impact analysis?
4. Multi-tenant model: one workspace per company, or organizations with multiple workspaces?
5. Retention period for candidate submissions?
6. Should candidates see their detailed report by default, or only on request?
7. Which model providers meet the no-training-on-inputs requirement for production?
8. What blend between the deterministic grade and the trajectory dimensions (today 50/50) best predicts human scores?
9. What token budget per outcome should the efficiency dimension use (today 4000)?
10. Should the assessment's level change scenario content (e.g., pick a Junior vs. Mid variant), or stay a label?

---

## 30. Research basis

| Decision | Evidence |
|---|---|
| Decompose into checklist questions | Checklist-based LLM evaluation improves inter-judge agreement and reduces variance; lets smaller models approach frontier performance |
| Multi-family council | Panels of diverse judges outperform single large judges and reduce self-preference bias |
| Validate vs. humans, not just consistency | Highly reproducible judges can still be severely biased |
| Rubrics with examples, low complexity | Examples raise human–AI agreement; complexity lowers it |
| PR size ≈ 150–250 lines, ≤ 45 min | Industrial code-review studies: effective review < 400 LOC/hour; effectiveness drops after ~60 min; candidate drop-off rises past 90 min |
| Planted, standardized faults | Selection research: decompose judgments, fix standards in advance, aggregate independent evaluations |
| Structured follow-up questions | Structured interviews show the highest average validity; multi-method batteries outperform single methods |
| Job-analysis-based scenarios | Situational judgment tests built from job analysis show higher validity |
| Emphasize security/hallucination faults | High rates of security flaws and hallucinated dependencies observed in AI-generated code |
| IRT scoring | Enables difficulty/discrimination estimates, adaptive testing, equating, and DIF analysis |
| Compliance by design | NYC LL144, Illinois, Colorado, California ADS rules, EU AI Act high-risk obligations |

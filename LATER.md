# ReviewBench — Later enhancements

Work deliberately deferred so the website could be demo-ready. Each item names
the spec requirement it completes. Tick items off as they land.

## A. Platform independence (done)

Macaly is no longer used: judges call any OpenAI-compatible endpoint
(`LLM_BASE_URL`, default OpenRouter), emails go through Resend, and the Macaly
bridge/tagger are removed (the last helper, `convex/macaly.ts`, was deleted 2026-10-13). Remaining:

- [ ] **Per-provider direct keys** (Google, Anthropic, ...) if OpenRouter is not acceptable for data-handling reasons (SEC-16).
- [x] **Budget guard.** When the provider returns 402/quota errors, show a
      "grading paused: AI credits exhausted" banner instead of escalating every
      submission.

## B. Deferred features (by roadmap phase)

### P2 · Trustworthy
- [x] Non-native-English perturbation (needs an LLM rewrite step) (FB-2)
- [x] Incremental metric aggregates so the dashboard covers > 300 submissions (REL-8): slim `metricRows`, 2,000 submissions
- [x] Run the regression gate automatically in CI against a staging deployment with real models (REL-7): needs the `CONVEX_DEPLOY_KEY_STAGING` secret

### P3 · Complete M1
- [ ] Scenario variants (2–3 per issue) with rotation against leakage (SC-7)
- [x] Email invite links to candidates directly (FR-R-6)
- [x] Role / level / date filters on the dashboard once there are many scenarios (FR-R-5)

### P4 · Modules
- [x] M3: live LLM assistant behind the proxy, with planted faults still scripted (P7, AS-1–6)
- [x] M3: council scoring of *how* faults were caught and of instruction quality (P7, trajectory council §10.8)
- [ ] M3 Directed Build: real browser IDE with a sandboxed runtime (Judge0/Docker) and
      hidden tests executed server-side (today: signature checks + in-browser visible tests) (§7.3)
- [x] M3: human overrides of Directed Build items
- [ ] M2: more decision briefs; per-section judging instead of one combined critique

### P7 · AI-native flow
- [x] Enforce the assessment's **AI-assisted** flag in the candidate flow: hide the agent chat / assistant when off (today it is a label only) (FR-R-20)
- [ ] Decide whether the assessment **level** selects scenario content (Junior vs. Mid variants) or stays a label (§29.10)
- [ ] Calibrate the 50/50 deterministic/judged blend and the efficiency constant (4000 tokens per outcome) against human-graded trajectories (§11.4, §29.8–9)
- [x] Human overrides of trajectory findings (dimensions and overall re-scored)
- [ ] Batch trajectory questions per judge call to cut cost once accuracy is measured (NFR-COST-1)
- [ ] Measure and tune the PR-author agent (`AUTHOR_SYSTEM`) on pilot transcripts: concedes too early? volunteers flaws? (needs transcripts)
- [x] Pin a model per scenario version (`SCENARIO_META.agentModel`); every reply records its model (§7.4)
- [x] Stream assistant replies instead of waiting for the full response
- [x] Agent notes (rationale + assumptions) for ADR-031 so Decision Review can use the agent chat too
- [x] Email the assessment link / QR to candidates; per-candidate expiry on joined links (7 days)
- [x] Dedupe joins across devices (same email: the existing link is emailed, never returned)
- [x] Export the comparison view (CSV) for hiring committees; PDF via browser print
- [x] Filter the recruiter's assessment list by role and status once there are many

### P5 · Customization
- [ ] Scenario builder: LLM generates a clean artifact, scripted mutations insert issues,
      human verifies (SB-1, SB-2)
- [ ] Job-analysis intake and company-specific scenarios from postmortems (CU-4)
- [ ] Bring-your-own-code scenarios (CU-5)
- [x] 2PL IRT from 30 submissions per scenario (SCR-3)
- [ ] Test equating across variants (SCR-4): needs scenario variants

### P6 · Scale & compliance
- [ ] Multi-tenant workspaces (one workspace per company, scoped queries) (§21.2)
- [x] SSO: Google Workspace (SEC-4)
- [ ] SAML (not supported by Convex Auth; needs an IdP broker such as WorkOS)
- [x] ATS integration: signed `submission.graded` webhook + CSV export
- [ ] Native Greenhouse/Lever API connectors
- [ ] Embedding-based retrieval (pgvector or Convex vector index) for RAG examples;
      today: lexical similarity (KA-1, KA-2)
- [ ] QLoRA fine-tuned first-pass judge + cascade routing after ≥ 500 labels (KA-5–7)
- [x] Shadow-mode grading of candidate configs on live traffic (EX-3)
- [x] Result caching by (prompt version, model, prompt) and a retrying queue (§21.2)
- [x] Data-retention policy with scheduled deletion (SEC-17): `RETENTION_DAYS`
- [ ] Counsel review of notice templates and the methodology page (§20)

## C. Tests trimmed or deferred for the demo build

- [ ] Browser end-to-end tests (Playwright) of the recruiter pages against a live Convex dev deployment
- [ ] Unit tests for the Directed Build worker-based visible test runner (browser only)
- [ ] Browser end-to-end test of the P7 flow: create assessment → link → agent chat → submit → assessment page → compare → report
- [ ] Live-model evaluation of the trajectory council (retest stability, perturbation, injection inside chat messages) (REL-3, REL-10, FB-2)
- [ ] Real-model evaluation suite in CI (REL-10)

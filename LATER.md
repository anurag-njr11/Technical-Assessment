# ReviewBench — Later enhancements

Work deliberately deferred so the website could be demo-ready. Each item names
the spec requirement it completes. Tick items off as they land.

## A. Platform independence (done)

Macaly is no longer used: judges call any OpenAI-compatible endpoint
(`LLM_BASE_URL`, default OpenRouter), emails go through Resend, and the Macaly
bridge/tagger are removed. Remaining:

- [ ] **Per-provider direct keys** (Google, Anthropic, ...) if OpenRouter is not acceptable for data-handling reasons (SEC-16).
- [ ] **Budget guard.** When the provider returns 402/quota errors, show a
      "grading paused: AI credits exhausted" banner instead of escalating every
      submission.

## B. Deferred features (by roadmap phase)

### P2 · Trustworthy
- [ ] Non-native-English perturbation (needs an LLM rewrite step) (FB-2)
- [ ] Incremental metric aggregates so the dashboard covers > 300 submissions (REL-8)
- [ ] Run the regression gate automatically in CI against a staging deployment with real models (REL-7)

### P3 · Complete M1
- [ ] Scenario variants (2–3 per issue) with rotation against leakage (SC-7)
- [ ] Email invite links to candidates directly (FR-R-6)
- [ ] Role / level / date filters on the dashboard once there are many scenarios (FR-R-5)

### P4 · Modules
- [x] M3: live LLM assistant behind the proxy, with planted faults still scripted (P7, AS-1–6)
- [x] M3: council scoring of *how* faults were caught and of instruction quality (P7, trajectory council §10.8)
- [ ] M3 Directed Build: real browser IDE with a sandboxed runtime (Judge0/Docker) and
      hidden tests executed server-side (today: signature checks + in-browser visible tests) (§7.3)
- [ ] M3: human overrides of Directed Build items (today: resolve with a note only)
- [ ] M2: more decision briefs; per-section judging instead of one combined critique

### P7 · AI-native flow
- [ ] Enforce the assessment's **AI-assisted** flag in the candidate flow: hide the agent chat / assistant when off (today it is a label only) (FR-R-20)
- [ ] Decide whether the assessment **level** selects scenario content (Junior vs. Mid variants) or stays a label (§29.10)
- [ ] Calibrate the 50/50 deterministic/judged blend and the efficiency constant (4000 tokens per outcome) against human-graded trajectories (§11.4, §29.8–9)
- [ ] Human overrides of trajectory findings (today: overrides change M1 items; trajectory findings can only be resolved with a note)
- [ ] Batch trajectory questions per judge call to cut cost once accuracy is measured (NFR-COST-1)
- [ ] Measure and tune the PR-author agent (`AUTHOR_SYSTEM`) on pilot transcripts: concedes too early? volunteers flaws?; pin a model per scenario version for comparability (§7.4)
- [ ] Stream assistant replies instead of waiting for the full response
- [ ] Agent notes (rationale + assumptions) for ADR-031 so Decision Review can use the agent chat too
- [ ] Email the assessment link / QR to candidates; per-candidate expiry on joined links
- [ ] Dedupe joins across devices (today each join creates a new candidate; the same browser reuses its token)
- [ ] Export the comparison view (CSV/PDF) for hiring committees
- [ ] Filter the recruiter's assessment list by role and status once there are many

### P5 · Customization
- [ ] Scenario builder: LLM generates a clean artifact, scripted mutations insert issues,
      human verifies (SB-1, SB-2)
- [ ] Job-analysis intake and company-specific scenarios from postmortems (CU-4)
- [ ] Bring-your-own-code scenarios (CU-5)
- [ ] 2PL IRT, test equating across variants (SCR-3, SCR-4); today: Rasch (1PL) estimates

### P6 · Scale & compliance
- [ ] Multi-tenant workspaces (one workspace per company, scoped queries) (§21.2)
- [ ] SSO: Google Workspace and SAML (SEC-4)
- [ ] ATS integrations (Greenhouse/Lever webhooks); today: CSV export
- [ ] Embedding-based retrieval (pgvector or Convex vector index) for RAG examples;
      today: lexical similarity (KA-1, KA-2)
- [ ] QLoRA fine-tuned first-pass judge + cascade routing after ≥ 500 labels (KA-5–7)
- [ ] Shadow-mode grading of candidate configs on live traffic (EX-3)
- [ ] Result caching by (submission hash, rubric, model) and a retrying queue (§21.2)
- [ ] Data-retention policy with scheduled deletion (SEC-17)
- [ ] Counsel review of notice templates and the methodology page (§20)

## C. Tests trimmed or deferred for the demo build

- [ ] Browser end-to-end tests (Playwright) of the recruiter pages against a live Convex dev deployment
- [ ] Unit tests for the Directed Build worker-based visible test runner (browser only)
- [ ] Browser end-to-end test of the P7 flow: create assessment → link → agent chat → submit → assessment page → compare → report
- [ ] Live-model evaluation of the trajectory council (retest stability, perturbation, injection inside chat messages) (REL-3, REL-10, FB-2)
- [ ] Real-model evaluation suite in CI (REL-10)

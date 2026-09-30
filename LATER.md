# ReviewBench — Later enhancements

Work deliberately deferred so the website could be demo-ready. Each item names
the spec requirement it completes. Tick items off as they land.

## A. Run without Macaly (platform independence)

Macaly is only used for AI judge calls and verification emails; the app and
Convex run anywhere. To remove the dependency:

- [ ] **Judge transport adapter.** Replace `callModel()` in `convex/judges.ts`
      with a provider switch chosen by env var `LLM_PROVIDER`:
  - [ ] `openrouter`: one `OPENROUTER_API_KEY`, same model names as today
        (`https://openrouter.ai/api/v1/chat/completions`, OpenAI-compatible body)
  - [ ] `direct`: per-provider keys (Google AI Studio, Anthropic, Groq/Together for Llama,
        Mistral, DeepSeek, Alibaba) with a small request/response mapper each
  - [ ] `ollama`: local models via `http://localhost:11434/api/chat` for free development
  - [ ] Keep `macaly` as one option so the current deployment keeps working
  - [ ] Unit test each mapper with a stubbed `fetch`
- [ ] **Verification email.** Replace `convex/ResendOTP.ts`'s Macaly OTP endpoint
      with Resend (`RESEND_API_KEY`) or SMTP; keep the 6-digit, 15-minute code.
- [ ] **Remove Macaly-only UI/dev bits.** Make `<MacalyBridge>` in
      `src/routes/__root.tsx` optional and drop `macalyTagger` / Macaly
      `allowedHosts` from `vite.config.ts` when not on Macaly.
- [ ] **Local Convex.** Document `npx convex dev` (cloud free tier) and the
      open-source self-hosted Convex backend in the README.
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
- [ ] M3 Directed Build: real browser IDE with a sandboxed runtime (Judge0/Docker),
      hidden tests executed server-side, live LLM assistant behind the mutation proxy
      (today: scripted assistant + signature checks + in-browser visible tests) (§7.3)
- [ ] M3: council scoring of *how* faults were caught and of instruction quality
      (today: deterministic heuristic) (§7.3)
- [ ] M3: human overrides of Directed Build items (today: resolve with a note only)
- [ ] M2: more decision briefs; per-section judging instead of one combined critique

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
- [ ] Real-model evaluation suite in CI (REL-10)

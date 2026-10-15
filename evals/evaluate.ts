// Scores the judge council against the synthetic golden set (evals/golden.ts)
// and the adversarial suite. Pure: give it an Asker (live models or a fake).

import { ANSWER_KEYS } from "../convex/answerKey"
import { ADVERSARIAL_CASES } from "../convex/evaluation"
import { gradeSubmission } from "../convex/grading"
import type { Asker, Judge, Trace } from "../convex/judges"
import { mean, percentile, quadraticWeightedKappa, wilson } from "../convex/metrics"
import { itemOrdinal } from "../convex/scoring"
import type { GoldenCase } from "./golden"

type Pair = { caseId: string; profile: string; itemId: string; kind: "issue" | "decoy"; council: number; label: number; councilOutcome: string; labelOutcome: string }

export type EvalReport = Awaited<ReturnType<typeof evaluate>>

export async function evaluate(cases: GoldenCase[], ask: Asker, panel: Judge[], traces: Trace[], onProgress?: (done: number, total: number) => void) {
  const pairs: Pair[] = []
  const perCase: Array<{ id: string; profile: string; overall: number; needsReview: boolean; calls: number }> = []
  let positives = 0
  let validPositives = 0
  for (const [n, c] of cases.entries()) {
    const key = ANSWER_KEYS[c.scenarioId]
    const r = await gradeSubmission({ comments: c.comments, verdict: c.verdict, candidateName: "Golden Candidate" }, key, ask, panel)
    for (const it of r.items) {
      const label = c.labels[it.id]
      if (!label) continue
      pairs.push({
        caseId: c.id, profile: c.profile, itemId: `${c.scenarioId}:${it.id}`, kind: it.kind,
        council: itemOrdinal(it.kind, it.outcome, it.explanation), label: itemOrdinal(it.kind, label.outcome, label.explanation ?? 0),
        councilOutcome: it.outcome, labelOutcome: label.outcome,
      })
      for (const v of it.votes) if (v.decision) { positives++; if (v.valid) validPositives++ }
    }
    perCase.push({ id: c.id, profile: c.profile, overall: r.overall, needsReview: r.needsReview, calls: r.callCount ?? 0 })
    onProgress?.(n + 1, cases.length)
  }

  const issues = pairs.filter((p) => p.kind === "issue")
  const decoys = pairs.filter((p) => p.kind === "decoy")
  const detected = (x: Pair) => x.council > 0
  const truth = (x: Pair) => x.label > 0
  const agreeOn = (xs: Pair[]) => wilson(xs.filter((x) => detected(x) === truth(x)).length, xs.length)
  const falseCredit = issues.filter((x) => !truth(x))
  const misses = issues.filter((x) => truth(x))
  const bothFound = issues.filter((x) => detected(x) && truth(x))

  const profiles = [...new Set(cases.map((c) => c.profile))].map((profile) => {
    const xs = issues.filter((x) => x.profile === profile)
    const ds = decoys.filter((x) => x.profile === profile)
    return {
      profile,
      issueAccuracy: agreeOn(xs),
      decoyAccuracy: ds.length ? agreeOn(ds) : null,
      meanOverall: mean(perCase.filter((c) => c.profile === profile).map((c) => c.overall)),
    }
  })

  // Adversarial suite (REL-10) on the reference scenario.
  const adversarial: Array<{ label: string; expectation: string; passed: boolean; overall: number }> = []
  for (const a of ADVERSARIAL_CASES) {
    const r = await gradeSubmission(a.submission, ANSWER_KEYS["ord-482-junior"], ask, panel)
    adversarial.push({ label: a.label, expectation: a.expectation, passed: a.check(r), overall: r.overall })
  }

  const latencies = traces.map((t) => t.latencyMs / 1000)
  const ok = traces.filter((t) => t.ok)
  return {
    cases: cases.length,
    items: pairs.length,
    agreement: {
      issueKappa: quadraticWeightedKappa(issues.map((x) => x.council), issues.map((x) => x.label), 4),
      decoyKappa: decoys.length ? quadraticWeightedKappa(decoys.map((x) => x.council), decoys.map((x) => x.label), 2) : NaN,
      detectionAccuracy: agreeOn(issues),
      decoyAccuracy: agreeOn(decoys),
      falseCreditRate: wilson(falseCredit.filter(detected).length, falseCredit.length),
      missRate: wilson(misses.filter((x) => !detected(x)).length, misses.length),
      explanationExact: wilson(bothFound.filter((x) => x.council === x.label).length, bothFound.length),
    },
    evidenceValidity: wilson(validPositives, positives),
    escalationRate: wilson(perCase.filter((c) => c.needsReview).length, perCase.length),
    profiles,
    adversarial,
    cost: {
      calls: traces.length,
      callsPerCase: perCase.length ? mean(perCase.map((c) => c.calls)) : 0,
      failedCalls: traces.length - ok.length,
      inputTokensEst: Math.round(traces.reduce((s, t) => s + t.inputChars, 0) / 4),
      outputTokensEst: Math.round(ok.reduce((s, t) => s + t.outputChars, 0) / 4),
    },
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    models: [...new Set(ok.map((t) => t.model))].sort(),
    disagreements: pairs.filter((x) => detected(x) !== truth(x)).map((x) => ({ case: x.caseId, item: x.itemId, label: x.labelOutcome, council: x.councilOutcome })),
  }
}

const pct = (x: { p: number; lo: number; hi: number } | null) => (x && Number.isFinite(x.p) ? `${(100 * x.p).toFixed(0)}% (${(100 * x.lo).toFixed(0)}–${(100 * x.hi).toFixed(0)})` : "—")
const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—")

/** Markdown summary for EVALUATION.md. */
export function toMarkdown(r: EvalReport, meta: { date: string; preset: string; promptVersion: string }) {
  return `## Run ${meta.date} · preset \`${meta.preset}\` · ${meta.promptVersion}

Models that answered: ${r.models.map((m) => `\`${m}\``).join(", ") || "none"}

| Metric | Result (95% CI) | Target |
|---|---|---|
| Issue agreement, quadratic weighted κ (found + explanation 0–2) | ${num(r.agreement.issueKappa)} | ≥ 0.70 |
| Issue detection accuracy | ${pct(r.agreement.detectionAccuracy)} | ≥ 90% |
| False credit (issue credited when the review didn't identify it) | ${pct(r.agreement.falseCreditRate)} | ≤ 5% |
| Misses (issue identified but not credited) | ${pct(r.agreement.missRate)} | ≤ 10% |
| Decoy accuracy (sound code left alone vs objected to) | ${pct(r.agreement.decoyAccuracy)} | ≥ 90% |
| Explanation score exact match (when both found) | ${pct(r.agreement.explanationExact)} | — |
| Evidence validity (positive votes whose quote is verbatim) | ${pct(r.evidenceValidity)} | ≥ 98% |
| Escalated to human review | ${pct(r.escalationRate)} | 5–15% |
| Adversarial suite | ${r.adversarial.filter((a) => a.passed).length} / ${r.adversarial.length} passed | all |
| Judge calls per review | ${num(r.cost.callsPerCase, 1)} (${r.cost.failedCalls} of ${r.cost.calls} calls failed over) | — |
| Tokens (estimated) | ${r.cost.inputTokensEst.toLocaleString()} in / ${r.cost.outputTokensEst.toLocaleString()} out | — |
| Latency per call p50 / p95 | ${num(r.latency.p50, 1)} s / ${num(r.latency.p95, 1)} s | — |

By reviewer profile (${r.cases} reviews, ${r.items} labelled items):

| Profile | Issue accuracy | Decoy accuracy | Mean score |
|---|---|---|---|
${r.profiles.map((p) => `| ${p.profile} | ${pct(p.issueAccuracy)} | ${pct(p.decoyAccuracy)} | ${num(p.meanOverall, 0)} |`).join("\n")}

Adversarial cases: ${r.adversarial.map((a) => `${a.passed ? "✅" : "❌"} ${a.label}`).join(" · ")}

${r.disagreements.length ? `<details><summary>${r.disagreements.length} disagreements with the labels</summary>\n\n${r.disagreements.map((d) => `- \`${d.case}\` ${d.item}: label ${d.label}, council ${d.council}`).join("\n")}\n\n</details>` : "No disagreements with the labels."}
`
}

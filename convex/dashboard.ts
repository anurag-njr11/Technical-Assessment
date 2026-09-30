// Builds the reliability dashboard (REL-2..REL-8, SM-1..SM-8) from stored
// data. Pure: convex/reliability.ts loads the rows, this computes the numbers.

import type { Doc } from "./_generated/dataModel"
import { ANSWER_KEYS } from "./answerKey"
import { bootstrapCI, fitWeights, fleissKappa, mean, percentile, quadraticWeightedKappa, regressionGate, stdDev, wilson } from "./metrics"
import type { ComponentVec } from "./metrics"
import { itemOrdinal } from "./scoring"
import type { Result } from "./scoring"
import { PERTURBATION_TOLERANCE } from "./evaluation"

export const TARGETS = {
  kappa: 0.7, // SM-1
  retestStd: 2, // SM-2
  evidenceValidity: 0.98, // SM-3
  autoResolutionLo: 0.85, // SM-4
  autoResolutionHi: 0.95,
  perturbation: PERTURBATION_TOLERANCE, // SM-5
  latencyP95Sec: 180, // SM-8
}

type Sub = { _id: string; scenarioId: string; submittedAt: number; machine: Result }
type Label = Pick<Doc<"goldenLabels">, "submissionId" | "targetId" | "grader" | "source" | "outcome" | "explanation" | "overall">
type Run = Pick<Doc<"evalRuns">, "_id" | "kind" | "status" | "runs" | "baseline" | "startedAt" | "submissionId" | "versions">

const kindOf = (scenarioId: string, itemId: string) =>
  ANSWER_KEYS[scenarioId]?.items.find((i) => i.id === itemId)?.kind ?? "issue"
const scaleOf = (kind: string) => (kind === "decoy" ? 2 : 4)

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}

/** Human ordinal per submission+item: median over graders (manual and review labels). */
function humanOrdinals(subs: Sub[], labels: Label[]) {
  const scen = new Map(subs.map((s) => [s._id, s.scenarioId]))
  const by = new Map<string, number[]>()
  for (const l of labels) {
    if (l.targetId === "__overall" || !l.outcome) continue
    const scenarioId = scen.get(l.submissionId)
    if (!scenarioId) continue
    const key = `${l.submissionId}|${l.targetId}`
    const ord = itemOrdinal(kindOf(scenarioId, l.targetId), l.outcome, l.explanation)
    by.set(key, [...(by.get(key) ?? []), ord])
  }
  return new Map([...by].map(([k, v]) => [k, median(v)]))
}

function agreement(pairs: Array<{ itemId: string; kind: string; council: number; human: number }>) {
  const byItem = new Map<string, typeof pairs>()
  for (const p of pairs) byItem.set(p.itemId, [...(byItem.get(p.itemId) ?? []), p])
  const perItem = [...byItem].map(([itemId, ps]) => {
    const k = scaleOf(ps[0].kind)
    const stat = (xs: typeof ps) => quadraticWeightedKappa(xs.map((x) => x.council), xs.map((x) => x.human), k)
    return { itemId, n: ps.length, kappa: stat(ps), ci: bootstrapCI(ps, stat) }
  })
  const issuePairs = pairs.filter((p) => p.kind === "issue")
  const pooledStat = (xs: typeof issuePairs) => quadraticWeightedKappa(xs.map((x) => x.council), xs.map((x) => x.human), 4)
  const detect = pairs.filter((p) => (p.council > 0) === (p.human > 0)).length
  return {
    perItem: perItem.sort((a, b) => a.itemId.localeCompare(b.itemId)),
    pooled: { n: issuePairs.length, kappa: issuePairs.length ? pooledStat(issuePairs) : NaN, ci: bootstrapCI(issuePairs, pooledStat) },
    detectionAccuracy: wilson(detect, pairs.length),
  }
}

export function goldenRunKappa(run: Run, human: Map<string, number>, scenarioOf: Map<string, string>) {
  const council: number[] = []
  const hum: number[] = []
  for (const r of run.runs) {
    const scenarioId = scenarioOf.get(r.label)
    if (!scenarioId) continue
    for (const it of r.items) {
      if (kindOf(scenarioId, it.id) !== "issue") continue
      const h = human.get(`${r.label}|${it.id}`)
      if (h === undefined) continue
      council.push(it.score)
      hum.push(h)
    }
  }
  return { n: council.length, kappa: council.length ? quadraticWeightedKappa(council, hum, 4) : NaN }
}

export function buildDashboard(subs: Sub[], labels: Label[], runs: Run[]) {
  // --- SM-1 / REL-2: council vs humans -------------------------------------
  const human = humanOrdinals(subs, labels)
  const pairs: Array<{ itemId: string; kind: string; council: number; human: number }> = []
  for (const s of subs) {
    for (const it of s.machine.items) {
      const h = human.get(`${s._id}|${it.id}`)
      if (h === undefined) continue
      pairs.push({ itemId: it.id, kind: it.kind, council: itemOrdinal(it.kind, it.outcome, it.explanation), human: h })
    }
  }

  // Human–human agreement: the first two manual graders on each submission.
  const hh: { a: number[]; b: number[] } = { a: [], b: [] }
  const manual = labels.filter((l) => l.source === "manual" && l.outcome && l.targetId !== "__overall")
  const bySub = new Map<string, Label[]>()
  for (const l of manual) bySub.set(l.submissionId, [...(bySub.get(l.submissionId) ?? []), l])
  const scen = new Map(subs.map((s) => [s._id, s.scenarioId]))
  for (const [sid, ls] of bySub) {
    const graders = [...new Set(ls.map((l) => l.grader))].sort()
    if (graders.length < 2) continue
    const scenarioId = scen.get(sid)
    if (!scenarioId) continue
    for (const l of ls.filter((x) => x.grader === graders[0])) {
      const other = ls.find((x) => x.grader === graders[1] && x.targetId === l.targetId)
      if (!other || kindOf(scenarioId, l.targetId) !== "issue") continue
      hh.a.push(itemOrdinal("issue", l.outcome!, l.explanation))
      hh.b.push(itemOrdinal("issue", other.outcome!, other.explanation))
    }
  }

  // Overall score vs human holistic score, and weight calibration (§11.2).
  const overallLabels = new Map<string, number[]>()
  for (const l of labels) if (l.targetId === "__overall" && l.overall !== undefined) overallLabels.set(l.submissionId, [...(overallLabels.get(l.submissionId) ?? []), l.overall])
  const scorePairs = subs
    .filter((s) => overallLabels.has(s._id))
    .map((s) => ({
      machine: s.machine.overall,
      human: mean(overallLabels.get(s._id)!),
      components: Object.fromEntries(Object.entries(s.machine.components).map(([k, c]) => [k, c.value])) as ComponentVec,
    }))
  const currentWeights = (subs[0]?.machine.weights ?? { detection: 0.45, precision: 0.2, decoyDiscipline: 0.1, explanationQuality: 0.15, verdict: 0.1 }) as ComponentVec
  const calibration = scorePairs.length ? fitWeights(scorePairs, currentWeights) : null

  // --- REL-4 inter-judge agreement, REL-5 evidence validity -----------------
  const fleissRows: number[][] = []
  const perModel = new Map<string, { agree: number; n: number; positives: number; validPositives: number }>()
  const m = (model: string) => {
    if (!perModel.has(model)) perModel.set(model, { agree: 0, n: 0, positives: 0, validPositives: 0 })
    return perModel.get(model)!
  }
  let unanimous = 0
  let judged = 0
  for (const s of subs) {
    for (const it of s.machine.items) {
      const valid = it.votes.filter((vt) => vt.valid)
      for (const vt of it.votes) {
        if (vt.decision) {
          m(vt.model).positives++
          if (vt.valid) m(vt.model).validPositives++
        }
      }
      if (valid.length >= 2) {
        judged++
        const yes = valid.filter((vt) => vt.decision).length
        const decision = yes > valid.length / 2
        if (yes === 0 || yes === valid.length) unanimous++
        for (const vt of valid) {
          m(vt.model).n++
          if (vt.decision === decision) m(vt.model).agree++
        }
        if (valid.length === 3) fleissRows.push([yes, 3 - yes])
      }
    }
    for (const e of s.machine.extraComments) {
      for (const vt of e.votes) {
        if (vt.discardedReason === "judge unavailable" || vt.discardedReason === "unparseable response") continue
        m(vt.model).positives++
        if (vt.valid) m(vt.model).validPositives++
      }
    }
  }
  const models = [...perModel].map(([model, x]) => ({
    model,
    consensusAgreement: wilson(x.agree, x.n),
    evidenceValidity: wilson(x.validPositives, x.positives),
    votes: x.n,
    positives: x.positives,
  }))
  const totalPos = models.reduce((a, x) => a + x.positives, 0)
  const totalValid = [...perModel.values()].reduce((a, x) => a + x.validPositives, 0)

  // --- SM-4 auto-resolution, SM-8 latency, NFR-COST-1 ----------------------
  const auto = wilson(subs.filter((s) => !s.machine.needsReview).length, subs.length)
  const latencies = subs.map((s) => (s.machine.gradedAt - s.submittedAt) / 1000).filter((x) => x >= 0)
  const calls = subs.map((s) => s.machine.callCount).filter((x): x is number => typeof x === "number")

  // --- Offline runs ----------------------------------------------------------
  const done = runs.filter((r) => r.status === "done").sort((a, b) => b.startedAt - a.startedAt)
  const latest = (kind: Run["kind"]) => done.find((r) => r.kind === kind)
  const retestRun = latest("retest")
  const pertRun = latest("perturbation")
  const advRun = latest("adversarial")
  const goldenRun = latest("golden")
  const baselineRun = done.find((r) => r.kind === "golden" && r.baseline)

  const orig = pertRun?.runs.find((r) => r.label === "original")
  const deltas = pertRun && orig ? pertRun.runs.filter((r) => r.label !== "original").map((r) => ({ label: r.label, delta: r.overall - orig.overall })) : []

  const evidenceRate = totalPos ? totalValid / totalPos : undefined
  let gate: null | { baselineId: string; candidateId: string; baselineKappa: number; candidateKappa: number; pass: boolean; failures: string[] } = null
  if (goldenRun && baselineRun && goldenRun._id !== baselineRun._id) {
    const b = goldenRunKappa(baselineRun, human, scen)
    const c = goldenRunKappa(goldenRun, human, scen)
    const res = regressionGate({ kappa: b.kappa }, { kappa: c.kappa, evidenceValidity: evidenceRate })
    gate = { baselineId: baselineRun._id, candidateId: goldenRun._id, baselineKappa: b.kappa, candidateKappa: c.kappa, ...res }
  }

  return {
    targets: TARGETS,
    counts: { graded: subs.length, goldenSubmissions: new Set(labels.map((l) => l.submissionId)).size, labels: labels.length },
    agreement: {
      ...agreement(pairs),
      humanHuman: { n: hh.a.length, kappa: hh.a.length ? quadraticWeightedKappa(hh.a, hh.b, 4) : NaN },
      score: { n: scorePairs.length, mae: scorePairs.length ? mean(scorePairs.map((p) => Math.abs(p.machine - p.human))) : NaN },
    },
    calibration,
    interJudge: { n: judged, fleiss: fleissRows.length ? fleissKappa(fleissRows) : NaN, unanimity: wilson(unanimous, judged) },
    models,
    evidence: wilson(totalValid, totalPos),
    autoResolution: auto,
    latency: { n: latencies.length, p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    cost: { meanCalls: calls.length ? mean(calls) : NaN, n: calls.length },
    retest: retestRun
      ? { runId: retestRun._id, n: retestRun.runs.length, std: stdDev(retestRun.runs.map((r) => r.overall)), scores: retestRun.runs.map((r) => r.overall) }
      : null,
    perturbation: pertRun
      ? { runId: pertRun._id, deltas, maxAbs: deltas.length ? Math.max(...deltas.map((d) => Math.abs(d.delta))) : 0 }
      : null,
    adversarial: advRun
      ? { runId: advRun._id, passed: advRun.runs.filter((r) => r.passed).length, total: advRun.runs.length, cases: advRun.runs.map((r) => ({ label: r.label, expectation: r.expectation ?? "", passed: !!r.passed, overall: r.overall })) }
      : null,
    golden: goldenRun ? { runId: goldenRun._id, ...goldenRunKappa(goldenRun, human, scen), isBaseline: !!goldenRun.baseline } : null,
    gate,
  }
}

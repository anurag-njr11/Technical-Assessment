// Deterministic scoring (spec §11). No LLM is involved here: this module turns
// verified item outcomes and comment classes into the reported score, and
// re-applies human overrides (HR-3) the same way every time.

import type { Infer } from "convex/values"
import type { resultValidator } from "./schema"

export type Result = Infer<typeof resultValidator>
export type ItemResult = Result["items"][number]
export type ExtraComment = Result["extraComments"][number]
export type CommentClass = "valid" | "false_alarm" | "nitpick" | "undetermined"

// Provisional until calibrated on the golden set (§11.2, AC-REL-1). Any change
// here must bump SCORING_VERSION and pass the regression gate (REL-7).
export const SCORING_VERSION = "scoring-2026-09-30"
export const WEIGHTS = {
  detection: 0.45,
  precision: 0.2,
  decoyDiscipline: 0.1,
  explanationQuality: 0.15,
  verdict: 0.1,
} as const
export type Weights = { [K in keyof typeof WEIGHTS]: number }

export const DIMENSIONS = {
  issueDetection: "Issue detection",
  engineeringJudgment: "Technical/engineering judgment",
  reasoning: "Reasoning & evidence-seeking",
  trustCalibration: "AI trust calibration",
  promptQuality: "Prompt quality",
  interactionQuality: "AI interaction quality",
  verification: "Verification/validation",
  efficiency: "Token usage & efficiency",
  challengeAssumptions: "Challenging incorrect AI assumptions",
}
export type DimKey = keyof typeof DIMENSIONS
type Trajectory = NonNullable<Result["trajectory"]>
export type Signal = NonNullable<Trajectory["dimensions"][number]["signals"]>[number]

/** Dimension score = round(100 * mean(signal values)); dimensions without signals are left out. */
export function dimensionsFrom(signals: Partial<Record<DimKey, Signal[]>>, notes: Partial<Record<DimKey, string>> = {}): Trajectory["dimensions"] {
  return (Object.keys(DIMENSIONS) as DimKey[])
    .filter((key) => signals[key]?.length)
    .map((key) => {
      const s = signals[key]!
      return {
        key, label: DIMENSIONS[key],
        score: Math.round((100 * s.reduce((t, x) => t + x.value, 0)) / s.length),
        detail: [notes[key], ...s.map((x) => `${x.label}: ${Math.round(100 * x.value)}%`)].filter(Boolean).join("; "),
        ...(notes[key] ? { note: notes[key] } : {}),
        signals: s,
      }
    })
}

/**
 * Re-scores trajectory dimensions after human overrides: deterministic signals follow the
 * (possibly overridden) components, overridden findings count the human's decision.
 * ponytail: the efficiency signal is not recomputed when a challenge finding flips; it keeps the machine count.
 */
export function rescoreTrajectory(t: Trajectory, components: Result["components"], human: Map<string, boolean>): Trajectory {
  const findings = t.findings.map((f) => {
    const d = human.get(f.id)
    if (d === undefined) return f
    const kind = f.dimension === "challengeAssumptions" && f.good ? (d ? ("detected" as const) : ("missed" as const)) : f.kind
    return { ...f, kind, humanDecision: d, overridden: true, needsReview: false }
  })
  // Results graded before signals were stored keep their dimension scores.
  if (t.dimensions.some((d) => !d.signals)) return { ...t, findings }
  const comp = components as Record<string, { value: number }>
  const sig: Partial<Record<DimKey, Signal[]>> = {}
  const notes: Partial<Record<DimKey, string>> = {}
  for (const d of t.dimensions) {
    sig[d.key as DimKey] = d.signals!.map((s) => (s.component && comp[s.component] ? { ...s, value: comp[s.component].value } : { ...s }))
    if (d.note) notes[d.key as DimKey] = d.note
  }
  for (const f of findings) {
    if (f.humanDecision === undefined || f.good === undefined) continue
    for (const dim of [f.dimension, ...(f.also ?? [])] as DimKey[]) {
      const list = (sig[dim] ??= [])
      const value = f.humanDecision === f.good ? 1 : 0
      const i = list.findIndex((s) => s.finding === f.id)
      if (i >= 0) list[i] = { ...list[i], value }
      else list.push({ label: f.good ? f.title : (f.goodTitle ?? `Avoided: ${f.title}`), value, finding: f.id })
    }
  }
  return { dimensions: dimensionsFrom(sig, notes), findings }
}

export function band(score: number): string {
  if (score >= 80) return "Strong"
  if (score >= 60) return "Meets bar"
  if (score >= 50) return "Borderline"
  return "Below bar"
}

type ScoreInput = {
  items: Array<Pick<ItemResult, "kind" | "weight" | "outcome" | "explanation">>
  commentClasses: CommentClass[]
  commentCount: number
  verdict: string
  expectedVerdict: string
  weights?: Weights
}

export function componentValues(input: ScoreInput) {
  const issues = input.items.filter((i) => i.kind === "issue" && i.outcome !== "not_exposed")
  const decoys = input.items.filter((i) => i.kind === "decoy")
  const found = issues.filter((i) => i.outcome === "found")

  const totalWeight = issues.reduce((s, i) => s + i.weight, 0)
  const foundWeight = found.reduce((s, i) => s + i.weight, 0)
  const detection = totalWeight ? foundWeight / totalWeight : 0

  const validN = input.commentClasses.filter((c) => c === "valid").length
  const falseN = input.commentClasses.filter((c) => c === "false_alarm").length
  const precision = validN + falseN > 0 ? validN / (validN + falseN) : input.commentCount === 0 ? 0 : 1

  const clean = decoys.filter((d) => d.outcome === "clean").length
  const decoyDiscipline = decoys.length ? clean / decoys.length : 1

  const expl = found.map((i) => (i.explanation ?? 0) / 2)
  const explanationQuality = expl.length ? expl.reduce((a, b) => a + b, 0) / expl.length : 0

  const verdictCorrect = input.verdict === input.expectedVerdict

  return {
    values: { detection, precision, decoyDiscipline, explanationQuality, verdict: verdictCorrect ? 1 : 0 },
    counts: { totalWeight, foundWeight, validN, falseN, clean, decoys: decoys.length, found: found.length, issues: issues.length },
    verdictCorrect,
  }
}

export function overallFrom(values: Record<keyof typeof WEIGHTS, number>, weights: Weights = WEIGHTS): number {
  let s = 0
  for (const k of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) s += weights[k] * values[k]
  return Math.round(100 * s)
}

export function computeScore(input: ScoreInput) {
  const weights = input.weights ?? WEIGHTS
  const { values, counts, verdictCorrect } = componentValues(input)
  const overall = overallFrom(values, weights)
  return {
    overall,
    band: band(overall),
    weights: { ...weights },
    foundCount: counts.found,
    issueCount: counts.issues,
    components: {
      detection: { value: values.detection, detail: `${counts.foundWeight} / ${counts.totalWeight} severity pts` },
      precision: { value: values.precision, detail: `${counts.validN} valid, ${counts.falseN} false alarm(s)` },
      decoyDiscipline: { value: values.decoyDiscipline, detail: `${counts.clean} / ${counts.decoys} decoys left alone` },
      explanationQuality: { value: values.explanationQuality, detail: `${counts.found} found issue(s) scored on impact + fix` },
      verdict: {
        value: values.verdict,
        detail: verdictCorrect
          ? "Correct verdict"
          : input.verdict === "none"
            ? "No verdict (auto-submitted)"
            : `Expected ${input.expectedVerdict.replace("_", " ")}`,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Human overrides (HR-2/HR-3)
// ---------------------------------------------------------------------------

export type Override =
  | { target: "item"; targetId: string; after: string; afterExplanation?: number | null; commentId?: string }
  | { target: "comment"; targetId: string; after: string }
  // Trajectory finding: after = "yes" | "no", the human's answer to the finding's question.
  | { target: "finding"; targetId: string; after: string }

export function extraClassToCommentClass(c: ExtraComment["classification"]): CommentClass {
  if (c === "valid_extra" || c === "matched") return "valid"
  if (c === "false_alarm") return "false_alarm"
  if (c === "nitpick") return "nitpick"
  return "undetermined"
}

/**
 * Applies overrides (oldest first; later ones win) to a machine result and
 * recomputes the score. Pure: the same inputs always give the same output.
 */
/** Half the deterministic grade, half the mean of the judged trajectory dimensions (except issueDetection). */
export function blendOverall(base: number, dimensions?: Array<{ key: string; score: number }>): number {
  const others = (dimensions ?? []).filter((d) => d.key !== "issueDetection")
  return others.length ? Math.round(0.5 * base + (0.5 * others.reduce((s, d) => s + d.score, 0)) / others.length) : base
}

export function applyOverrides(
  machine: Result,
  overrides: Override[],
  ctx: {
    comments: Array<{ id: string; file: string; line: number; text: string }>
    verdict: string
    expectedVerdict: string
    /** M3 Directed Build: the score comes from gradeBuild's components, not computeScore. */
    build?: boolean
  },
): Result {
  if (overrides.length === 0) return machine
  const items = machine.items.map((i) => ({ ...i }))
  const extras = machine.extraComments.map((e) => ({ ...e }))
  const classes = new Map((machine.commentClasses ?? []).map((c) => [c.commentId, c.cls]))
  const human = new Map<string, boolean>()

  for (const o of overrides) {
    if (o.target === "item") {
      const item = items.find((i) => i.id === o.targetId)
      if (!item) continue
      item.outcome = o.after as ItemResult["outcome"]
      item.explanation = item.kind === "issue" && o.after === "found" ? (o.afterExplanation ?? 0) : null
      item.overridden = true
      if (o.commentId) {
        const c = ctx.comments.find((x) => x.id === o.commentId)
        if (c) {
          item.commentId = c.id
          item.commentText = c.text
          item.commentFile = c.file
          item.commentLine = c.line
        }
      }
    } else if (o.target === "finding") {
      human.set(o.targetId, o.after === "yes")
    } else {
      const extra = extras.find((e) => e.commentId === o.targetId)
      if (extra) {
        extra.classification = o.after as ExtraComment["classification"]
        extra.overridden = true
      }
      classes.set(o.targetId, extraClassToCommentClass(o.after as ExtraComment["classification"]))
    }
  }

  const score = ctx.build
    ? buildScore(machine, items)
    : computeScore({
        items,
        commentClasses: [...classes.values()],
        commentCount: ctx.comments.length,
        verdict: ctx.verdict,
        expectedVerdict: ctx.expectedVerdict,
        weights: machine.weights,
      })
  const trajectory = machine.trajectory ? rescoreTrajectory(machine.trajectory, score.components, human) : undefined
  // Judged runs blend in the trajectory; if every judge failed there are no valid votes and it stays deterministic.
  const judged = machine.trajectory?.findings.some((f) => f.votes.some((v) => v.valid))
  const overall = judged ? blendOverall(score.overall, trajectory?.dimensions) : score.overall
  return {
    ...machine,
    ...score,
    ...(trajectory ? { trajectory } : {}),
    overall,
    band: band(overall),
    items,
    extraComments: extras,
    commentClasses: [...classes.entries()].map(([commentId, cls]) => ({ commentId, cls })),
    machine: { overall: machine.overall, band: machine.band },
    overrideCount: overrides.length,
  }
}

/** Directed Build: only the detection component depends on item outcomes (exposed faults fixed). */
function buildScore(machine: Result, items: ItemResult[]) {
  const exposed = items.filter((i) => i.kind === "issue" && i.outcome !== "not_exposed")
  const total = exposed.reduce((s, i) => s + i.weight, 0)
  const caught = exposed.filter((i) => i.outcome === "found").reduce((s, i) => s + i.weight, 0)
  const components = {
    ...machine.components,
    detection: { value: total ? caught / total : 1, detail: total ? `${caught} / ${total} pts of exposed faults fixed` : "No faults exposed" },
  }
  const values = Object.fromEntries(Object.entries(components).map(([k, c]) => [k, c.value])) as Record<keyof typeof WEIGHTS, number>
  const overall = overallFrom(values, machine.weights)
  return { overall, band: band(overall), components, foundCount: exposed.filter((i) => i.outcome === "found").length }
}

// ---------------------------------------------------------------------------
// Ordinal item scores used by the reliability metrics (REL-2)
// ---------------------------------------------------------------------------

/** Issues: missed=0, found with explanation e → 1+e (1..3). Decoys: clean=0, false_alarm=1. */
export function itemOrdinal(kind: "issue" | "decoy", outcome: string, explanation: number | null | undefined): number {
  if (kind === "decoy") return outcome === "false_alarm" ? 1 : 0
  return outcome === "found" ? 1 + Math.max(0, Math.min(2, explanation ?? 0)) : 0
}

import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { ANSWER_KEYS, SCENARIO_META } from "./answerKey"
import type { AnswerKey, KeyItem } from "./answerKey"
import { PROMPT_VERSION, RUBRIC_VERSION, getPanel, liveAsker, redact } from "./judges"
import type { Asker, Judge, JudgeAnswer, Trace } from "./judges"
import { SCORING_VERSION, computeScore } from "./scoring"
import { gradeBuild } from "./buildScenario"
import { applyConfig } from "./items"
import type { CommentClass, ExtraComment, ItemResult, Result } from "./scoring"

/*
 * ReviewBench grading pipeline (spec §10)
 *
 * 1. Location matching (deterministic): comment within ±3 lines of a key item.
 * 2. Checklist council: 3 judges from different model families answer narrow
 *    yes/no questions per (comment, item) pair. No holistic scores.
 * 3. Evidence verification: a positive vote must quote text that actually
 *    appears in the (anonymized) comment, otherwise the vote is discarded.
 * 4. Unmatched comments are classified by the council.
 * 5. Majority vote over valid votes; splits / low quorum on critical or high
 *    items escalate to a human.
 * 6. Deterministic score computation (convex/scoring.ts).
 *
 * gradeSubmission() is pure apart from the injected Asker, so the production
 * grader, test–retest, perturbation, golden-set and adversarial runs all share
 * exactly the same logic.
 */

export const LINE_WINDOW = 3

export type Comment = { id: string; file: string; line: number; severity: string; text: string }
type Vote = ItemResult["votes"][number]
type ClassifyVote = ExtraComment["votes"][number]

type Consensus = {
  decision: boolean
  impact: boolean
  fix: boolean
  constructive: boolean
  validCount: number
  unanimous: boolean
  votes: Vote[]
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function evidenceIsReal(evidence: string, comment: string): boolean {
  const e = normalize(evidence)
  return e.length >= 3 && normalize(comment).includes(e)
}

export function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json|```/g, "")
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function snippetFor(item: KeyItem): string {
  return `File: ${item.file}, lines ${item.lineStart}-${item.lineEnd}`
}

export type Example = { itemId: string; text: string; identified: boolean }

function tokens(s: string) {
  return new Set(s.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 2))
}

/** KA-2: the most lexically similar human-graded examples for this item (embeddings: later). */
export function pickExamples(examples: Example[], itemId: string, text: string, k = 2): Example[] {
  const q = tokens(text)
  return examples
    .filter((e) => e.itemId === itemId)
    .map((e) => {
      const t = tokens(e.text)
      const inter = [...t].filter((w) => q.has(w)).length
      return { e, sim: inter / (t.size + q.size - inter || 1) }
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
    .map((x) => x.e)
}

function examplesBlock(examples: Example[]): string {
  if (!examples.length) return ""
  return `
Calibration examples graded by human reviewers (for reference only; they are not the comment you are grading):
${examples.map((e) => `- "${e.text.slice(0, 300)}" -> identifies_issue: ${e.identified}`).join("\n")}
`
}

function issuePrompt(item: KeyItem, comment: Comment, examples: Example[] = []): string {
  return `Answer-key issue (known planted defect):
- Title: ${item.title}
- Location: ${snippetFor(item)}
- What is wrong: ${item.description}
- Acceptable fix: ${item.acceptableFix}
${examplesBlock(examples)}
<candidate_comment file="${comment.file}" line="${comment.line}">
${comment.text}
</candidate_comment>

Checklist:
1. identifies_issue: Does the comment identify THIS SAME underlying problem (not just the same line, not a different problem)?
2. states_impact: Does the comment state a concrete consequence (crash, wrong data, security risk, etc.)?
3. proposes_fix: Does the comment propose a fix consistent with the acceptable fix?
4. constructive: Is the comment specific and actionable, so the author could act on it without guessing?
5. evidence: If identifies_issue is true, copy an exact verbatim phrase (3-20 words) from the candidate comment that shows it. Otherwise "".

Return JSON: {"identifies_issue": boolean, "states_impact": boolean, "proposes_fix": boolean, "constructive": boolean, "evidence": string}`
}

function decoyPrompt(item: KeyItem, comment: Comment): string {
  return `The following code behavior is INTENTIONAL and correct (it is required by the ticket):
- ${item.title}
- Location: ${snippetFor(item)}
- Why it is correct: ${item.description}

<candidate_comment file="${comment.file}" line="${comment.line}">
${comment.text}
</candidate_comment>

Checklist:
1. objects_to_behavior: Does the comment treat THIS intentional behavior as a defect or ask for it to be changed?
2. evidence: If objects_to_behavior is true, copy an exact verbatim phrase (3-20 words) from the comment that shows it. Otherwise "".

Return JSON: {"objects_to_behavior": boolean, "evidence": string}`
}

function classifyPrompt(items: KeyItem[], comment: Comment): string {
  const list = items
    .filter((i) => i.kind === "issue")
    .map((i) => `- ${i.id}: ${i.title} (${i.file} ${i.lineStart}-${i.lineEnd})`)
    .join("\n")
  return `Known planted issues in this pull request:
${list}

<candidate_comment file="${comment.file}" line="${comment.line}">
${comment.text}
</candidate_comment>

Checklist:
1. matches_item_id: If the comment describes one of the known issues above (even if it was left on a different line), give its id. Otherwise null.
2. classification: If it matches no known issue, is it "valid_extra" (a real, correct problem not in the list), "nitpick" (style or preference, harmless), or "false_alarm" (claims a defect that is not actually a defect)? If it matches a known issue, use "matched".
3. evidence: exact verbatim phrase (3-20 words) from the comment supporting your answer.

Return JSON: {"matches_item_id": string | null, "classification": "matched" | "valid_extra" | "nitpick" | "false_alarm", "evidence": string}`
}

function followUpPrompt(question: string, answer: string): string {
  return `Follow-up question from a code-review assessment:
"${question}"

<candidate_answer>
${answer}
</candidate_answer>

Checklist:
1. addresses_question: Does the answer actually answer this question?
2. specific: Does it refer to concrete code, data, parameters or steps from the scenario rather than generic advice?
3. actionable: Does it give concrete checks, tests or instructions someone could carry out?
4. evidence: exact verbatim phrase (3-20 words) from the answer supporting your answers, or "" if all are false.

Return JSON: {"addresses_question": boolean, "specific": boolean, "actionable": boolean, "evidence": string}`
}

function unavailableVote(judge: Judge, a: JudgeAnswer, reason: string): Vote {
  return { judge: judge.name, model: a.model, family: a.family, decision: false, impact: false, fix: false, evidence: "", valid: false, discardedReason: reason }
}

export function tally(votes: Vote[]): Consensus {
  const valid = votes.filter((v) => v.valid)
  const yes = valid.filter((v) => v.decision)
  const decision = valid.length >= 2 && yes.length > valid.length / 2
  const agreeing = valid.filter((v) => v.decision === decision)
  const majority = (pick: (v: Vote) => boolean) =>
    agreeing.length > 0 && agreeing.filter(pick).length > agreeing.length / 2
  return {
    decision,
    impact: decision && majority((v) => v.impact),
    fix: decision && majority((v) => v.fix),
    constructive: decision && majority((v) => v.constructive === true),
    validCount: valid.length,
    unanimous: valid.length > 0 && valid.every((v) => v.decision === valid[0].decision),
    votes,
  }
}

function near(item: KeyItem, c: Comment): boolean {
  return (
    item.file === c.file &&
    c.line >= item.lineStart - LINE_WINDOW &&
    c.line <= item.lineEnd + LINE_WINDOW
  )
}

export type GradeInput = {
  comments: Comment[]
  verdict: string
  candidateName?: string
  candidateEmail?: string
  /** SCR-1: scored with a checklist, reported but not weighted into the score yet. */
  followUps?: Array<{ question: string; answer: string }>
}

export async function gradeSubmission(
  input: GradeInput,
  key: AnswerKey,
  ask: Asker,
  panel: Judge[] = getPanel(),
  opts: { examples?: Example[] } = {},
): Promise<Result> {
  const examples = opts.examples ?? []
  const identity = { name: input.candidateName, email: input.candidateEmail }
  // FB-1: judges only ever see the anonymized text, and evidence is checked against it.
  const comments: Comment[] = input.comments.map((c) => ({ ...c, text: redact(c.text, identity) }))
  const original = new Map(input.comments.map((c) => [c.id, c.text]))
  const modelsUsed = new Set<string>()
  let callCount = 0

  const askAll = async (prompt: string, stage: string) => {
    const answers = await Promise.all(panel.map((j) => ask(j, prompt, stage)))
    callCount += answers.length
    for (const a of answers) if (!("error" in a)) modelsUsed.add(a.model)
    return answers
  }

  const councilIssue = async (item: KeyItem, comment: Comment): Promise<Consensus> => {
    const answers = await askAll(issuePrompt(item, comment, pickExamples(examples, item.id, comment.text)), `issue:${item.id}`)
    const votes: Vote[] = answers.map((a, idx) => {
      const judge = panel[idx]
      if ("error" in a) return unavailableVote(judge, a, "judge unavailable")
      const j = parseJson(a.text)
      if (!j) return unavailableVote(judge, a, "unparseable response")
      const decision = j.identifies_issue === true
      const evidence = typeof j.evidence === "string" ? j.evidence : ""
      const vote: Vote = {
        judge: judge.name, model: a.model, family: a.family, decision,
        impact: j.states_impact === true, fix: j.proposes_fix === true, constructive: j.constructive === true, evidence, valid: true,
      }
      if (decision && !evidenceIsReal(evidence, comment.text)) {
        vote.valid = false
        vote.discardedReason = "quoted evidence not found in the comment"
      }
      return vote
    })
    return tally(votes)
  }

  const councilDecoy = async (item: KeyItem, comment: Comment): Promise<Consensus> => {
    const answers = await askAll(decoyPrompt(item, comment), `decoy:${item.id}`)
    const votes: Vote[] = answers.map((a, idx) => {
      const judge = panel[idx]
      if ("error" in a) return unavailableVote(judge, a, "judge unavailable")
      const j = parseJson(a.text)
      if (!j) return unavailableVote(judge, a, "unparseable response")
      const decision = j.objects_to_behavior === true
      const evidence = typeof j.evidence === "string" ? j.evidence : ""
      const vote: Vote = { judge: judge.name, model: a.model, family: a.family, decision, impact: false, fix: false, evidence, valid: true }
      if (decision && !evidenceIsReal(evidence, comment.text)) {
        vote.valid = false
        vote.discardedReason = "quoted evidence not found in the comment"
      }
      return vote
    })
    return tally(votes)
  }

  const councilClassify = async (comment: Comment) => {
    const answers = await askAll(classifyPrompt(key.items, comment), "classify")
    const votes: ClassifyVote[] = answers.map((a, idx) => {
      const judge = panel[idx]
      if ("error" in a) return { judge: judge.name, model: a.model, family: a.family, answer: "", valid: false, discardedReason: "judge unavailable" }
      const j = parseJson(a.text)
      if (!j) return { judge: judge.name, model: a.model, family: a.family, answer: "", valid: false, discardedReason: "unparseable response" }
      const matched =
        typeof j.matches_item_id === "string" && key.items.some((i) => i.id === j.matches_item_id && i.kind === "issue")
          ? (j.matches_item_id as string)
          : null
      const cls = typeof j.classification === "string" ? j.classification : ""
      const answer = matched ? `matched:${matched}` : cls
      const evidence = typeof j.evidence === "string" ? j.evidence : ""
      // GR-11: classification votes need real evidence regardless of outcome.
      if (!evidenceIsReal(evidence, comment.text)) {
        return { judge: judge.name, model: a.model, family: a.family, answer, evidence, valid: false, discardedReason: "quoted evidence not found in the comment" }
      }
      return { judge: judge.name, model: a.model, family: a.family, answer, evidence, valid: true }
    })
    const counts = new Map<string, number>()
    for (const vt of votes) if (vt.valid) counts.set(vt.answer, (counts.get(vt.answer) ?? 0) + 1)
    const validCount = votes.filter((vt) => vt.valid).length
    let winner = ""
    for (const [answer, n] of counts) if (n > validCount / 2 && validCount >= 2) winner = answer
    return { winner, votes }
  }

  const issues = key.items.filter((i) => i.kind === "issue")
  const decoys = key.items.filter((i) => i.kind === "decoy")
  const itemState = new Map<string, { consensus: Consensus; comment: Comment } | null>()
  for (const i of key.items) itemState.set(i.id, null)
  const commentClass = new Map<string, CommentClass>()
  const extraComments: ExtraComment[] = []
  const reviewReasons: string[] = []

  const record = (item: KeyItem, consensus: Consensus, c: Comment) => {
    const prev = itemState.get(item.id)
    // GR-18: the best pair wins (a positive consensus from any comment).
    if (!prev || (!prev.consensus.decision && consensus.decision)) itemState.set(item.id, { consensus, comment: c })
    return consensus.decision
  }

  for (const c of comments) {
    const nearIssues = issues.filter((i) => near(i, c))
    const nearDecoys = decoys.filter((i) => near(i, c))
    const issueHits = await Promise.all(nearIssues.map(async (i) => record(i, await councilIssue(i, c), c)))
    const decoyHits = await Promise.all(nearDecoys.map(async (d) => record(d, await councilDecoy(d, c), c)))
    let identified = issueHits.some(Boolean)
    const objected = decoyHits.some(Boolean)

    if (!identified && !objected) {
      const cls = await councilClassify(c)
      let matchedId: string | undefined
      if (cls.winner.startsWith("matched:")) {
        matchedId = cls.winner.slice("matched:".length)
        const item = issues.find((i) => i.id === matchedId)
        if (item) identified = record(item, await councilIssue(item, c), c)
      }
      if (!identified) {
        let label: ExtraComment["classification"]
        if (matchedId) {
          // GR-15: the panel thinks it refers to a known issue but won't confirm it identifies the problem.
          label = "vague_match"
          const title = key.items.find((i) => i.id === matchedId)?.title ?? matchedId
          reviewReasons.push(`Vague comment at ${c.file}:${c.line} may refer to "${title}" but the panel could not confirm it identifies the problem`)
        } else if (cls.winner === "valid_extra" || cls.winner === "nitpick" || cls.winner === "false_alarm") {
          label = cls.winner
        } else {
          label = "undetermined"
          reviewReasons.push(`The panel could not classify the comment at ${c.file}:${c.line}`)
        }
        extraComments.push({
          commentId: c.id,
          text: original.get(c.id) ?? c.text,
          file: c.file,
          line: c.line,
          classification: label,
          ...(matchedId ? { matchedItemId: matchedId } : {}),
          votes: cls.votes,
        })
        commentClass.set(
          c.id,
          label === "valid_extra" ? "valid" : label === "false_alarm" ? "false_alarm" : label === "nitpick" ? "nitpick" : "undetermined",
        )
        continue
      }
    }
    commentClass.set(c.id, identified ? "valid" : objected ? "false_alarm" : "undetermined")
  }

  const items: ItemResult[] = key.items.map((item) => {
    const st = itemState.get(item.id)
    const consensus = st?.consensus
    const outcome: ItemResult["outcome"] =
      item.kind === "issue" ? (consensus?.decision ? "found" : "missed") : consensus?.decision ? "false_alarm" : "clean"
    const split = !!consensus && !consensus.unanimous
    const lowQuorum = !!consensus && consensus.validCount < 2
    if (consensus && (item.severity === "critical" || item.severity === "high")) {
      if (split) reviewReasons.push(`Judges disagreed on "${item.title}"`)
      if (lowQuorum) reviewReasons.push(`Fewer than 2 usable judge votes on "${item.title}"`)
    }
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      category: item.category,
      severity: item.severity,
      weight: item.weight,
      outcome,
      explanation: item.kind === "issue" && consensus?.decision ? (consensus.impact ? 1 : 0) + (consensus.fix ? 1 : 0) : null,
      commentId: st?.comment.id ?? null,
      commentText: st ? (original.get(st.comment.id) ?? st.comment.text) : null,
      commentLine: st?.comment.line ?? null,
      commentFile: st?.comment.file ?? null,
      split,
      lowQuorum,
      constructive: consensus?.decision ? consensus.constructive : undefined,
      votes: consensus?.votes ?? [],
    }
  })

  // SCR-1: follow-up answers, one checklist per answer.
  let followUpQuality: Result["followUpQuality"]
  const fus = (input.followUps ?? []).filter((f) => f.answer.trim())
  if (fus.length) {
    const scored = await Promise.all(
      fus.map(async (f) => {
        const text = redact(f.answer, identity)
        const answers = await askAll(followUpPrompt(f.question, text), "followup")
        const valid = answers
          .map((a) => ("error" in a ? null : parseJson(a.text)))
          .filter((j): j is Record<string, unknown> => !!j)
          .filter((j) => {
            const any = j.addresses_question === true || j.specific === true || j.actionable === true
            return !any || evidenceIsReal(typeof j.evidence === "string" ? j.evidence : "", text)
          })
        const maj = (k: string) => valid.length >= 2 && valid.filter((j) => j[k] === true).length > valid.length / 2
        const score = ["addresses_question", "specific", "actionable"].filter(maj).length
        return { question: f.question, score, votes: valid.length }
      }),
    )
    const value = scored.reduce((s2, x) => s2 + x.score, 0) / (3 * scored.length)
    followUpQuality = { value, detail: `${scored.map((x) => x.score).join(" + ")} of ${3 * scored.length} checklist points`, answers: scored }
  }

  // SCR-2: communication = share of found issues explained constructively.
  const foundIssues = items.filter((i) => i.kind === "issue" && i.outcome === "found")
  const communication = foundIssues.length
    ? { value: foundIssues.filter((i) => i.constructive).length / foundIssues.length, detail: `${foundIssues.filter((i) => i.constructive).length} / ${foundIssues.length} found issues explained specifically and actionably` }
    : undefined

  const score = computeScore({
    items,
    commentClasses: [...commentClass.values()],
    commentCount: comments.length,
    verdict: input.verdict,
    expectedVerdict: key.expectedVerdict,
  })

  const reasons = [...new Set(reviewReasons)]
  return {
    ...score,
    items,
    extraComments,
    commentClasses: [...commentClass.entries()].map(([commentId, cls]) => ({ commentId, cls })),
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    judges: panel.map((j) => ({ name: j.name, model: j.primary.model, family: j.primary.family })),
    versions: {
      rubric: RUBRIC_VERSION,
      prompt: PROMPT_VERSION,
      scoring: SCORING_VERSION,
      scenario: SCENARIO_META[key.scenarioId]?.version ?? 1,
    },
    modelsUsed: [...modelsUsed].sort(),
    callCount,
    ...(followUpQuality ? { followUpQuality } : {}),
    ...(communication ? { communication } : {}),
    ...(examples.length ? { ragExamples: examples.length } : {}),
    gradedAt: Date.now(),
  }
}

export const grade = internalAction({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, args) => {
    const sub = await ctx.runQuery(internal.submissions.getInternal, { id: args.submissionId })
    if (!sub) return
    const key = ANSWER_KEYS[sub.scenarioId]
    if (!key) {
      await ctx.runMutation(internal.submissions.saveError, { id: args.submissionId, error: "Unknown scenario" })
      return
    }
    const traces: Trace[] = []
    try {
      const meta = SCENARIO_META[sub.scenarioId]
      if (meta?.kind === "build") {
        const result = gradeBuild(sub.scenarioId, sub.build?.code ?? "", sub.build?.events ?? [])
        await ctx.runMutation(internal.submissions.saveResult, { id: args.submissionId, result })
        return
      }
      const config = await ctx.runQuery(internal.items.configInternal, { scenarioId: sub.scenarioId })
      const examples = process.env.RAG_EXAMPLES === "on"
        ? await ctx.runQuery(internal.golden.examplesInternal, { scenarioId: sub.scenarioId })
        : []
      const configured = applyConfig(key, config)
      const result = await gradeSubmission(
        {
          comments: sub.comments,
          verdict: sub.verdict,
          candidateName: sub.candidateName,
          candidateEmail: sub.candidateEmail,
          followUps: meta?.kind === "code" ? sub.followUps : undefined,
        },
        configured.key,
        liveAsker(traces),
        undefined,
        { examples },
      )
      if (configured.note) result.configNote = configured.note
      await ctx.runMutation(internal.submissions.saveResult, { id: args.submissionId, result })
    } catch (err) {
      await ctx.runMutation(internal.submissions.saveError, {
        id: args.submissionId,
        error: err instanceof Error ? err.message : "Grading failed",
      })
    } finally {
      if (traces.length) {
        await ctx.runMutation(internal.tracing.record, {
          submissionId: args.submissionId,
          promptVersion: PROMPT_VERSION,
          traces,
        })
      }
    }
  },
})

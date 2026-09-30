// FR-R-16: structured interview questions generated from a candidate's result.
// Deterministic templates keyed by category, so every candidate with the same
// gap gets the same question (structured interviews are the most predictive).

type Item = { id: string; kind: 'issue' | 'decoy'; title: string; category: string; outcome: string; explanation: number | null }

const PROBES: Record<string, string> = {
  Security: 'Walk me through how you check a change that handles user input or money for security problems. What do you look for first?',
  Hallucination: 'When an AI suggests a helper or API call you have not seen before, how do you verify it exists and does what it claims?',
  Correctness: 'Pick a piece of logic with boundaries (pagination, limits, totals). How would you convince yourself it is correct?',
  'Edge cases': 'What inputs would you try first to break this kind of code, and why those?',
  'Test quality': 'What makes a test prove behaviour rather than just pass? Give an example of a test you would add here.',
  Performance: 'How would you tell whether this change will be slow at 10× the data? What would you measure?',
  Convention: 'How do you decide when new code should reuse an existing layer instead of doing its own thing?',
}

export function interviewQuestions(items: Item[], kind: string): Array<{ q: string; why: string }> {
  const out: Array<{ q: string; why: string }> = []
  const seen = new Set<string>()
  for (const i of items) {
    if (i.kind !== 'issue' || i.outcome !== 'missed' || seen.has(i.category)) continue
    seen.add(i.category)
    out.push({
      q: kind === 'decision' ? `The recommendation had a problem around "${i.title.toLowerCase()}". How would you evaluate that part of a proposal?` : PROBES[i.category] ?? `How would you catch a problem like "${i.title}"?`,
      why: `missed: ${i.title}`,
    })
  }
  const found = items.find((i) => i.kind === 'issue' && i.outcome === 'found' && (i.explanation ?? 2) < 2)
  if (found) out.push({ q: `You spotted "${found.title}". What is the concrete impact, and exactly how would you fix it?`, why: 'found, but explanation was incomplete' })
  const decoy = items.find((i) => i.kind === 'decoy' && i.outcome === 'false_alarm')
  if (decoy) out.push({ q: `You flagged "${decoy.title}". Re-read the requirements: is it really a problem? How do you check your own review comments?`, why: 'false alarm on correct behaviour' })
  if (kind === 'build') out.push({ q: 'Which assistant suggestions did you trust without checking, and why those?', why: 'calibrated trust' })
  return out.slice(0, 5)
}

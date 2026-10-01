import { Link, createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/rb'
import { WEIGHTS } from '@/convex/scoring'
import { MODULE_LABEL, SCENARIOS } from '@/lib/scenario'
import siteMetadata from '@/metadata.json'
import {
  AnswerKeyDiagram,
  ChecklistDiagram,
  ConsensusDiagram,
  CouncilDiagram,
  EvidenceDiagram,
  HumanDiagram,
  MatchingDiagram,
  OverviewFlow,
  ScoreDiagram,
} from '@/components/grading-diagrams'

const meta = siteMetadata['/methodology']

export const Route = createFileRoute('/methodology')({
  head: () => ({ meta: [{ title: meta.title }, { name: 'description', content: meta.description }] }),
  component: Methodology,
})

const COMPONENTS: Array<[keyof typeof WEIGHTS, string, string]> = [
  ['detection', 'Detection', 'Share of planted problems found, weighted by severity'],
  ['precision', 'Precision', 'Valid comments ÷ (valid + false alarms); nitpicks are neutral'],
  ['decoyDiscipline', 'Decoy discipline', 'Correct-but-suspicious code left alone'],
  ['explanationQuality', 'Explanation', 'For each found problem: states the impact, proposes a fix'],
  ['verdict', 'Verdict', 'Approve or request changes, matching the expected decision'],
]

const SECTIONS = [
  ['modules', 'Modules'],
  ['pipeline', 'How grading works'],
  ['steps', 'Step by step'],
  ['weights', 'Score weights'],
  ['checks', 'How we check the checker'],
  ['rights', 'Candidate rights'],
  ['notice', 'Notice template'],
] as const

function H({ id, children }: { id: (typeof SECTIONS)[number][0]; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 scroll-mt-24 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>
}

const STEPS: Array<{ title: string; body: React.ReactNode; diagram: React.ReactNode }> = [
  {
    title: 'Every scenario has a fixed answer key',
    body: 'An AI wrote the code (or plan) the candidate reviews, and we planted specific problems in it on purpose. We also added decoys: code that looks wrong but is actually fine. Every candidate on the same version sees exactly the same problems, so scores are comparable.',
    diagram: <AnswerKeyDiagram />,
  },
  {
    title: 'Comments are matched to the answer key by location',
    body: 'Ordinary code pairs each review comment with any planted item within 3 lines of it. This narrows each question down to “does this comment describe that problem?”',
    diagram: <MatchingDiagram />,
  },
  {
    title: 'Three independent AI judges look at each match',
    body: 'Instead of trusting one AI, a council of three from different companies looks at the same comment separately. Their mistakes are less likely to line up.',
    diagram: <CouncilDiagram />,
  },
  {
    title: 'Judges only answer yes/no questions',
    body: 'Each judge gets the same short checklist. A question counts as “yes” when most usable votes say yes.',
    diagram: <ChecklistDiagram />,
  },
  {
    title: 'Every “yes” must be backed by the candidate’s own words',
    body: 'A judge that says “yes, they found it” has to copy the exact phrase from the candidate’s comment that proves it. Code then checks the phrase is really there.',
    diagram: <EvidenceDiagram />,
  },
  {
    title: 'Majority decides — and unclear cases go to a person',
    body: 'When the judges agree, the result stands. When they split on a serious problem, or too few votes survived the proof check, the system flags it for a human instead of guessing.',
    diagram: <ConsensusDiagram />,
  },
  {
    title: 'Code calculates the score with a published formula',
    body: 'The AI never picks a number. Code adds up five parts with fixed weights, then places the total in a band.',
    diagram: <ScoreDiagram />,
  },
  {
    title: 'People stay in charge',
    body: 'ReviewBench informs hiring decisions; it never makes them.',
    diagram: <HumanDiagram />,
  },
]

// TR-2 published weights, TR-6 technical manual (summary), CO-1..CO-5 notices.
function Methodology() {
  return (
    <Page
      subtitle="Methodology"
      right={<Link to="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Home</Link>}
    >
      <PageHeader
        eyebrow="Technical manual · summary"
        title="How ReviewBench grades"
        description="ReviewBench measures how well engineers validate and direct AI-generated work. Every candidate on a given scenario version sees the same planted problems, so results are comparable. AI judges answer narrow yes/no questions; ordinary code, not an AI, computes the score. ReviewBench informs hiring decisions and never makes them."
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">On this page</p>
            <ul className="mt-3 space-y-1 border-l border-border text-sm">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

      <article className="min-w-0 max-w-3xl text-[15px] leading-relaxed">
        <H id="modules">Modules</H>
        <ul className="rb-stagger mt-4 grid gap-3 sm:grid-cols-2">
          {Object.values(SCENARIOS).map((s) => (
            <li key={s.id} className="flex flex-col rounded-xl border border-border bg-card px-4 py-3.5 text-sm">
              <span className="text-xs font-semibold text-primary">{MODULE_LABEL[s.kind]}</span>
              <span className="mt-1 font-medium">{s.title}</span>
              <span className="mt-auto pt-2 text-xs text-muted-foreground">{s.level} · {s.minutes} min</span>
            </li>
          ))}
        </ul>

        <H id="pipeline">How grading works</H>
        <p className="mt-3 text-muted-foreground">
          In one sentence: <span className="font-medium text-foreground">AI judges answer simple yes/no questions and must prove each answer
          with a quote; ordinary code checks the proof, counts the votes and does the maths.</span> Anything unclear goes to a person.
        </p>
        <OverviewFlow />

        <H id="steps">Step by step</H>
        <ol className="mt-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative border-l border-border pb-10 pl-8 last:border-transparent last:pb-0">
              <span className="absolute -left-4 top-6 grid size-8 place-items-center rounded-full border border-primary/40 bg-accent font-mono text-sm font-semibold text-accent-foreground">
                {i + 1}
              </span>
              <h3 className="pt-7 text-base font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              {s.diagram}
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-xl border border-border bg-card p-5 text-sm">
          <p className="font-semibold">Directed Build adds one more thing: how you worked with the AI</p>
          <p className="mt-1 text-muted-foreground">
            In the build module the same council also reads the candidate’s chat with the assistant and their test runs — did they check the
            AI’s output, push back when it was wrong, give clear instructions? The final score is half the outcome (above) and half these
            working-style dimensions, each backed by cited moments from the session.
          </p>
        </div>

        <H id="weights">Score weights (Code and Decision Review)</H>
        <p className="mt-3 text-sm text-muted-foreground">The full table behind step 7.</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <tbody>
            {COMPONENTS.map(([k, name, desc]) => (
              <tr key={k} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold">{name}</td>
                <td className="py-3 text-muted-foreground">{desc}</td>
                <td className="w-32 px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 w-14 rounded-full bg-muted sm:block"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(WEIGHTS[k] * 100)}%` }} /></div>
                    <span className="font-mono">{Math.round(WEIGHTS[k] * 100)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Bands: Strong ≥ 80 · Meets bar 60–79 · Borderline 50–59 · Below bar &lt; 50. Weights and bands are provisional
          until calibrated against human graders; follow-up answers and communication are reported but not yet weighted.
          The Directed Build pilot uses the same five slots for faults fixed, calibrated trust, testing, instruction quality
          and task completion.
        </p>

        <H id="checks">How we check the checker</H>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Agreement with expert human graders (quadratic weighted kappa, target ≥ 0.70), with confidence intervals.</li>
          <li>Test–retest stability (same work graded 5 times, target ≤ 2 points spread).</li>
          <li>Perturbation tests: renamed candidates, reformatting, reordering, verbosity and prompt-injection strings must not move scores by more than 3 points.</li>
          <li>Adverse-impact monitoring with the four-fifths rule, where group data is collected lawfully and with consent.</li>
          <li>A regression gate: any change to prompts, rubric, models or weights is re-run on the golden set before release.</li>
        </ul>

        <H id="rights">Candidate rights</H>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>You are told in advance that the work was written by an AI and may contain mistakes.</li>
          <li>You can ask for extra time as an accommodation; the hiring team sets it before you start.</li>
          <li>If the hiring team shares your results, you see how your score was built, and you can request a human review.</li>
          <li>You can ask the hiring team to delete your submission.</li>
        </ul>

        <H id="notice">Notice template for hiring teams</H>
        <blockquote className="mt-3 rounded-xl border border-border border-l-4 border-l-primary bg-card p-5 text-sm text-muted-foreground">
          As part of this process you will take a ReviewBench assessment. An automated tool, supervised by our hiring team,
          assesses how you review AI-written work against a fixed answer key. It does not make hiring decisions. You can
          request an accommodation, an explanation of your results, or a human review of your assessment by contacting us.
          Where required (for example NYC Local Law 144), this notice is given at least 10 business days before the
          assessment, and a summary of our latest bias audit is available on request.
        </blockquote>
        <p className="mt-3 text-xs text-muted-foreground">Templates are provided for convenience and need review by your own counsel before use.</p>
      </article>
      </div>
    </Page>
  )
}

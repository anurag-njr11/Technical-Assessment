import { Link, createFileRoute } from '@tanstack/react-router'
import { Page, PageHeader } from '@/components/rb'
import { WEIGHTS } from '@/convex/scoring'
import { MODULE_LABEL, SCENARIOS } from '@/lib/scenario'
import siteMetadata from '@/metadata.json'

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
  ['pipeline', 'The grading pipeline'],
  ['weights', 'Score weights'],
  ['checks', 'How we check the checker'],
  ['rights', 'Candidate rights'],
  ['notice', 'Notice template'],
] as const

function H({ id, children }: { id: (typeof SECTIONS)[number][0]; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 scroll-mt-24 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>
}

const PIPELINE: Array<[string, string]> = [
  ['Location matching.', 'A comment is compared with planted items within 3 lines of it.'],
  ['A council of three judges', "from different model families answers checklist questions independently at temperature 0. If a judge's model fails, it falls back to a model from a family not already on the panel."],
  ['Evidence verification.', 'Every "yes" must quote the candidate\'s own words; code checks the quote really appears, and discards the vote if not.'],
  ['Anonymization.', 'Judges never see names or email addresses, even if typed into a comment.'],
  ['Consensus and escalation.', 'A majority of valid votes decides. Split votes or too few valid votes on serious items go to a person.'],
  ['Deterministic scoring', 'with the published weights below. Human reviewers can override an item with a written justification; every override is logged.'],
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

      <article className="max-w-3xl text-[15px] leading-relaxed">
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

        <H id="pipeline">The grading pipeline</H>
        <ol className="mt-4 space-y-3">
          {PIPELINE.map(([title, body], i) => (
            <li key={title} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent font-mono text-xs font-semibold text-accent-foreground">{i + 1}</span>
              <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{title}</span> {body}</p>
            </li>
          ))}
        </ol>

        <H id="weights">Score weights (Code and Decision Review)</H>
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

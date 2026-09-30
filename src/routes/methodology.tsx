import { Link, createFileRoute } from '@tanstack/react-router'
import { TopBar } from '@/components/rb'
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

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>
}

// TR-2 published weights, TR-6 technical manual (summary), CO-1..CO-5 notices.
function Methodology() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Methodology" right={<Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Home</Link>} />
      <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-relaxed">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Technical manual · summary</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">How ReviewBench grades</h1>
        <p className="mt-4 text-muted-foreground">
          ReviewBench measures how well engineers validate and direct AI-generated work. Every candidate on a given scenario
          version sees the same planted problems, so results are comparable. AI judges answer narrow yes/no questions;
          ordinary code, not an AI, computes the score. ReviewBench informs hiring decisions and never makes them.
        </p>

        <H>Modules</H>
        <ul className="mt-3 space-y-2">
          {Object.values(SCENARIOS).map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span className="font-semibold">{MODULE_LABEL[s.kind]}</span> · {s.title} <span className="text-muted-foreground">· {s.level} · {s.minutes} min</span>
            </li>
          ))}
        </ul>

        <H>The grading pipeline</H>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li><span className="text-foreground">Location matching.</span> A comment is compared with planted items within 3 lines of it.</li>
          <li><span className="text-foreground">A council of three judges</span> from different model families answers checklist questions independently at temperature 0. If a judge's model fails, it falls back to a model from a family not already on the panel.</li>
          <li><span className="text-foreground">Evidence verification.</span> Every "yes" must quote the candidate's own words; code checks the quote really appears, and discards the vote if not.</li>
          <li><span className="text-foreground">Anonymization.</span> Judges never see names or email addresses, even if typed into a comment.</li>
          <li><span className="text-foreground">Consensus and escalation.</span> A majority of valid votes decides. Split votes or too few valid votes on serious items go to a person.</li>
          <li><span className="text-foreground">Deterministic scoring</span> with the published weights below. Human reviewers can override an item with a written justification; every override is logged.</li>
        </ol>

        <H>Score weights (Code and Decision Review)</H>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {COMPONENTS.map(([k, name, desc]) => (
              <tr key={k} className="border-b border-border">
                <td className="py-2 font-semibold">{name}</td>
                <td className="py-2 text-muted-foreground">{desc}</td>
                <td className="py-2 text-right font-mono">{Math.round(WEIGHTS[k] * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted-foreground">
          Bands: Strong ≥ 80 · Meets bar 60–79 · Borderline 50–59 · Below bar &lt; 50. Weights and bands are provisional
          until calibrated against human graders; follow-up answers and communication are reported but not yet weighted.
          The Directed Build pilot uses the same five slots for faults fixed, calibrated trust, testing, instruction quality
          and task completion.
        </p>

        <H>How we check the checker</H>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Agreement with expert human graders (quadratic weighted kappa, target ≥ 0.70), with confidence intervals.</li>
          <li>Test–retest stability (same work graded 5 times, target ≤ 2 points spread).</li>
          <li>Perturbation tests: renamed candidates, reformatting, reordering, verbosity and prompt-injection strings must not move scores by more than 3 points.</li>
          <li>Adverse-impact monitoring with the four-fifths rule, where group data is collected lawfully and with consent.</li>
          <li>A regression gate: any change to prompts, rubric, models or weights is re-run on the golden set before release.</li>
        </ul>

        <H>Candidate rights</H>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>You are told in advance that the work was written by an AI and may contain mistakes.</li>
          <li>You can ask for extra time as an accommodation; the hiring team sets it before you start.</li>
          <li>If the hiring team shares your results, you see how your score was built, and you can request a human review.</li>
          <li>You can ask the hiring team to delete your submission.</li>
        </ul>

        <H>Notice template for hiring teams</H>
        <blockquote className="mt-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          As part of this process you will take a ReviewBench assessment. An automated tool, supervised by our hiring team,
          assesses how you review AI-written work against a fixed answer key. It does not make hiring decisions. You can
          request an accommodation, an explanation of your results, or a human review of your assessment by contacting us.
          Where required (for example NYC Local Law 144), this notice is given at least 10 business days before the
          assessment, and a summary of our latest bias audit is available on request.
        </blockquote>
        <p className="mt-3 text-xs text-muted-foreground">Templates are provided for convenience and need review by your own counsel before use.</p>
      </main>
    </div>
  )
}

import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, ClipboardCheck, Scale, ShieldCheck } from 'lucide-react'
import { TopBar } from '@/components/rb'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/']

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: Home,
})

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar
        right={
          <Link to="/recruiter" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Recruiter dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          MVP · Code review module
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          See how engineers review code an AI wrote.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Candidates review a pull request with planted, known flaws. A panel of independent AI judges grades each
          comment against the answer key — and every vote must quote the candidate's own words.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link
            to="/assess"
            search={{ t: '' }}
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
          >
            <div>
              <div className="text-sm font-semibold">For candidates</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">Take the assessment</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Junior backend scenario · Python / Flask · about 40 minutes. Open the personal link from your
                invitation email to begin.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
              How it works <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <Link
            to="/recruiter"
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
          >
            <div>
              <div className="text-sm font-semibold">For hiring teams</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">Review candidates</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Scores, issue-by-issue evidence, judge votes, and escalations.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
              Open dashboard <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>

        <div className="mt-16 grid gap-8 border-t border-border pt-10 md:grid-cols-3">
          <Feature
            icon={<ClipboardCheck className="size-5" />}
            title="Known answer key"
            body="Every candidate sees the same planted issues and decoys, so results are comparable."
          />
          <Feature
            icon={<Scale className="size-5" />}
            title="Checklist council"
            body="Three judges from different model families answer narrow yes/no questions. Splits on serious items escalate to a human."
          />
          <Feature
            icon={<ShieldCheck className="size-5" />}
            title="Evidence-verified"
            body="A judge's vote only counts if the quote it cites actually appears in the candidate's comment."
          />
        </div>
      </main>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="grid size-9 place-items-center rounded-md border border-border bg-card text-foreground">{icon}</div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

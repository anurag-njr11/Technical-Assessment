import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Bot, FlaskConical, Link2, ListChecks, Users } from 'lucide-react'
import { TopBar, btn } from '@/components/rb'
import { cn } from '@/lib/utils'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/']

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: Home,
})

const STEPS = [
  { title: 'Share one link', body: 'Create an assessment and send the link or QR code. Candidates need no account.' },
  { title: 'Candidates work with AI', body: 'They review an AI-written pull request or build with an assistant, the way they would at work.' },
  { title: 'A judge council grades', body: 'Three judges from different model families vote. Every "yes" must quote the candidate’s own words.' },
]

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <TopBar
        right={
          <Link to="/methodology" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Methodology
          </Link>
        }
      />

      <div className="relative overflow-hidden border-b border-border">
        <div className="rb-hero-bg" aria-hidden="true">
          <div className="rb-blob -left-24 -top-24 size-[28rem] bg-primary/25" />
          <div className="rb-blob -right-16 top-1/3 size-[22rem] bg-chart-2/20" />
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="rb-stagger">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              <span className="size-1.5 rounded-full bg-primary" /> AI-assisted engineering assessments
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              ReviewBench doesn't ask whether you can write code without AI.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              It evaluates whether you can effectively work with AI to produce reliable engineering work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/recruiter" className={cn(btn.primary, 'group px-5 py-2.5')}>
                Recruiter sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/methodology" className={cn(btn.secondary, 'px-5 py-2.5')}>
                How grading works
              </Link>
            </div>
          </div>

          <ol className="rb-stagger relative space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-mono text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold">{s.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/recruiter"
            className="rb-lift group flex flex-col rounded-xl border border-border bg-card p-6"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Users className="size-5" /></span>
              <div className="text-sm font-semibold text-primary">For hiring teams</div>
            </div>
            <div className="mt-4 text-xl font-semibold tracking-tight">Recruiter sign in</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Create an assessment, share one link or QR code, and see exactly how each candidate worked with AI.
            </p>
            <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-primary">
              Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <div className="flex flex-col rounded-xl border border-dashed border-input bg-card/60 p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-muted text-foreground"><Link2 className="size-5" /></span>
              <div className="text-sm font-semibold text-muted-foreground">For candidates</div>
            </div>
            <div className="mt-4 text-xl font-semibold tracking-tight">Have an assessment link?</div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Open the link or scan the QR code the hiring team gave you. There's nothing to sign up for.
            </p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">What the assessment looks like</h2>
          <div className="rb-stagger mt-8 grid gap-4 md:grid-cols-3">
            <Feature icon={<ListChecks className="size-5" />} title="A real task" body="A short, realistic engineering task, not a puzzle." />
            <Feature icon={<Bot className="size-5" />} title="An AI assistant" body="Candidates use AI the way they would at work: ask, accept, dismiss, edit." />
            <Feature icon={<FlaskConical className="size-5" />} title="Reliable results" body="What matters is whether the final work is correct, and how they got there." />
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>ReviewBench</span>
          <Link to="/methodology" className="transition-colors hover:text-foreground">How ReviewBench grades</Link>
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rb-lift rounded-xl border border-border bg-card p-6">
      <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">{icon}</div>
      <div className="mt-4 font-semibold">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}

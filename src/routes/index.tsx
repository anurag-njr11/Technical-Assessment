import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Bot, FlaskConical, Link2, ListChecks } from 'lucide-react'
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
      <TopBar />

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          ReviewBench doesn't ask whether you can write code without AI.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          It evaluates whether you can effectively work with AI to produce reliable engineering work.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link
            to="/recruiter"
            className="group flex flex-col justify-between rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
          >
            <div>
              <div className="text-sm font-semibold">For hiring teams</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">Recruiter sign in</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Create an assessment, share one link or QR code, and see exactly how each candidate worked with AI.
              </p>
            </div>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
              Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          <div className="flex flex-col rounded-xl border border-dashed border-border bg-card p-6">
            <div className="text-sm font-semibold">For candidates</div>
            <div className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Link2 className="size-5" /> Have an assessment link?
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Open the link or scan the QR code the hiring team gave you. There's nothing to sign up for.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-8 border-t border-border pt-10 md:grid-cols-3">
          <Feature icon={<ListChecks className="size-5" />} title="A real task" body="A short, realistic engineering task, not a puzzle." />
          <Feature icon={<Bot className="size-5" />} title="An AI assistant" body="Candidates use AI the way they would at work: ask, accept, dismiss, edit." />
          <Feature icon={<FlaskConical className="size-5" />} title="Reliable results" body="What matters is whether the final work is correct, and how they got there." />
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

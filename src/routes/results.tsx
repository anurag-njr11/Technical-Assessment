import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Loader2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { BandChip, TopBar, cleanError } from '@/components/rb'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/results']

export const Route = createFileRoute('/results')({
  validateSearch: (search: Record<string, unknown>) => ({ t: typeof search.t === 'string' ? search.t : '' }),
  head: () => ({ meta: [{ title: meta.title }, { name: 'description', content: meta.description }] }),
  component: Results,
})

const LABELS: Record<string, Record<string, string>> = {
  code: { detection: 'Finding the planted problems', precision: 'Avoiding false alarms', decoyDiscipline: 'Leaving correct code alone', explanationQuality: 'Explaining impact and fixes', verdict: 'Choosing the right verdict' },
  decision: { detection: 'Spotting flawed reasoning', precision: 'Staying on point', decoyDiscipline: 'Keeping the sound ideas', explanationQuality: 'Explaining impact and alternatives', verdict: 'Choosing the right decision' },
  build: { detection: 'Catching the assistant’s mistakes', precision: 'Using correct suggestions', decoyDiscipline: 'Testing your work', explanationQuality: 'Giving clear instructions', verdict: 'Completing the task' },
}

// TR-4 candidate-facing results and TR-5 appeal request.
function Results() {
  const { t } = Route.useSearch()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const r = useQuery(api.candidates.results, mounted && t ? { token: t } : 'skip')
  const appeal = useMutation(api.candidates.appeal)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')

  const body = () => {
    if (!t) return <p className="text-muted-foreground">Open this page from the link in your invitation.</p>
    if (!mounted || r === undefined) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
    if (r === null) return <p className="text-muted-foreground">We couldn't find a submitted assessment for this link.</p>
    const appealBox = r.appeal ? (
      <section className="rounded-xl border border-border bg-card p-6 text-sm">
        <h2 className="font-semibold">Your review request</h2>
        <p className="mt-2 text-muted-foreground">“{r.appeal.text}”</p>
        <p className="mt-3">
          {r.appeal.status === 'open' ? 'A person from the hiring team will review your assessment.' : <>Reviewed. <span className="text-muted-foreground">{r.appeal.response}</span></>}
        </p>
      </section>
    ) : (
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Think something was graded wrongly?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ask for a human review. A person on the hiring team, not the AI panel, will look at your work again.</p>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg('') }} rows={4} maxLength={4000} aria-label="What should be reviewed"
          className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          placeholder="Which part do you think was assessed incorrectly, and why?" />
        <button onClick={() => appeal({ token: t, text }).catch((err) => setMsg(cleanError(err)))}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Request a human review
        </button>
        {msg ? <p className="mt-2 text-[13px] text-destructive">{msg}</p> : null}
      </section>
    )
    if (!r.released) {
      return (
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-6">
            <h1 className="text-xl font-semibold">Thanks, {r.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your {r.title} assessment was received. The hiring team hasn't shared a results summary yet. They will contact you about next steps.
            </p>
          </section>
          {appealBox}
        </div>
      )
    }
    const labels = LABELS[r.kind] ?? LABELS.code
    return (
      <div className="space-y-5">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h1 className="text-xl font-semibold">Your results, {r.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{r.title}{r.humanReviewed ? ' · checked by a person' : ''}</p>
          </div>
          <BandChip band={r.band} score={r.overall} />
        </section>
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">How your score was built</h2>
          <div className="mt-4 space-y-4">
            {Object.entries(r.components).map(([k, c]) => (
              <div key={k}>
                <div className="flex justify-between text-[13px]">
                  <span>{labels[k] ?? k} <span className="text-muted-foreground">· {Math.round((r.weights as Record<string, number>)[k] * 100)}% of score</span></span>
                  <span className="font-mono text-muted-foreground">{Math.round(c.value * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round(c.value * 100))}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
        <section className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Strengths</h2>
            <p className="mt-2 text-sm text-muted-foreground">{r.strengths.length ? `You caught ${r.strengths.join(', ').toLowerCase()} problems.` : 'No planted problems were identified.'}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Areas to grow</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {r.gaps.length ? `Look out for ${r.gaps.join(', ').toLowerCase()} problems.` : 'No gaps by category.'}
              {r.falseAlarms ? ` You flagged ${r.falseAlarms} thing(s) that were actually correct.` : ''}
            </p>
          </div>
        </section>
        {r.answerKey ? (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Answer key (this scenario is retired)</h2>
            <ul className="mt-2 space-y-1 text-sm">{r.answerKey.map((a) => <li key={a.title}>{a.title}: <span className="text-muted-foreground">{a.outcome.replace('_', ' ')}</span></li>)}</ul>
          </section>
        ) : (
          <p className="text-xs text-muted-foreground">The exact planted problems stay private so the assessment stays fair for other candidates.</p>
        )}
        {appealBox}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Your results" />
      <main className="mx-auto max-w-3xl px-6 py-12">{body()}</main>
    </div>
  )
}

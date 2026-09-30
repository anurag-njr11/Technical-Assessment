import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { BandChip, OutcomeChip, SeverityChip, TopBar } from '@/components/rb'
import { RecruiterGate, SignOutButton } from '@/components/recruiter-gate'
import { cn } from '@/lib/utils'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/report']

export const Route = createFileRoute('/report')({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === 'string' ? search.id : '',
  }),
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: () => (
    <RecruiterGate>
      <Report />
    </RecruiterGate>
  ),
})

type VoteT = { judge: string; model: string; decision?: boolean; answer?: string; evidence?: string; valid: boolean; discardedReason?: string }
type ItemT = {
  id: string
  kind: 'issue' | 'decoy'
  title: string
  category: string
  severity: string
  outcome: string
  explanation: number | null
  commentText: string | null
  commentLine: number | null
  commentFile: string | null
  split: boolean
  votes: VoteT[]
}
type Component = { value: number; detail: string }

const COMPONENT_LABELS: Record<string, string> = {
  detection: 'Detection (severity-weighted)',
  precision: 'Precision',
  decoyDiscipline: 'Decoy discipline',
  explanationQuality: 'Explanation quality',
  verdict: 'Verdict',
}

function Report() {
  const { id } = Route.useSearch()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const sub = useQuery(api.submissions.get, id ? { id } : 'skip')
  const regrade = useMutation(api.submissions.regrade)

  const back = (
    <>
      <Link to="/recruiter" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Candidates
      </Link>
      <SignOutButton />
    </>
  )

  if (!mounted || (id && sub === undefined)) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar right={back} />
        <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </div>
    )
  }
  if (!id || !sub) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar right={back} />
        <p className="py-24 text-center text-muted-foreground">Report not found.</p>
      </div>
    )
  }

  const result = sub.result as
    | {
        overall: number
        band: string
        components: Record<string, Component>
        weights: Record<string, number>
        items: ItemT[]
        extraComments: Array<{ text: string; file: string; line: number; classification: string; votes: VoteT[] }>
        needsReview: boolean
        reviewReasons: string[]
        judges: Array<{ name: string; model: string }>
      }
    | undefined

  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Candidate report" right={back} />
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <section className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card p-6">
            <div className="grid size-12 place-items-center rounded-full bg-muted text-sm font-semibold">
              {sub.candidateName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">{sub.candidateName}</h1>
              <p className="text-sm text-muted-foreground">
                Backend Engineer · {sub.level} · {new Date(sub.submittedAt).toLocaleString()} · Verdict:{' '}
                {sub.verdict === 'approve' ? 'Approve' : 'Request changes'}
              </p>
            </div>
            {sub.status === 'graded' && result ? (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="font-mono text-3xl font-semibold leading-none">{result.overall}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{result.band}</div>
                </div>
                {result.needsReview ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive-soft px-3 py-1 text-xs font-semibold text-destructive">
                    <AlertTriangle className="size-3.5" /> Needs human review
                  </span>
                ) : (
                  <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">High confidence</span>
                )}
              </div>
            ) : sub.status === 'grading' ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Judges are grading…
              </span>
            ) : (
              <div className="text-right">
                <p className="text-sm text-destructive">Grading failed: {sub.error}</p>
                <button
                  onClick={() => regrade({ id: sub._id as Id<'submissions'> })}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium"
                >
                  <RotateCcw className="size-3.5" /> Retry
                </button>
              </div>
            )}
          </section>

          {result ? (
            <>
              {result.reviewReasons.length > 0 ? (
                <section className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
                  <div className="font-semibold">Escalated for human review</div>
                  <ul className="mt-1 list-disc pl-5">
                    {result.reviewReasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-sm font-semibold">Score breakdown</h2>
                <div className="mt-4 space-y-4">
                  {Object.entries(result.components).map(([key, c]) => (
                    <div key={key}>
                      <div className="flex flex-wrap justify-between gap-2 text-[13px]">
                        <span>
                          {COMPONENT_LABELS[key] ?? key}{' '}
                          <span className="text-muted-foreground">· weight {Math.round((result.weights[key] ?? 0) * 100)}%</span>
                        </span>
                        <span className="font-mono text-muted-foreground">{c.detail} · {Math.round(c.value * 100)}%</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', c.value < 0.34 ? 'bg-destructive' : 'bg-primary')}
                          style={{ width: `${Math.max(2, Math.round(c.value * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card">
                <h2 className="px-6 pt-5 text-sm font-semibold">Planted issues & decoys</h2>
                <div className="mt-3 divide-y divide-border">
                  {result.items.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </div>
              </section>

              {result.extraComments.length > 0 ? (
                <section className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold">Other comments</h2>
                  <div className="mt-3 space-y-3">
                    {result.extraComments.map((e, i) => (
                      <div key={i} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground">{e.file}:{e.line}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                            {e.classification.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-2 text-sm italic text-foreground/80">“{e.text}”</p>
                        <Votes votes={e.votes} mode="classify" />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Follow-up answers</h2>
            <div className="mt-3 space-y-4">
              {sub.followUps.map((f, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-muted-foreground">{f.question}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{f.answer || '—'}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              Not yet scored — use these to guide the follow-up interview.
            </p>
          </section>

          {result ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Judge panel</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {result.judges.map((j) => (
                  <li key={j.name} className="flex justify-between gap-3">
                    <span>{j.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{j.model}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Positive votes only count when the judge's quoted evidence appears verbatim in the candidate's comment.
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Overall</h2>
            <div className="mt-3">
              <BandChip band={result?.band} score={result?.overall} />
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

function ItemRow({ item }: { item: ItemT }) {
  const [open, setOpen] = useState(false)
  const discarded = item.votes.filter((v) => !v.valid).length
  return (
    <div className="px-6 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{item.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item.category}</span>
            <SeverityChip severity={item.severity} />
            {item.explanation !== null ? <span>Explanation {item.explanation}/2</span> : null}
            {item.split ? <span className="font-semibold text-warning">Judges split</span> : null}
            {discarded > 0 ? <span>{discarded} vote(s) discarded</span> : null}
          </div>
        </div>
        <OutcomeChip outcome={item.outcome} />
      </div>
      {item.commentText ? (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm italic text-foreground/80">
          <span className="not-italic font-mono text-xs text-muted-foreground">{item.commentFile}:{item.commentLine} </span>“{item.commentText}”
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No comment near this code.</p>
      )}
      {item.votes.length > 0 ? (
        <button onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
          {open ? 'Hide judge votes' : 'Show judge votes'}
        </button>
      ) : null}
      {open ? <Votes votes={item.votes} mode={item.kind} /> : null}
    </div>
  )
}

function Votes({ votes, mode }: { votes: VoteT[]; mode: 'issue' | 'decoy' | 'classify' }) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      {votes.map((v) => (
        <div key={v.judge} className={cn('rounded-md border p-2.5 text-xs', v.valid ? 'border-border' : 'border-dashed border-border opacity-70')}>
          <div className="flex justify-between gap-2 font-semibold">
            <span>{v.judge}</span>
            <span className={v.valid ? '' : 'text-destructive'}>
              {!v.valid
                ? 'Discarded'
                : mode === 'classify'
                  ? (v.answer ?? '').replace('_', ' ')
                  : v.decision
                    ? mode === 'decoy' ? 'Objected' : 'Identified'
                    : mode === 'decoy' ? 'No objection' : 'Not identified'}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-muted-foreground">{v.model}</div>
          {v.discardedReason ? <div className="mt-1 text-destructive">{v.discardedReason}</div> : null}
          {v.evidence ? <div className="mt-1 italic text-foreground/80">“{v.evidence}”</div> : null}
        </div>
      ))}
    </div>
  )
}

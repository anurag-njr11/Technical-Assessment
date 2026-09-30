import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { BandChip, OutcomeChip, RecruiterNav, SeverityChip, TopBar, cleanError } from '@/components/rb'
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

type VoteT = { judge: string; model: string; family?: string; decision?: boolean; answer?: string; evidence?: string; valid: boolean; discardedReason?: string }
type ItemT = {
  id: string
  kind: 'issue' | 'decoy'
  title: string
  category: string
  severity: string
  outcome: string
  explanation: number | null
  commentId?: string | null
  commentText: string | null
  commentLine: number | null
  commentFile: string | null
  split: boolean
  overridden?: boolean
  votes: VoteT[]
}
type ExtraT = { commentId?: string; text: string; file: string; line: number; classification: string; matchedItemId?: string; overridden?: boolean; votes: VoteT[] }
type SubComment = { id: string; file: string; line: number; text: string }
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
      <RecruiterNav />
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
        extraComments: ExtraT[]
        needsReview: boolean
        machine?: { overall: number; band: string }
        overrideCount?: number
        versions?: { rubric: string; prompt: string; scoring: string; scenario: number }
        modelsUsed?: string[]
        callCount?: number
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
                {sub.verdict === 'approve' ? 'Approve' : sub.verdict === 'none' ? 'None' : 'Request changes'}
                {sub.autoSubmitted ? ' · Auto-submitted at the time limit' : ''}
              </p>
            </div>
            {sub.status === 'graded' && result ? (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="font-mono text-3xl font-semibold leading-none">{result.overall}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{result.band}</div>
                </div>
                {sub.humanReview ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
                    <ShieldCheck className="size-3.5" /> Human reviewed
                  </span>
                ) : result.needsReview ? (
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
              {result.machine ? (
                <section className="rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="font-semibold">Adjusted by human review.</span>{' '}
                  <span className="text-muted-foreground">
                    Council score {result.machine.overall} ({result.machine.band}) → {result.overall} ({result.band}) after{' '}
                    {result.overrideCount} override(s). Every change is listed under Human review.
                  </span>
                </section>
              ) : null}

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
                    <ItemRow key={item.id} item={item} submissionId={sub._id} comments={sub.comments} />
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
                          {e.overridden ? <span className="font-semibold text-muted-foreground">human override</span> : null}
                        </div>
                        <p className="mt-2 text-sm italic text-foreground/80">“{e.text}”</p>
                        <Votes votes={e.votes} mode="classify" />
                        {e.commentId ? <ReclassifyForm submissionId={sub._id} extra={e} /> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <HumanReview submissionId={sub._id} needsReview={result.needsReview} resolved={sub.humanReview ?? null} />
            </>
          ) : null}
        </div>

        <aside className="space-y-5">
          {result ? <GoldenPanel submissionId={sub._id} items={result.items} /> : null}
          {result ? <EvalPanel submissionId={sub._id} result={result} /> : null}
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
              {result.modelsUsed ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Models actually used: <span className="font-mono">{result.modelsUsed.join(', ') || 'none'}</span>
                </p>
              ) : null}
              {result.versions ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.versions.rubric} · {result.versions.prompt} · {result.versions.scoring} · scenario v{result.versions.scenario}
                  {result.callCount !== undefined ? ` · ${result.callCount} judge calls` : ''}
                </p>
              ) : null}
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
          <DeletePanel submissionId={sub._id} />
        </aside>
      </main>
    </div>
  )
}

function ItemRow({ item, submissionId, comments }: { item: ItemT; submissionId: string; comments: SubComment[] }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
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
            {item.overridden ? <span className="font-semibold text-foreground">Human override</span> : null}
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
      <div className="mt-2 flex gap-4">
        {item.votes.length > 0 ? (
          <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            {open ? 'Hide judge votes' : 'Show judge votes'}
          </button>
        ) : null}
        <button onClick={() => setEditing((o) => !o)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          {editing ? 'Cancel override' : 'Override outcome'}
        </button>
      </div>
      {open ? <Votes votes={item.votes} mode={item.kind} /> : null}
      {editing ? <OverrideForm item={item} submissionId={submissionId} comments={comments} onDone={() => setEditing(false)} /> : null}
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
          <div className="mt-1 truncate font-mono text-muted-foreground">{v.model}{v.family ? ` · ${v.family}` : ''}</div>
          {v.discardedReason ? <div className="mt-1 text-destructive">{v.discardedReason}</div> : null}
          {v.evidence ? <div className="mt-1 italic text-foreground/80">“{v.evidence}”</div> : null}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Human review tools (HR-1..HR-4)
// ---------------------------------------------------------------------------

const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30'
const btnCls = 'rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60'

function OverrideForm({ item, submissionId, comments, onDone }: { item: ItemT; submissionId: string; comments: SubComment[]; onDone: () => void }) {
  const override = useMutation(api.reviews.overrideItem)
  const options = item.kind === 'issue' ? (['found', 'missed'] as const) : (['clean', 'false_alarm'] as const)
  const [outcome, setOutcome] = useState<string>(item.outcome)
  const [explanation, setExplanation] = useState(String(item.explanation ?? 1))
  const [commentId, setCommentId] = useState(item.commentId ?? '')
  const [justification, setJustification] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await override({
        submissionId: submissionId as Id<'submissions'>,
        itemId: item.id,
        outcome: outcome as 'found' | 'missed' | 'clean' | 'false_alarm',
        explanation: outcome === 'found' ? Number(explanation) : undefined,
        commentId: commentId || undefined,
        justification,
      })
      onDone()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome" className={inputCls}>
          {options.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
        </select>
        {item.kind === 'issue' && outcome === 'found' ? (
          <select value={explanation} onChange={(e) => setExplanation(e.target.value)} aria-label="Explanation score" className={inputCls}>
            <option value="0">Explanation 0 (neither)</option>
            <option value="1">Explanation 1 (impact or fix)</option>
            <option value="2">Explanation 2 (impact and fix)</option>
          </select>
        ) : <span />}
        <select value={commentId} onChange={(e) => setCommentId(e.target.value)} aria-label="Supporting comment" className={inputCls}>
          <option value="">Keep linked comment</option>
          {comments.map((c) => <option key={c.id} value={c.id}>{c.file}:{c.line} · {c.text.slice(0, 40)}</option>)}
        </select>
      </div>
      <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} placeholder="Why? (required, recorded in the audit log)" aria-label="Justification" className={inputCls} />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <button onClick={save} disabled={busy} className={btnCls}>Save override</button>
    </div>
  )
}

function ReclassifyForm({ submissionId, extra }: { submissionId: string; extra: ExtraT }) {
  const reclassify = useMutation(api.reviews.overrideComment)
  const [open, setOpen] = useState(false)
  const [cls, setCls] = useState<'valid_extra' | 'nitpick' | 'false_alarm' | 'matched'>('valid_extra')
  const [justification, setJustification] = useState('')
  const [error, setError] = useState('')
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
        Reclassify
      </button>
    )
  }
  const save = async () => {
    setError('')
    try {
      await reclassify({ submissionId: submissionId as Id<'submissions'>, commentId: extra.commentId!, classification: cls, justification })
      setOpen(false)
    } catch (err) {
      setError(cleanError(err))
    }
  }
  return (
    <div className="mt-2 space-y-2">
      <select value={cls} onChange={(e) => setCls(e.target.value as typeof cls)} aria-label="Classification" className={inputCls}>
        <option value="valid_extra">Valid extra issue (rewarded)</option>
        <option value="matched">Matches a planted issue (then override that item)</option>
        <option value="nitpick">Nitpick (neutral)</option>
        <option value="false_alarm">False alarm (penalised)</option>
      </select>
      <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} placeholder="Why? (required)" aria-label="Justification" className={inputCls} />
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button onClick={save} className={btnCls}>Save</button>
        <button onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>
      </div>
    </div>
  )
}

function HumanReview({ submissionId, needsReview, resolved }: { submissionId: string; needsReview: boolean; resolved: { by: string; at: number; note: string } | null }) {
  const history = useQuery(api.reviews.history, { id: submissionId as Id<'submissions'> })
  const resolve = useMutation(api.reviews.resolve)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  if (!history) return null
  if (!needsReview && history.length === 0 && !resolved) return null
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Human review</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No overrides yet. Use “Override outcome” on any item, or “Reclassify” on other comments.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {history.map((h) => (
            <li key={h._id} className="rounded-md border border-border p-3">
              <div className="font-mono text-xs text-muted-foreground">
                {new Date(h.createdAt).toLocaleString()} · {h.reviewerEmail}
              </div>
              <div className="mt-1">
                <span className="font-semibold">{h.targetId}</span>: {h.before.replace('_', ' ')}
                {h.beforeExplanation !== null ? ` (${h.beforeExplanation}/2)` : ''} → {h.after.replace('_', ' ')}
                {h.afterExplanation !== null ? ` (${h.afterExplanation}/2)` : ''}
              </div>
              <div className="mt-1 text-muted-foreground">{h.justification}</div>
            </li>
          ))}
        </ul>
      )}
      {resolved ? (
        <p className="mt-4 text-sm">
          <span className="font-semibold">Resolved</span> by {resolved.by} on {new Date(resolved.at).toLocaleString()}: <span className="text-muted-foreground">{resolved.note}</span>
        </p>
      ) : needsReview ? (
        <div className="mt-4 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Resolution note: what you checked and decided" aria-label="Resolution note" className={inputCls} />
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          <button
            onClick={() => resolve({ submissionId: submissionId as Id<'submissions'>, note }).catch((err) => setError(cleanError(err)))}
            className={btnCls}
          >
            Mark review complete
          </button>
        </div>
      ) : null}
    </section>
  )
}

function GoldenPanel({ submissionId, items }: { submissionId: string; items: ItemT[] }) {
  const mine = useQuery(api.golden.forSubmission, { id: submissionId as Id<'submissions'> })
  const label = useMutation(api.golden.label)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [overall, setOverall] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!mine) return
    const d: Record<string, string> = {}
    for (const l of mine.mine) {
      if (l.targetId === '__overall') setOverall(String(l.overall ?? ''))
      else d[l.targetId] = l.outcome === 'found' ? `found:${l.explanation ?? 0}` : (l.outcome ?? '')
    }
    setDraft(d)
  }, [mine])
  const save = async () => {
    setMsg('')
    try {
      await label({
        submissionId: submissionId as Id<'submissions'>,
        items: items
          .filter((i) => draft[i.id])
          .map((i) => {
            const [outcome, ex] = draft[i.id].split(':')
            return { itemId: i.id, outcome: outcome as 'found' | 'missed' | 'clean' | 'false_alarm', explanation: ex !== undefined ? Number(ex) : undefined }
          }),
        overall: overall === '' ? undefined : Number(overall),
      })
      setMsg('Saved to the golden set.')
    } catch (err) {
      setMsg(cleanError(err))
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Golden set</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Grade this review yourself, without looking at the judges, to measure council accuracy.{' '}
        {mine ? `${mine.graders.length} grader(s) so far.` : ''}
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
          Add my grades
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <label key={i.id} className="block text-xs">
              <span className="font-semibold">{i.id}</span> <span className="text-muted-foreground">{i.title}</span>
              <select value={draft[i.id] ?? ''} onChange={(e) => setDraft({ ...draft, [i.id]: e.target.value })} className={cn(inputCls, 'mt-1')}>
                <option value="">Not graded</option>
                {i.kind === 'issue' ? (
                  <>
                    <option value="missed">Missed</option>
                    <option value="found:0">Found, no impact or fix</option>
                    <option value="found:1">Found, impact or fix</option>
                    <option value="found:2">Found, impact and fix</option>
                  </>
                ) : (
                  <>
                    <option value="clean">Left alone</option>
                    <option value="false_alarm">Flagged (false alarm)</option>
                  </>
                )}
              </select>
            </label>
          ))}
          <label className="block text-xs font-semibold">
            Your overall score (0–100)
            <input value={overall} onChange={(e) => setOverall(e.target.value)} type="number" min={0} max={100} className={cn(inputCls, 'mt-1')} />
          </label>
          <button onClick={save} className={btnCls}>Save grades</button>
          {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
        </div>
      )}
    </section>
  )
}

function EvalPanel({ submissionId, result }: { submissionId: string; result: { callCount?: number } }) {
  const retest = useMutation(api.reliability.startRetest)
  const perturb = useMutation(api.reliability.startPerturbation)
  const calls = useQuery(api.tracing.forSubmission, { id: submissionId as Id<'submissions'> })
  const [msg, setMsg] = useState('')
  const run = async (fn: () => Promise<unknown>, what: string) => {
    setMsg('')
    try {
      await fn()
      setMsg(`${what} started. Results appear on the Reliability page.`)
    } catch (err) {
      setMsg(cleanError(err))
    }
  }
  const failed = calls?.filter((c) => !c.ok).length ?? 0
  const tokens = calls?.reduce((s, c) => s + c.estTokens, 0) ?? 0
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Evaluation</h2>
      {calls ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {calls.length} traced judge calls{failed ? `, ${failed} failed over` : ''} · ~{tokens.toLocaleString()} tokens
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        <button onClick={() => run(() => retest({ submissionId: submissionId as Id<'submissions'> }), 'Test–retest (5 runs)')} className="rounded-md border border-border px-3 py-1.5 text-left text-sm">
          Re-grade 5× (test–retest)
        </button>
        <button onClick={() => run(() => perturb({ submissionId: submissionId as Id<'submissions'> }), 'Perturbation tests')} className="rounded-md border border-border px-3 py-1.5 text-left text-sm">
          Run perturbation tests
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Uses real judge calls (about {result.callCount ?? 15} per run). Doesn't change this report.
      </p>
      {msg ? <p className="mt-2 text-xs">{msg}</p> : null}
    </section>
  )
}

function DeletePanel({ submissionId }: { submissionId: string }) {
  const me = useQuery(api.access.me)
  const remove = useMutation(api.submissions.remove)
  const navigate = useNavigate()
  const [error, setError] = useState('')
  if (!me || !me.signedIn || me.role !== 'owner') return null
  const del = async () => {
    if (!window.confirm('Permanently delete this submission, its report, reviews and traces? This cannot be undone.')) return
    try {
      await remove({ id: submissionId as Id<'submissions'> })
      await navigate({ to: '/recruiter' })
    } catch (err) {
      setError(cleanError(err))
    }
  }
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <button onClick={del} className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive">
        <Trash2 className="size-4" /> Delete submission
      </button>
      <p className="mt-1 text-xs text-muted-foreground">Owner only. Use for test data or candidate deletion requests.</p>
      {error ? <p className="mt-1 text-[13px] text-destructive">{error}</p> : null}
    </section>
  )
}


import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ArrowRight, Check, Clock, Info, Loader2, Lock, MessageSquarePlus, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { SeverityChip, TopBar } from '@/components/rb'
import { SCENARIO, SEVERITIES } from '@/lib/scenario'
import type { Severity } from '@/lib/scenario'
import { cn } from '@/lib/utils'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/assess']

export const Route = createFileRoute('/assess')({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === 'string' ? search.t : '',
  }),
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: Assess,
})

type Step = 'intro' | 'review' | 'followup' | 'done' | 'timeup'
type Comment = { id: string; file: string; line: number; severity: Severity; text: string }
type Verdict = 'approve' | 'request_changes'
type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; at?: number; message?: string }

/** FR-C-15: true only after React has hydrated, so clicks are never silently lost. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

const clean = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : fallback

function Assess() {
  const { t: token } = Route.useSearch()
  const hydrated = useHydrated()
  const session = useQuery(api.candidates.session, hydrated && token ? { token } : 'skip')

  if (!token) return <Notice title="You need an invite link" body="Assessments are taken through a personal link sent by the hiring team. Check your email for the link, or ask your recruiter to resend it." />
  if (!hydrated || session === undefined) return <Loading />
  if (session === null) return <Notice title="This link isn't valid" body="Check that you copied the whole link from your invitation email, or ask your recruiter for a new one." />
  if (session.status === 'revoked') return <Notice title="This invitation was withdrawn" body="Please contact your recruiter if you think this is a mistake." />
  if (session.status === 'submitted') return <Shell><Done /></Shell>
  return <Attempt token={token} session={session} />
}

type Session = NonNullable<ReturnType<typeof useQuery<typeof api.candidates.session>>>

function Attempt({ token, session }: { token: string; session: Session }) {
  const draft = session.draft
  const [step, setStep] = useState<Step>(session.status === 'started' ? (draft?.step ?? 'review') : 'intro')
  const [comments, setComments] = useState<Comment[]>((draft?.comments as Comment[]) ?? [])
  const [verdict, setVerdict] = useState<Verdict | null>(draft?.verdict ?? null)
  const [answers, setAnswers] = useState<string[]>(draft?.answers ?? SCENARIO.followUps.map(() => ''))
  const [deadline, setDeadline] = useState<number | null>(session.deadline)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [save, setSave] = useState<SaveState>({ status: draft ? 'saved' : 'idle', at: draft?.updatedAt })
  const start = useMutation(api.candidates.start)
  const saveDraft = useMutation(api.candidates.saveDraft)
  const submit = useMutation(api.submissions.submit)

  // FR-C-13: debounced autosave of everything the candidate has done so far.
  const latest = useRef({ step, comments, verdict, answers })
  latest.current = { step, comments, verdict, answers }
  const flush = useCallback(
    async (override?: Partial<typeof latest.current>) => {
      const cur = { ...latest.current, ...override }
      if (cur.step !== 'review' && cur.step !== 'followup') return
      setSave({ status: 'saving' })
      try {
        const r = await saveDraft({ token, step: cur.step, comments: cur.comments, verdict: cur.verdict ?? undefined, answers: cur.answers })
        setSave({ status: 'saved', at: r.savedAt })
      } catch (err) {
        setSave({ status: 'error', message: clean(err, 'Could not save. Check your connection.') })
      }
    },
    [saveDraft, token],
  )
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (step !== 'review' && step !== 'followup') return
    const id = setTimeout(() => void flush(), 800)
    return () => clearTimeout(id)
  }, [comments, verdict, answers, step, flush])

  const begin = async () => {
    setStarting(true)
    setStartError('')
    try {
      const r = await start({ token })
      setDeadline(r.deadline)
      setStep('review')
    } catch (err) {
      setStartError(clean(err, 'Could not start. Please try again.'))
    } finally {
      setStarting(false)
    }
  }

  const toFollowUps = async () => {
    setStep('followup')
    await flush({ step: 'followup' })
  }

  const finish = async () => {
    if (!verdict) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await submit({ token, verdict, comments, answers: answers.map((a) => a.trim()) })
      setStep('done')
    } catch (err) {
      setSubmitError(clean(err, 'Could not submit. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  // FR-C-14: when the server deadline passes, save and stop. The server
  // auto-submits the saved work shortly after (deadline + grace period).
  const onExpire = useCallback(() => {
    void flush().finally(() => setStep('timeup'))
  }, [flush])

  const active = step === 'review' || step === 'followup'
  return (
    <div className="min-h-screen bg-background">
      <TopBar
        subtitle={`${SCENARIO.ticketId} · ${SCENARIO.role} · ${SCENARIO.level}`}
        right={
          active && deadline ? (
            <>
              <SaveIndicator save={save} />
              <Timer deadline={deadline} onExpire={onExpire} />
            </>
          ) : null
        }
      />
      {step === 'intro' && (
        <Intro name={session.name} minutes={session.minutes} extraMinutes={session.extraMinutes} onStart={begin} starting={starting} error={startError} />
      )}
      {step === 'review' && (
        <Review comments={comments} setComments={setComments} verdict={verdict} setVerdict={setVerdict} onNext={toFollowUps} />
      )}
      {step === 'followup' && (
        <FollowUp answers={answers} setAnswers={setAnswers} onSubmit={finish} submitting={submitting} error={submitError} />
      )}
      {step === 'done' && <Done name={session.name} />}
      {step === 'timeup' && (
        <Notice
          embedded
          icon={<Clock className="size-5" />}
          title="Time is up"
          body="Your work was saved and will be submitted automatically in the next couple of minutes. You can close this page."
        />
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Assessment" />
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Shell>
      <div className="grid place-items-center py-24" role="status" aria-label="Loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    </Shell>
  )
}

function Notice({ title, body, icon, embedded }: { title: string; body: string; icon?: React.ReactNode; embedded?: boolean }) {
  const card = (
    <main className="mx-auto max-w-lg px-6 py-20">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-foreground">{icon ?? <Lock className="size-5" />}</div>
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </main>
  )
  return embedded ? card : <Shell>{card}</Shell>
}

function SaveIndicator({ save }: { save: SaveState }) {
  const text =
    save.status === 'saving'
      ? 'Saving…'
      : save.status === 'saved' && save.at
        ? `Saved ${new Date(save.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : save.status === 'error'
          ? save.message ?? 'Not saved'
          : ''
  if (!text) return null
  return (
    <span className={cn('hidden text-xs sm:inline', save.status === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
      {text}
    </span>
  )
}

function Timer({ deadline, onExpire }: { deadline: number; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, Math.floor((deadline - now) / 1000))
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true
      onExpire()
    }
  }, [left, onExpire])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <span
      className={cn(
        'rounded-md px-3 py-1.5 font-mono text-sm font-semibold',
        left < 300 ? 'bg-destructive-soft text-destructive' : 'bg-muted text-foreground',
      )}
      aria-label="Time remaining"
    >
      {mm}:{ss}
    </span>
  )
}

function Intro({
  name,
  minutes,
  extraMinutes,
  onStart,
  starting,
  error,
}: {
  name: string
  minutes: number
  extraMinutes: number
  onStart: () => void
  starting: boolean
  error: string
}) {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ticket · {SCENARIO.ticketId}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">{SCENARIO.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {[SCENARIO.stack, 'REST API', `${minutes} min`].map((c) => (
            <span key={c} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              {c}
            </span>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{SCENARIO.summary}</p>

        <h2 className="mt-8 text-sm font-semibold">Acceptance criteria</h2>
        <ul className="mt-3 space-y-2.5">
          {SCENARIO.criteria.map((c) => (
            <li key={c} className="flex gap-3 text-sm text-foreground/80">
              <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {c}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex max-w-2xl gap-3 rounded-lg border border-border bg-card p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            A teammate's AI agent already opened a pull request for this ticket. Review it as you would any PR: leave
            line comments, rate severity, and decide whether to approve or request changes. AI-written code can be
            confidently wrong, so verify before you trust it. You can read every file, including unchanged helpers.
          </p>
        </div>
      </div>

      <aside className="h-fit rounded-xl border border-border bg-card p-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">How it works</h2>
        <ol className="mt-4 space-y-3 text-sm">
          {['Read the pull request', 'Comment on lines and rate severity', 'Choose a verdict', 'Answer 3 short questions'].map(
            (s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-muted font-mono text-xs font-semibold">{i + 1}</span>
                {s}
              </li>
            ),
          )}
        </ol>
        <p className="mt-6 text-sm">
          Hi <span className="font-semibold">{name}</span>. You have <span className="font-semibold">{minutes} minutes</span>
          {extraMinutes > 0 ? ` (includes ${extraMinutes} extra)` : ''}. Your work saves automatically, so a refresh or a
          dropped connection won't lose it.
        </p>
        <button
          onClick={onStart}
          disabled={starting}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {starting ? <Loader2 className="size-4 animate-spin" /> : null} Start review <ArrowRight className="size-4" />
        </button>
        {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
        <p className="mt-2 text-center text-xs text-muted-foreground">The timer starts when you click Start and can't be paused</p>
      </aside>
    </main>
  )
}

function Review({
  comments,
  setComments,
  verdict,
  setVerdict,
  onNext,
}: {
  comments: Comment[]
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>
  verdict: Verdict | null
  setVerdict: (v: Verdict) => void
  onNext: () => void
}) {
  const [activePath, setActivePath] = useState(SCENARIO.files[0].path)
  const [composer, setComposer] = useState<{ line: number; severity: Severity; text: string; error: string } | null>(null)
  const [nextError, setNextError] = useState('')
  const file = useMemo(() => SCENARIO.files.find((f) => f.path === activePath)!, [activePath])

  const openComposer = (line: number) => setComposer({ line, severity: 'high', text: '', error: '' })

  const saveComment = () => {
    if (!composer) return
    if (!composer.text.trim()) {
      setComposer({ ...composer, error: 'Write a comment first.' })
      return
    }
    setComments((prev) => [
      ...prev,
      {
        id: `c${Date.now()}${Math.floor(Math.random() * 1000)}`,
        file: file.path,
        line: composer.line,
        severity: composer.severity,
        text: composer.text.trim(),
      },
    ])
    setComposer(null)
  }

  const goNext = () => {
    if (!verdict) {
      setNextError('Choose Approve or Request changes before continuing.')
      return
    }
    onNext()
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <aside className="border-b border-border bg-card lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-4 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Files</div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col">
          {SCENARIO.files.map((f) => {
            const count = comments.filter((c) => c.file === f.path).length
            return (
              <button
                key={f.path}
                onClick={() => { setActivePath(f.path); setComposer(null) }}
                className={cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left font-mono text-[12.5px]',
                  f.path === activePath ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <span className="truncate">{f.path}</span>
                {count > 0 ? <span className="rounded bg-primary px-1.5 text-[10px] text-primary-foreground">{count}</span> : null}
              </button>
            )
          })}
        </nav>
        <div className="hidden border-t border-border px-4 py-4 lg:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your comments</div>
          <p className="mt-2 text-sm">
            <span className="font-mono font-semibold">{comments.length}</span> posted
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Click the <MessageSquarePlus className="inline size-3.5" /> next to any line to comment.
          </p>
        </div>
      </aside>

      <section className="min-w-0 flex-1 bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-[13px] font-semibold">{file.path}</span>
          <span className="font-mono text-xs">
            {file.added || file.removed ? (
              <>
                <span className="text-success">+{file.added}</span>{' '}
                <span className="text-destructive">-{file.removed}</span>
              </>
            ) : (
              <span className="text-muted-foreground">unchanged</span>
            )}
          </span>
        </div>
        <div className="overflow-x-auto py-2">
          {file.lines.map((l) => {
            const lineComments = comments.filter((c) => c.file === file.path && c.line === l.n)
            return (
              <div key={l.n}>
                <div className={cn('group flex items-start', l.kind === 'add' ? 'bg-diff-add' : '')}>
                  <span className="w-12 shrink-0 select-none pr-2 text-right font-mono text-xs leading-6 text-muted-foreground/60">{l.n}</span>
                  <button
                    onClick={() => openComposer(l.n)}
                    aria-label={`Comment on line ${l.n}`}
                    className="mt-1 grid size-4 shrink-0 place-items-center rounded text-muted-foreground opacity-40 hover:bg-primary hover:text-primary-foreground hover:opacity-100 group-hover:opacity-100"
                  >
                    <MessageSquarePlus className="size-3" />
                  </button>
                  <span className="w-4 shrink-0 select-none text-center font-mono text-[13px] leading-6 text-diff-add-foreground">
                    {l.kind === 'add' ? '+' : ''}
                  </span>
                  <pre className={cn('min-w-0 flex-1 whitespace-pre-wrap break-all pr-6 font-mono text-[13px] leading-6', l.kind === 'add' ? 'text-diff-add-foreground' : 'text-foreground/80')}>
                    {l.code || ' '}
                  </pre>
                </div>

                {lineComments.map((c) => (
                  <div key={c.id} className="mx-5 my-2 max-w-2xl rounded-lg border border-border bg-background p-3 sm:ml-20">
                    <div className="flex items-center justify-between gap-2">
                      <SeverityChip severity={c.severity} />
                      <button
                        onClick={() => setComments((prev) => prev.filter((p) => p.id !== c.id))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{c.text}</p>
                  </div>
                ))}

                {composer && composer.line === l.n ? (
                  <div className="mx-5 my-2 max-w-2xl rounded-lg border border-foreground/30 bg-background p-3 shadow-sm sm:ml-20">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      New comment · line {l.n}
                    </div>
                    <textarea
                      autoFocus
                      rows={3}
                      value={composer.text}
                      onChange={(e) => setComposer({ ...composer, text: e.target.value, error: '' })}
                      className="mt-2 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                      placeholder="What's wrong, why it matters, and how you'd fix it"
                      maxLength={4000}
                    />
                    {composer.error ? <p className="mt-1 text-[13px] text-destructive">{composer.error}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="mr-1 text-xs text-muted-foreground">Severity</span>
                      {SEVERITIES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setComposer({ ...composer, severity: s })}
                          className={cn('rounded-full', composer.severity === s ? '' : 'opacity-40 hover:opacity-80')}
                        >
                          <SeverityChip severity={s} />
                        </button>
                      ))}
                      <div className="ml-auto flex gap-2">
                        <button onClick={() => setComposer(null)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
                          Cancel
                        </button>
                        <button onClick={saveComment} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                          Add comment
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <aside className="border-t border-border bg-card p-5 lg:w-72 lg:shrink-0 lg:border-l lg:border-t-0">
        <h2 className="text-sm font-semibold">Verdict</h2>
        <p className="mt-1 text-xs text-muted-foreground">Would you merge this PR as-is?</p>
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-border">
          {(['request_changes', 'approve'] as Verdict[]).map((v) => (
            <button
              key={v}
              onClick={() => { setVerdict(v); setNextError('') }}
              className={cn(
                'px-3 py-2 text-sm font-semibold',
                verdict === v ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {v === 'approve' ? 'Approve' : 'Request changes'}
            </button>
          ))}
        </div>
        {nextError ? <p className="mt-2 text-[13px] text-destructive">{nextError}</p> : null}
        <button
          onClick={goNext}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Continue to questions <ArrowRight className="size-4" />
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Your review is locked once you continue.</p>
      </aside>
    </div>
  )
}

function FollowUp({
  answers,
  setAnswers,
  onSubmit,
  submitting,
  error,
}: {
  answers: string[]
  setAnswers: React.Dispatch<React.SetStateAction<string[]>>
  onSubmit: () => void
  submitting: boolean
  error: string
}) {
  const [emptyError, setEmptyError] = useState('')
  const trySubmit = () => {
    if (answers.some((a) => !a.trim())) {
      setEmptyError('Answer all three questions before submitting (a sentence or two is enough).')
      return
    }
    onSubmit()
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-xs text-muted-foreground">Step 3 of 3 · Follow-up questions</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">A few short questions about your review</h1>
      <p className="mt-2 text-sm text-muted-foreground">Two to four sentences each is plenty.</p>
      <div className="mt-8 space-y-7">
        {SCENARIO.followUps.map((q, i) => (
          <div key={q}>
            <label htmlFor={`q${i}`} className="block text-sm font-semibold leading-relaxed">
              {i + 1}. {q}
            </label>
            <textarea
              id={`q${i}`}
              rows={4}
              value={answers[i]}
              onChange={(e) => {
                const val = e.target.value
                setAnswers((prev) => prev.map((a, j) => (j === i ? val : a)))
                setEmptyError('')
              }}
              className="mt-2 w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              maxLength={4000}
            />
          </div>
        ))}
      </div>
      {emptyError ? <p className="mt-4 text-[13px] text-destructive">{emptyError}</p> : null}
      {error ? <p className="mt-4 text-[13px] text-destructive">{error}</p> : null}
      <div className="mt-6 flex justify-end">
        <button
          onClick={trySubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit review'} <ArrowRight className="size-4" />
        </button>
      </div>
    </main>
  )
}

function Done({ name }: { name?: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-foreground">
          <Check className="size-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Review submitted</h1>
        <p className="mt-2 text-sm text-muted-foreground">Thanks{name ? `, ${name}` : ''}. Your response for {SCENARIO.ticketId} is recorded.</p>
        <div className="mt-6 space-y-3 border-t border-border pt-5 text-left text-sm">
          <p><span className="font-semibold">Now:</span> <span className="text-muted-foreground">a panel of independent AI judges scores your comments against the known issues.</span></p>
          <p><span className="font-semibold">If they disagree</span> <span className="text-muted-foreground">on a serious item, a human reviews it.</span></p>
          <p><span className="font-semibold">Then</span> <span className="text-muted-foreground">the hiring team receives an evidence-backed report.</span></p>
        </div>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold underline-offset-4 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  )
}

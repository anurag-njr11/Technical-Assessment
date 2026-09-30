import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ArrowRight, Check, Clock, Info, Loader2, Lock, MessageSquarePlus, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { SeverityChip, TopBar } from '@/components/rb'
import { SCENARIOS, SEVERITIES } from '@/lib/scenario'
import type { AnyScenario, BuildScenario, DecisionScenario, Scenario, Severity } from '@/lib/scenario'
import { AssistantChat, BuildWorkspace } from '@/components/build-workspace'
import { cn } from '@/lib/utils'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/assess']

export const Route = createFileRoute('/assess')({
  validateSearch: (search: Record<string, unknown>): { t: string; g?: string } => ({
    t: typeof search.t === 'string' ? search.t : '',
    ...(typeof search.g === 'string' ? { g: search.g } : {}),
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

const ScenarioContext = createContext<AnyScenario>(SCENARIOS['ord-482-junior'])
const useScenario = () => useContext(ScenarioContext)

// Plain, candidate-facing names for each kind of assessment.
const KIND_LABEL: Record<AnyScenario['kind'], string> = { code: 'Code review', decision: 'Design review', build: 'Build with AI' }

const clean = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : fallback

function Assess() {
  const { t: token, g: groupToken } = Route.useSearch()
  const hydrated = useHydrated()
  const session = useQuery(api.candidates.session, hydrated && token ? { token } : 'skip')

  if (groupToken && !token) return hydrated ? <GroupLanding groupToken={groupToken} /> : <Loading />
  if (!token) return <Notice title="You need an invite link" body="Assessments are taken through a personal link sent by the hiring team. Check your email for the link, or ask your recruiter to resend it." />
  if (!hydrated || session === undefined) return <Loading />
  if (session === null) return <Notice title="This link isn't valid" body="Check that you copied the whole link from your invitation email, or ask your recruiter for a new one." />
  if (session.status === 'revoked') return <Notice title="This invitation was withdrawn" body="Please contact your recruiter if you think this is a mistake." />
  const scenario = SCENARIOS[session.scenarioId]
  if (!scenario) return <Notice title="This assessment isn't available" body="Please contact your recruiter." />
  return (
    <ScenarioContext.Provider value={scenario}>
      {session.status === 'submitted' ? (
        <Shell><Done token={token} groupToken={session.groupToken} /></Shell>
      ) : (
        <Attempt token={token} session={session} />
      )}
    </ScenarioContext.Provider>
  )
}

/** CU-3: one link for a battery of modules, taken in order. */
function GroupLanding({ groupToken }: { groupToken: string }) {
  const group = useQuery(api.candidates.group, { groupToken })
  if (group === undefined) return <Loading />
  if (group === null) return <Notice title="This link isn't valid" body="Check that you copied the whole link from your invitation email." />
  const next = group.modules.find((m) => m.status !== 'submitted' && m.status !== 'revoked')
  const total = group.modules.reduce((s, m) => s + m.minutes, 0)
  return (
    <Shell>
      <main className="rb-rise mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Assessment battery</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{group.battery}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hi {group.name}. This assessment has {group.modules.length} parts, about {total} minutes in total. Each part has its
          own timer that starts when you begin it, so you can take a break between parts.
        </p>
        <ol className="rb-stagger mt-6 space-y-3">
          {group.modules.map((m, i) => (
            <li key={m.scenarioId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent font-mono text-sm font-semibold text-accent-foreground">{i + 1}</span>
                <div>
                <div className="text-xs text-muted-foreground">Part {i + 1} · {KIND_LABEL[m.kind]} · {m.minutes} min</div>
                <div className="mt-1 font-semibold">{SCENARIOS[m.scenarioId]?.title ?? m.title}</div>
                </div>
              </div>
              {m.status === 'submitted' ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success"><Check className="size-4" /> Done</span>
              ) : m.status === 'revoked' ? (
                <span className="text-sm text-muted-foreground">Withdrawn</span>
              ) : (
                <Link
                  to="/assess"
                  search={{ t: m.token }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold',
                    next?.token === m.token ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border',
                  )}
                >
                  {m.status === 'started' ? 'Continue' : 'Start'} <ArrowRight className="size-4" />
                </Link>
              )}
            </li>
          ))}
        </ol>
        {!next ? <p className="mt-6 text-sm font-semibold">All parts are complete. Thank you!</p> : null}
      </main>
    </Shell>
  )
}

type Session = NonNullable<ReturnType<typeof useQuery<typeof api.candidates.session>>>

function Attempt({ token, session }: { token: string; session: Session }) {
  const scenario = useScenario()
  const draft = session.draft
  const [step, setStep] = useState<Step>(session.status === 'started' ? (draft?.step ?? 'review') : 'intro')
  const [comments, setComments] = useState<Comment[]>((draft?.comments as Comment[]) ?? [])
  const [verdict, setVerdict] = useState<Verdict | null>(draft?.verdict ?? null)
  const [answers, setAnswers] = useState<string[]>(draft?.answers ?? scenario.followUps.map(() => ''))
  const [code, setCode] = useState<string>(draft?.code ?? (scenario.kind === 'build' ? scenario.starterCode : ''))
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
  const latest = useRef({ step, comments, verdict, answers, code })
  latest.current = { step, comments, verdict, answers, code }
  const flush = useCallback(
    async (override?: Partial<typeof latest.current>) => {
      const cur = { ...latest.current, ...override }
      if (cur.step !== 'review' && cur.step !== 'followup') return
      setSave({ status: 'saving' })
      try {
        const r = await saveDraft({
          token,
          step: cur.step,
          comments: cur.comments,
          verdict: cur.verdict ?? undefined,
          answers: cur.answers,
          code: scenario.kind === 'build' ? cur.code : undefined,
        })
        setSave({ status: 'saved', at: r.savedAt })
      } catch (err) {
        setSave({ status: 'error', message: clean(err, 'Could not save. Check your connection.') })
      }
    },
    [saveDraft, token, scenario.kind],
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
  }, [comments, verdict, answers, code, step, flush])

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
    if (scenario.kind !== 'build' && !verdict) {
      setSubmitError('Choose a verdict before submitting.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      if (scenario.kind === 'build') await submit({ token, comments: [], answers: [], code })
      else await submit({ token, verdict: verdict!, comments: scenario.kind === 'code' ? comments : [], answers: answers.map((a) => a.trim()) })
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
        subtitle={scenario.kind === 'build' ? scenario.title : `${scenario.ticketId} · ${KIND_LABEL[scenario.kind]} · ${scenario.level}`}
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
      {step === 'review' && scenario.kind === 'code' && (
        <Review token={token} chat={draft?.chat ?? []} comments={comments} setComments={setComments} verdict={verdict} setVerdict={setVerdict} onNext={toFollowUps} />
      )}
      {step === 'review' && scenario.kind === 'decision' && (
        <DecisionForm
          scenario={scenario}
          verdict={verdict}
          setVerdict={setVerdict}
          answers={answers}
          setAnswers={setAnswers}
          onSubmit={finish}
          submitting={submitting}
          error={submitError}
        />
      )}
      {step === 'review' && scenario.kind === 'build' && (
        <BuildWorkspace
          token={token}
          scenario={scenario}
          code={code}
          setCode={setCode}
          chat={draft?.chat ?? []}
          onSubmit={finish}
          submitting={submitting}
          error={submitError}
        />
      )}
      {step === 'followup' && (
        <FollowUp answers={answers} setAnswers={setAnswers} onSubmit={finish} submitting={submitting} error={submitError} />
      )}
      {step === 'done' && <Done name={session.name} token={token} groupToken={session.groupToken} />}
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
    <main className="rb-rise mx-auto max-w-lg px-4 py-16 sm:px-6 sm:py-20">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.35)]">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">{icon ?? <Lock className="size-5" />}</div>
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
  const scenario = useScenario()
  const bullets = scenario.kind === 'decision' ? scenario.constraints : scenario.criteria
  const steps =
    scenario.kind === 'code'
      ? ["Read the pull request and the agent's notes", 'Ask the agent about anything unclear', 'Comment on lines that need changes', 'Approve or request changes', 'Answer 3 short questions']
      : scenario.kind === 'decision'
        ? ['Read the context and the AI recommendation', 'Approve or reject it', 'Explain flawed assumptions and ignored risks', 'Propose what you would do instead']
        : ['Read the task', 'Write code with the AI assistant', 'Run the tests', 'Submit']
  const note =
    scenario.kind === 'code'
      ? "A teammate's AI agent already opened a pull request for this ticket. Review it as you would any PR: leave line comments, rate severity, and decide whether to approve or request changes. AI-written code can be confidently wrong, so verify before you trust it. You can read every file, including unchanged helpers."
      : scenario.kind === 'decision'
        ? 'An AI agent wrote this recommendation. It may contain sound ideas and flawed reasoning side by side. Weigh each claim against the context and constraints.'
        : "Use the AI assistant however you like, just as you would at work. It can be wrong, so check what it gives you. You're responsible for the code you submit. Your chat with the assistant is shared with the hiring team."
  return (
    <main className="rb-rise mx-auto grid max-w-7xl items-start gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {KIND_LABEL[scenario.kind]}{scenario.kind === 'build' ? '' : ` · ${scenario.ticketId}`}
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">{scenario.title}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {[scenario.stack, `${minutes} min`].map((c) => (
            <span key={c} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              {c}
            </span>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{scenario.summary}</p>

        <h2 className="mt-8 text-sm font-semibold">{scenario.kind === 'decision' ? 'Constraints' : scenario.kind === 'build' ? 'What your code must do' : 'Acceptance criteria'}</h2>
        <ul className="mt-3 space-y-2.5">
          {bullets.map((c) => (
            <li key={c} className="flex gap-3 text-sm text-foreground/80">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {c}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex max-w-2xl gap-3 rounded-xl border border-primary/20 bg-accent/60 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
        </div>
      </div>

      <aside className="rounded-2xl border border-border bg-card p-6 shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.35)] lg:sticky lg:top-24">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">How it works</h2>
        <ol className="mt-4 space-y-3 text-sm">
          {steps.map(
            (s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent font-mono text-xs font-semibold text-accent-foreground">{i + 1}</span>
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
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {starting ? <Loader2 className="size-4 animate-spin" /> : null} Start <ArrowRight className="size-4" />
        </button>
        {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
        <p className="mt-2 text-center text-xs text-muted-foreground">The timer starts when you click Start and can't be paused</p>
      </aside>
    </main>
  )
}

function Review({
  token,
  chat,
  comments,
  setComments,
  verdict,
  setVerdict,
  onNext,
}: {
  token: string
  chat: Array<{ id: string; type: string; data: string }>
  comments: Comment[]
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>
  verdict: Verdict | null
  setVerdict: (v: Verdict) => void
  onNext: () => void
}) {
  const scenario = useScenario() as Scenario
  const [activePath, setActivePath] = useState(scenario.files[0].path)
  const [composer, setComposer] = useState<{ line: number; severity: Severity; text: string; error: string } | null>(null)
  const [nextError, setNextError] = useState('')
  const [prompt, setPrompt] = useState('')
  const file = useMemo(() => scenario.files.find((f) => f.path === activePath)!, [activePath, scenario])

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
          {scenario.files.map((f) => {
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
        {scenario.rationale || scenario.assumptions?.length ? (
          <div className="border-b border-border bg-background px-5 py-4">
            <h2 className="text-[15px] font-semibold tracking-tight">The AI agent's notes</h2>
            {scenario.rationale ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{scenario.rationale}</p> : null}
            {scenario.assumptions?.length ? (
              <ul className="mt-2 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/80">
                {scenario.assumptions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
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
                        <button onClick={saveComment} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
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

      <aside className="flex flex-col border-t border-border bg-card lg:w-96 lg:shrink-0 lg:border-l lg:border-t-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Ask the agent</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">The AI that wrote this pull request. Ask why it did something.</p>
        </div>
        <AssistantChat
          token={token}
          chat={chat}
          prompt={prompt}
          setPrompt={setPrompt}
          emptyText="Not sure about a change? Ask the agent to explain it."
          className="lg:max-h-[55vh] lg:flex-1"
        />
        <div className="border-t border-border p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Verdict</h2>
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
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Continue to questions <ArrowRight className="size-4" />
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Your review is locked once you continue.</p>
        </div>
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
    <main className="rb-rise mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Step 3 of 3 · Follow-up questions</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">A few short questions about your review</h1>
      <p className="mt-2 text-sm text-muted-foreground">Two to four sentences each is plenty.</p>
      <div className="mt-8 space-y-5">
        {useScenario().followUps.map((q, i) => (
          <div key={q} className="rounded-xl border border-border bg-card p-5">
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
              className="mt-3 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15"
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
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit review'} <ArrowRight className="size-4" />
        </button>
      </div>
    </main>
  )
}

function Done({ name, token, groupToken }: { name?: string; token: string; groupToken?: string | null }) {
  const scenario = useScenario()
  return (
    <main className="rb-rise mx-auto max-w-lg px-4 py-16 sm:px-6 sm:py-20">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.35)]">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <Check className="size-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Submitted</h1>
        <p className="mt-2 text-sm text-muted-foreground">Thanks{name ? `, ${name}` : ''}. We've received your work on "{scenario.title}".</p>
        <div className="mt-6 space-y-3 border-t border-border pt-5 text-left text-sm">
          <p className="text-muted-foreground">The hiring team will look at your work and be in touch about next steps. You can close this page.</p>
          <p className="text-muted-foreground">
            If the hiring team shares your results, you'll find them at{' '}
            <Link to="/results" search={{ t: token }} className="font-semibold text-primary underline underline-offset-4">your results page</Link>,
            where you can also ask for a human review.
          </p>
        </div>
        {groupToken ? (
          <Link to="/assess" search={{ t: '', g: groupToken }} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Continue to the next part <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </main>
  )
}

function DecisionForm({
  scenario,
  verdict,
  setVerdict,
  answers,
  setAnswers,
  onSubmit,
  submitting,
  error,
}: {
  scenario: DecisionScenario
  verdict: Verdict | null
  setVerdict: (v: Verdict) => void
  answers: string[]
  setAnswers: React.Dispatch<React.SetStateAction<string[]>>
  onSubmit: () => void
  submitting: boolean
  error: string
}) {
  const [localError, setLocalError] = useState('')
  const trySubmit = () => {
    if (!verdict) return setLocalError('Approve or reject the recommendation first.')
    if (answers.some((a) => !a.trim())) return setLocalError('Fill in all three sections (a few sentences each is enough).')
    setLocalError('')
    onSubmit()
  }
  return (
    <main className="rb-rise mx-auto grid max-w-7xl items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2">
      <section className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-[15px] font-semibold tracking-tight">Context</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground/80">
            {scenario.context.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <h2 className="mt-5 text-sm font-semibold">Constraints</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground/80">
            {scenario.constraints.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">AI agent's recommendation</h2>
            <span className="font-mono text-xs text-muted-foreground">{scenario.ticketId}.md</span>
          </div>
          <ol className="mt-3 space-y-2 font-mono text-[13px] leading-relaxed">
            {scenario.recommendation.map((r, i) => (
              <li key={r} className="flex gap-3">
                <span className="w-5 shrink-0 text-right text-muted-foreground/60">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-[15px] font-semibold tracking-tight">Your decision</h2>
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-border">
          {(['request_changes', 'approve'] as Verdict[]).map((v) => (
            <button
              key={v}
              onClick={() => { setVerdict(v); setLocalError('') }}
              className={cn('px-3 py-2 text-sm font-semibold', verdict === v ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent')}
            >
              {v === 'approve' ? 'Approve the recommendation' : 'Reject it'}
            </button>
          ))}
        </div>
        <div className="mt-6 space-y-6">
          {scenario.followUps.map((q, i) => (
            <div key={q}>
              <label htmlFor={`d${i}`} className="block text-sm font-semibold leading-relaxed">{i + 1}. {q}</label>
              <textarea
                id={`d${i}`}
                rows={5}
                value={answers[i] ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  setAnswers((prev) => prev.map((a, j) => (j === i ? val : a)))
                  setLocalError('')
                }}
                maxLength={4000}
                className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
          ))}
        </div>
        {localError || error ? <p className="mt-4 text-[13px] text-destructive">{localError || error}</p> : null}
        <div className="mt-6 flex justify-end">
          <button
            onClick={trySubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit critique'} <ArrowRight className="size-4" />
          </button>
        </div>
      </section>
    </main>
  )
}

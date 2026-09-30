import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, Check, Copy, Download, Loader2, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { BandChip, PageHeader, Panel, btn, cleanError } from '@/components/rb'
import { BATTERY_OPTIONS, MODULE_LABEL, SCENARIOS } from '@/lib/scenario'
import { RecruiterGate, RecruiterPage } from '@/components/recruiter-gate'
import { cn } from '@/lib/utils'
import { AssessmentLink } from '@/components/assessment-link'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/recruiter']

export const Route = createFileRoute('/recruiter')({
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: () => (
    <RecruiterGate>
      <Recruiter />
    </RecruiterGate>
  ),
})

type StatusFilter = 'all' | 'grading' | 'graded' | 'review' | 'error'

function Recruiter() {
  const rows = useQuery(api.submissions.list)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const completed = rows?.filter((r) => r.status === 'graded').length ?? 0
  const flagged = rows?.filter((r) => r.needsReview && !r.reviewResolved).length ?? 0
  // FR-R-5: filter by status and search by candidate name.
  const visible = useMemo(
    () =>
      rows?.filter((r) => {
        if (search && !r.candidateName.toLowerCase().includes(search.trim().toLowerCase())) return false
        if (status === 'review') return !!r.needsReview && !r.reviewResolved
        if (status !== 'all') return r.status === status
        return true
      }),
    [rows, search, status],
  )

  return (
    <RecruiterPage>
      <PageHeader
        eyebrow="Recruiter dashboard"
        title="Assessments"
        description="Create an assessment, share its link or QR code, then open each candidate's evidence-backed report."
      />

      <div className="rb-stagger mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Submitted" value={rows?.length ?? 0} />
        <Stat label="Graded" value={completed} />
        <Stat label="Awaiting human review" value={flagged} tone={flagged ? 'danger' : undefined} />
      </div>

      <AssessmentsPanel />

      <Panel
        flush
        className="mt-8"
        title="All submissions"
        description="Every attempt across your assessments."
        actions={
          <button onClick={() => rows && downloadCsv(rows)} disabled={!rows?.length} className={btn.secondary}>
            <Download className="size-4" /> Export CSV
          </button>
        }
      >
        <div className="mt-4 flex flex-col gap-2 border-y border-border bg-muted/40 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates"
            aria-label="Search candidates"
            className={cn(fieldCls, 'sm:w-72')}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className={cn(fieldCls, 'sm:w-44')}
          >
            <option value="all">All statuses</option>
            <option value="grading">Grading</option>
            <option value="graded">Graded</option>
            <option value="review">Needs review</option>
            <option value="error">Error</option>
          </select>
          {visible ? <span className="text-xs text-muted-foreground sm:ml-auto">{visible.length} shown</span> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-6 py-3 font-semibold">Candidate</th>
                <th className="px-5 py-3 font-semibold">Module</th>
                <th className="px-5 py-3 font-semibold">Score</th>
                <th className="px-5 py-3 font-semibold">Issues found</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {visible === undefined ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    {rows && rows.length > 0 ? 'No submissions match these filters.' : 'No submissions yet. Create an assessment above and share its link.'}
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r._id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                    <td className="px-6 py-4">
                      <Link to="/report" search={{ id: r._id }} className="font-semibold hover:text-primary hover:underline">
                        {r.candidateName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {SCENARIOS[r.scenarioId]?.ticketId ?? r.scenarioId} · {r.level}
                      {r.appealOpen ? <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">appeal</span> : null}
                    </td>
                    <td className="px-5 py-4"><BandChip band={r.band} score={r.overall} /></td>
                    <td className="px-5 py-4 font-mono text-muted-foreground">
                      {r.found !== undefined ? `${r.found} / ${r.total}` : '—'}
                    </td>
                    <td className="px-5 py-4">
                      {r.status === 'grading' ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" /> Grading
                        </span>
                      ) : r.status === 'error' ? (
                        <span className="text-destructive">Error</span>
                      ) : r.needsReview && !r.reviewResolved ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive-soft px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="size-3.5" /> Needs review
                        </span>
                      ) : r.reviewResolved ? (
                        <span className="text-muted-foreground">Reviewed</span>
                      ) : (
                        <span className="text-muted-foreground">Graded</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                      {new Date(r.submittedAt).toLocaleString()}
                      {r.autoSubmitted ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans">auto</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <h2 className="mt-12 text-lg font-semibold tracking-tight">Invites &amp; hiring team</h2>
      <p className="mt-1 text-sm text-muted-foreground">Single-use candidate links, and who on your team can see results.</p>
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <InvitePanel />
        <TeamPanel />
      </div>
    </RecruiterPage>
  )
}

/** Mirrors ROLES in convex/assessments.ts. */
const ROLES = ['AI Engineer', 'Software Engineer', 'Backend Engineer', 'ML Engineer', 'Full-Stack Engineer']
const LEVELS = ['Junior', 'Mid', 'Senior']
const SCENARIO_LIST = Object.values(SCENARIOS)
// Flagship: AI PR review with the agent (code review + agent chat).
const DEFAULT_SCENARIO = SCENARIOS['pay-217-mid'] ?? SCENARIO_LIST[0]
const levelOf = (id: string) => (LEVELS.includes(SCENARIOS[id].level) ? SCENARIOS[id].level : 'Junior')
const fieldCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15'

function AssessmentsPanel() {
  const assessments = useQuery(api.assessments.list)
  const create = useMutation(api.assessments.create)
  const [role, setRole] = useState(ROLES[0])
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO.id)
  const [level, setLevel] = useState(levelOf(DEFAULT_SCENARIO.id))
  const [minutes, setMinutes] = useState(String(DEFAULT_SCENARIO.minutes))
  const [aiAssisted, setAiAssisted] = useState(DEFAULT_SCENARIO.kind !== 'decision')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null)
  const aiCapable = SCENARIOS[scenarioId]?.kind !== 'decision'

  const pickScenario = (id: string) => {
    setScenarioId(id)
    setMinutes(String(SCENARIOS[id].minutes))
    setLevel(levelOf(id))
    setAiAssisted(SCENARIOS[id].kind === 'build')
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setCreated(await create({ role, scenarioId, level, minutes: Number(minutes), aiAssisted: aiCapable && aiAssisted }))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Panel className="mt-8" title="Create assessment" description="Pick a role and module. Everyone who opens the link gets their own attempt.">
        <form onSubmit={send} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_140px_140px]">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)} className={fieldCls}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Module
            <select value={scenarioId} onChange={(e) => pickScenario(e.target.value)} className={fieldCls}>
              {SCENARIO_LIST.map((sc) => (
                <option key={sc.id} value={sc.id}>{MODULE_LABEL[sc.kind]} · {sc.ticketId} {sc.title}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={fieldCls}>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Time limit (min)
            <input type="number" min={10} max={90} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={fieldCls} />
          </label>
          <label className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" className="accent-primary" checked={aiCapable && aiAssisted} disabled={!aiCapable} onChange={(e) => setAiAssisted(e.target.checked)} />
            <span className="font-medium">AI-assisted</span>
            <span className="text-xs text-muted-foreground">
              {aiCapable ? 'Candidate works with an AI assistant; judges score the whole interaction.' : 'Not available for decision reviews.'}
            </span>
          </label>
          <button type="submit" disabled={busy} className={cn(btn.primary, 'whitespace-nowrap')}>
            {busy ? 'Creating…' : 'Create assessment'}
          </button>
        </form>
        {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
        {created ? (
          <div className="rb-rise mt-5 border-t border-border pt-5">
            <AssessmentLink token={created.token} />
            <Link to="/assessment" search={{ id: created.id }} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
              View candidates →
            </Link>
          </div>
        ) : null}
      </Panel>

      <Panel flush className="mt-5" title="Your assessments" description="Open one to see its candidates and compare them side by side.">
      <div className="mt-4 overflow-x-auto border-t border-border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="px-6 py-3 font-semibold">Assessment</th>
              <th className="px-5 py-3 font-semibold">Module</th>
              <th className="px-5 py-3 font-semibold">Joined</th>
              <th className="px-5 py-3 font-semibold">In progress</th>
              <th className="px-5 py-3 font-semibold">Submitted</th>
              <th className="px-5 py-3 font-semibold">Avg score</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {assessments === undefined ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
            ) : assessments.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No assessments yet. Create one above.</td></tr>
            ) : (
              assessments.map((a) => (
                <tr key={a._id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                  <td className="px-6 py-4">
                    <Link to="/assessment" search={{ id: a._id }} className="font-semibold hover:text-primary hover:underline">{a.title}</Link>
                    <div className="text-xs text-muted-foreground">{a.role} · {a.level} · {a.minutes} min{a.aiAssisted ? ' · AI-assisted' : ''}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{SCENARIOS[a.scenarioId]?.ticketId ?? a.scenarioId}</td>
                  <td className="px-5 py-4 font-mono">{a.counts.invited + a.counts.started + a.counts.submitted}</td>
                  <td className="px-5 py-4 font-mono">{a.counts.started}</td>
                  <td className="px-5 py-4 font-mono">{a.counts.submitted}</td>
                  <td className="px-5 py-4 font-mono">{a.avgScore === null ? '—' : Math.round(a.avgScore)}</td>
                  <td className="px-5 py-4"><StatusPill status={a.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </Panel>
    </>
  )
}

function TeamPanel() {
  const team = useQuery(api.access.team)
  const invite = useMutation(api.access.invite)
  const revoke = useMutation(api.access.revokeInvite)
  const remove = useMutation(api.access.removeMember)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!team) return null
  const isOwner = team.myRole === 'owner'

  const clean = (err: unknown) => cleanError(err)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      await invite({ email: email.trim() })
      setEmail('')
    } catch (err) {
      setError(clean(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Hiring team"
      description={`Only team members can see results and answer keys.${isOwner ? ' Invited people get access after they sign up and verify that email.' : ''}`}
    >
      <ul className="divide-y divide-border">
        {team.members.map((m) => (
          <li key={m._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="truncate">
              {m.email} {m.isMe ? <span className="text-muted-foreground">(you)</span> : null}
            </span>
            <span className="flex items-center gap-3">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold capitalize">{m.role}</span>
              {isOwner && m.role !== 'owner' ? (
                <button
                  onClick={() => remove({ id: m._id as Id<'recruiters'> }).catch((err) => setError(clean(err)))}
                  aria-label={`Remove ${m.email}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </span>
          </li>
        ))}
        {team.invites.map((i) => (
          <li key={i._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="truncate text-muted-foreground">{i.email}</span>
            <span className="flex items-center gap-3">
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Invited</span>
              <button
                onClick={() => revoke({ id: i._id as Id<'invites'> }).catch((err) => setError(clean(err)))}
                aria-label={`Revoke invite for ${i.email}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={send} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            placeholder="teammate@company.com"
            aria-label="Teammate email"
            className={cn(fieldCls, 'flex-1')}
          />
          <button type="submit" disabled={busy} className={btn.primary}>
            Invite
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
    </Panel>
  )
}


/** FR-R-6 / FR-C-12: create a candidate and get their single-use link. */
function InvitePanel() {
  const candidates = useQuery(api.candidates.list)
  const create = useMutation(api.candidates.create)
  const revoke = useMutation(api.candidates.revoke)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [extra, setExtra] = useState('0')
  const [assessment, setAssessment] = useState('scenario:ord-482-junior')
  const [benchmark, setBenchmark] = useState(false)
  const [group, setGroup] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const linkFor = (token: string, isGroup = false) => `${window.location.origin}/assess?${isGroup ? 'g' : 't'}=${token}`
  const copy = async (token: string, isGroup = false) => {
    try {
      await navigator.clipboard.writeText(linkFor(token, isGroup))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copy this link', linkFor(token, isGroup))
    }
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const [kind, id] = assessment.split(':')
      const r = await create({
        name,
        email: email.trim() || undefined,
        ...(kind === 'battery' ? { batteryId: id } : { scenarioId: id }),
        extraMinutes: Number(extra) || 0,
        benchmark,
        group: group.trim() || undefined,
      })
      setName('')
      setEmail('')
      setExtra('0')
      setGroup('')
      if (r.groupToken) await copy(r.groupToken, true)
      else await copy(r.token)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const openRows = candidates?.filter((c) => c.status === 'invited' || c.status === 'started') ?? []
  // A battery shows as one row with one link.
  const seen = new Set<string>()
  const open = openRows.filter((c) => {
    if (!c.groupToken) return true
    if (seen.has(c.groupToken)) return false
    seen.add(c.groupToken)
    return true
  })
  return (
    <Panel
      title="Invite a candidate"
      description="Each candidate gets a personal, single-use link. The link is copied to your clipboard when you create it."
    >
      <form onSubmit={send} className="grid gap-2.5 sm:grid-cols-2">
        <select value={assessment} onChange={(e) => setAssessment(e.target.value)} aria-label="Assessment" className={cn(fieldCls, 'sm:col-span-2')}>
          <optgroup label="Single module">
            {Object.values(SCENARIOS).map((sc) => (
              <option key={sc.id} value={`scenario:${sc.id}`}>{MODULE_LABEL[sc.kind]} · {sc.ticketId} {sc.title} ({sc.level}, {sc.minutes} min)</option>
            ))}
          </optgroup>
          <optgroup label="Battery (one link, several modules)">
            {BATTERY_OPTIONS.map((b) => (
              <option key={b.id} value={`battery:${b.id}`}>
                {b.name} · {b.scenarioIds.reduce((t, id) => t + (SCENARIOS[id]?.minutes ?? 0), 0)} min
              </option>
            ))}
          </optgroup>
        </select>
        <input value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="Candidate name" aria-label="Candidate name" required maxLength={120}
          className={fieldCls} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" aria-label="Candidate email" type="email"
          className={fieldCls} />
        <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-muted-foreground">
          Extra minutes
          <input value={extra} onChange={(e) => setExtra(e.target.value)} type="number" min={0} max={120} aria-label="Extra minutes (accommodation)"
            className={fieldCls} />
        </label>
        <button type="submit" disabled={busy} className={btn.primary}>
          Create link
        </button>
        <details className="text-xs text-muted-foreground sm:col-span-2">
          <summary className="cursor-pointer font-semibold">More options</summary>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={benchmark} onChange={(e) => setBenchmark(e.target.checked)} />
              Internal engineer (sets local norms, excluded from hiring stats)
            </label>
            <label className="inline-flex items-center gap-2">
              Self-identified group (optional, with consent)
              <input value={group} onChange={(e) => setGroup(e.target.value)} maxLength={60} aria-label="Self-identified group"
                className="rounded-lg border border-input bg-card px-2 py-1 text-sm text-foreground" />
            </label>
          </div>
        </details>
      </form>
      {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
      {open.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {open.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{c.name}</span>
                {c.email ? <span className="text-muted-foreground"> · {c.email}</span> : null}
                <span className="text-muted-foreground">
                  {' · '}
                  {c.batteryId ? BATTERY_OPTIONS.find((b) => b.id === c.batteryId)?.name ?? 'Battery' : SCENARIOS[c.scenarioId]?.ticketId ?? c.scenarioId}
                </span>
                {c.extraMinutes ? <span className="text-muted-foreground"> · +{c.extraMinutes} min</span> : null}
                {c.benchmark ? <span className="text-muted-foreground"> · internal</span> : null}
              </span>
              <span className="flex items-center gap-3">
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold capitalize text-muted-foreground">
                  {c.status === 'started' ? 'In progress' : 'Not started'}
                </span>
                <button onClick={() => copy(c.groupToken ?? c.token, !!c.groupToken)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  {copied === (c.groupToken ?? c.token) ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === (c.groupToken ?? c.token) ? 'Copied' : 'Copy link'}
                </button>
                <button
                  onClick={() =>
                    Promise.all(
                      (c.groupToken ? openRows.filter((x) => x.groupToken === c.groupToken) : [c]).map((x) => revoke({ id: x._id })),
                    ).catch((err) => setError(cleanError(err)))
                  }
                  aria-label={`Revoke link for ${c.name}`}
                  className="text-muted-foreground hover:text-destructive">
                  <X className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}

/** ATS-friendly export of the dashboard rows (webhook integrations: later). */
function downloadCsv(rows: Array<Record<string, unknown>>) {
  const cols = ['candidateName', 'scenarioId', 'level', 'status', 'overall', 'band', 'found', 'total', 'needsReview', 'reviewResolved', 'autoSubmitted', 'submittedAt']
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c === 'submittedAt' ? new Date(r[c] as number).toISOString() : r[c])).join(','))]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `reviewbench-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className={cn('rounded-xl border bg-card px-5 py-4 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]', tone === 'danger' ? 'border-destructive/30' : 'border-border')}>
      <div className={cn('text-xs font-medium', tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')}>{label}</div>
      <div className={cn('mt-1 font-mono text-3xl font-semibold tracking-tight', tone === 'danger' && 'text-destructive')}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'active'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
      <span className={cn('size-1.5 rounded-full', active ? 'bg-success' : 'bg-muted-foreground/60')} />
      {status}
    </span>
  )
}

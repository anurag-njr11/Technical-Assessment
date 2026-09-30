import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, Check, Copy, Download, Loader2, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { BandChip, RecruiterNav, TopBar, cleanError } from '@/components/rb'
import { BATTERY_OPTIONS, MODULE_LABEL, SCENARIOS } from '@/lib/scenario'
import { RecruiterGate, SignOutButton } from '@/components/recruiter-gate'
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
    <div className="min-h-screen bg-background">
      <TopBar
        subtitle="Recruiter dashboard"
        right={
          <>
            <RecruiterNav />
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Code Review, Decision Review and Directed Build assessments</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Stat label="Submitted" value={rows?.length ?? 0} />
          <Stat label="Graded" value={completed} />
          <Stat label="Awaiting human review" value={flagged} tone={flagged ? 'danger' : undefined} />
        </div>

        <InvitePanel />

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates"
            aria-label="Search candidates"
            className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30 sm:w-64"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="rounded-md border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="grading">Grading</option>
            <option value="graded">Graded</option>
            <option value="review">Needs review</option>
            <option value="error">Error</option>
          </select>
          <button
            onClick={() => rows && downloadCsv(rows)}
            disabled={!rows?.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50 sm:ml-auto"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Candidate</th>
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
                    {rows && rows.length > 0 ? 'No submissions match these filters.' : 'No submissions yet. Invite a candidate above to get started.'}
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r._id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-5 py-4">
                      <Link to="/report" search={{ id: r._id }} className="font-semibold hover:underline">
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

        <TeamPanel />
      </main>
    </div>
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
    <section className="mt-10 rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Hiring team</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only team members can see results and answer keys.
        {isOwner ? ' Invited people get access after they sign up and verify that email.' : ''}
      </p>
      <ul className="mt-4 divide-y divide-border">
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
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Invite
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
    </section>
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
    <section className="mt-8 rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Invite a candidate</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each candidate gets a personal, single-use link. The link is copied to your clipboard when you create it.
      </p>
      <form onSubmit={send} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto]">
        <select value={assessment} onChange={(e) => setAssessment(e.target.value)} aria-label="Assessment" className="rounded-md border border-input bg-background px-3 py-2 text-sm sm:col-span-4">
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
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" aria-label="Candidate email" type="email"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Extra min
          <input value={extra} onChange={(e) => setExtra(e.target.value)} type="number" min={0} max={120} aria-label="Extra minutes (accommodation)"
            className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground" />
        </label>
        <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          Create link
        </button>
        <details className="text-xs text-muted-foreground sm:col-span-4">
          <summary className="cursor-pointer font-semibold">More options</summary>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={benchmark} onChange={(e) => setBenchmark(e.target.checked)} />
              Internal engineer (sets local norms, excluded from hiring stats)
            </label>
            <label className="inline-flex items-center gap-2">
              Self-identified group (optional, with consent)
              <input value={group} onChange={(e) => setGroup(e.target.value)} maxLength={60} aria-label="Self-identified group"
                className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground" />
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
    </section>
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
    <div className={tone === 'danger' ? 'min-w-40 rounded-xl border border-destructive/30 bg-card px-5 py-4' : 'min-w-40 rounded-xl border border-border bg-card px-5 py-4'}>
      <div className={tone === 'danger' ? 'font-mono text-2xl font-semibold text-destructive' : 'font-mono text-2xl font-semibold'}>{value}</div>
      <div className={tone === 'danger' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{label}</div>
    </div>
  )
}

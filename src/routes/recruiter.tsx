import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { BandChip, TopBar } from '@/components/rb'
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

function Recruiter() {
  const rows = useQuery(api.submissions.list)
  const completed = rows?.filter((r) => r.status === 'graded').length ?? 0
  const flagged = rows?.filter((r) => r.needsReview).length ?? 0

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        subtitle="Recruiter dashboard"
        right={
          <>
            <Link to="/assess" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
              Candidate view
            </Link>
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI code review assessment · Backend Engineering</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Stat label="Submitted" value={rows?.length ?? 0} />
          <Stat label="Graded" value={completed} />
          <Stat label="Flagged for human review" value={flagged} tone={flagged ? 'danger' : undefined} />
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Candidate</th>
                <th className="px-5 py-3 font-semibold">Level</th>
                <th className="px-5 py-3 font-semibold">Score</th>
                <th className="px-5 py-3 font-semibold">Issues found</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows === undefined ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    No submissions yet. Share the{' '}
                    <Link to="/assess" className="font-semibold text-foreground underline-offset-4 hover:underline">
                      assessment link
                    </Link>{' '}
                    with a candidate.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-5 py-4">
                      <Link to="/report" search={{ id: r._id }} className="font-semibold hover:underline">
                        {r.candidateName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{r.level}</td>
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
                      ) : r.needsReview ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive-soft px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="size-3.5" /> Needs review
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Graded</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                      {new Date(r.submittedAt).toLocaleString()}
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

  const clean = (err: unknown) =>
    err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'Something went wrong.'

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

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className={tone === 'danger' ? 'min-w-40 rounded-xl border border-destructive/30 bg-card px-5 py-4' : 'min-w-40 rounded-xl border border-border bg-card px-5 py-4'}>
      <div className={tone === 'danger' ? 'font-mono text-2xl font-semibold text-destructive' : 'font-mono text-2xl font-semibold'}>{value}</div>
      <div className={tone === 'danger' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{label}</div>
    </div>
  )
}

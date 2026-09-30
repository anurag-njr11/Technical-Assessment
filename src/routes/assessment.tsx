import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { BandChip, RecruiterNav, TopBar, cleanError } from '@/components/rb'
import { RecruiterGate, SignOutButton } from '@/components/recruiter-gate'
import { AssessmentLink } from '@/components/assessment-link'
import { MODULE_LABEL, SCENARIOS } from '@/lib/scenario'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/assessment')({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === 'string' ? search.id : '',
  }),
  head: () => ({ meta: [{ title: 'Assessment — ReviewBench' }] }),
  component: () => (
    <RecruiterGate>
      <Assessment />
    </RecruiterGate>
  ),
})

type Row = {
  _id: string
  name: string
  email: string | null
  status: string
  startedAt: number | null
  submissionId: string | null
  gradingStatus: string | null
  score: number | null
  band: string | null
  needsReview: boolean | null
  humanReview: string | null
  submittedAt: number | null
  verdict: string | null
  dimensions: Record<string, number>
  tokens: number
}

const STATUS: Record<string, string> = { invited: 'Not started', started: 'In progress', submitted: 'Submitted' }
const minutesTaken = (r: Row) => (r.startedAt && r.submittedAt ? (r.submittedAt - r.startedAt) / 60000 : null)

/** Metric columns shared by the candidate table and the comparison view (dimension keys from result.trajectory). */
const METRICS: Array<{ key: string; label: string; value: (r: Row) => number | null; show?: (r: Row) => string }> = [
  { key: 'overall', label: 'Overall', value: (r) => r.score },
  { key: 'engineeringJudgment', label: 'Engineering judgment', value: (r) => r.dimensions.engineeringJudgment ?? null },
  { key: 'trustCalibration', label: 'AI verification', value: (r) => r.dimensions.trustCalibration ?? null },
  { key: 'issueDetection', label: 'Issue detection', value: (r) => r.dimensions.issueDetection ?? null },
  { key: 'promptQuality', label: 'Prompt quality', value: (r) => r.dimensions.promptQuality ?? null },
  { key: 'interactionQuality', label: 'AI interaction', value: (r) => r.dimensions.interactionQuality ?? null },
  {
    key: 'efficiency',
    label: 'Efficiency (tokens)',
    value: (r) => r.dimensions.efficiency ?? null,
    show: (r) => `${fmt(r.dimensions.efficiency ?? null)} · ${r.tokens.toLocaleString()}`,
  },
  { key: 'time', label: 'Time taken', value: minutesTaken, show: (r) => (minutesTaken(r) === null ? '—' : `${Math.round(minutesTaken(r)!)} min`) },
  { key: 'verification', label: 'Testing / validation', value: (r) => r.dimensions.verification ?? null },
]
const fmt = (n: number | null) => (n === null ? '—' : String(Math.round(n)))

function Assessment() {
  const { id } = Route.useSearch()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const a = useQuery(api.assessments.get, id ? { id: id as Id<'assessments'> } : 'skip')
  const setStatus = useMutation(api.assessments.setStatus)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'overall', desc: true })
  const [picked, setPicked] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)

  const right = (
    <>
      <RecruiterNav />
      <Link to="/recruiter" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Assessments
      </Link>
      <SignOutButton />
    </>
  )
  if (!mounted || (id && a === undefined)) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar right={right} />
        <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </div>
    )
  }
  if (!id || !a) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar right={right} />
        <p className="py-24 text-center text-muted-foreground">Assessment not found.</p>
      </div>
    )
  }
  const sc = SCENARIOS[a.scenarioId]
  const metric = METRICS.find((m) => m.key === sort.key)
  const rows = [...(a.candidates as Row[])].sort((x, y) => {
    if (!metric) return 0
    const vx = metric.value(x), vy = metric.value(y)
    if (vx === null) return 1 // unscored rows always last
    if (vy === null) return -1
    return sort.desc ? vy - vx : vx - vy
  })
  const toggle = (rid: string) =>
    setPicked((p) => (p.includes(rid) ? p.filter((x) => x !== rid) : p.length < 4 ? [...p, rid] : p))
  const compared = rows.filter((r) => picked.includes(r._id))

  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Assessment" right={right} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.role} · {sc ? `${MODULE_LABEL[sc.kind]} · ${sc.ticketId}` : a.scenarioId} · {a.level} · {a.minutes} min
              {a.aiAssisted ? ' · AI-assisted' : ''}
            </p>
          </div>
          <button
            onClick={() => setStatus({ id: a._id, status: a.status === 'active' ? 'closed' : 'active' }).catch((err) => setError(cleanError(err)))}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
          >
            {a.status === 'active' ? 'Close assessment' : 'Reopen assessment'}
          </button>
        </div>
        {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}

        <section className="mt-6 rounded-xl border border-border bg-card p-6">
          {a.status === 'active' ? <AssessmentLink token={a.token} /> : <p className="text-sm text-muted-foreground">Closed: the link no longer accepts new candidates.</p>}
        </section>

        <div className="mt-8 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Candidates ({rows.length})</h2>
          <button
            onClick={() => setComparing(true)}
            disabled={picked.length < 2}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Compare {picked.length ? `(${picked.length})` : ''}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Tick 2–4 candidates to compare them side by side. Click a column to sort.</p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 font-semibold">Candidate</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="px-3 py-3 font-semibold">
                    <button onClick={() => setSort((s) => ({ key: m.key, desc: s.key === m.key ? !s.desc : true }))} className="uppercase hover:text-foreground">
                      {m.label}{sort.key === m.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold">Final outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={METRICS.length + 3} className="px-5 py-12 text-center text-muted-foreground">No candidates yet. Share the link or QR code above.</td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c._id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-3 py-3">
                      <input type="checkbox" aria-label={`Compare ${c.name}`} checked={picked.includes(c._id)} onChange={() => toggle(c._id)}
                        disabled={!picked.includes(c._id) && picked.length >= 4} />
                    </td>
                    <td className="px-3 py-3">
                      <CandidateName c={c} />
                      <div className="text-xs text-muted-foreground">{STATUS[c.status] ?? c.status}</div>
                    </td>
                    {METRICS.map((m) => (
                      <td key={m.key} className="px-3 py-3 font-mono">
                        {m.key === 'overall' ? <BandChip band={c.band ?? undefined} score={c.score ?? undefined} /> : m.show ? m.show(c) : fmt(m.value(c))}
                      </td>
                    ))}
                    <td className="px-3 py-3"><Outcome c={c} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {comparing && compared.length >= 2 ? <Compare rows={compared} onClose={() => setComparing(false)} /> : null}
      </main>
    </div>
  )
}

function CandidateName({ c }: { c: Row }) {
  return c.submissionId ? (
    <Link to="/report" search={{ id: c.submissionId }} className="font-semibold hover:underline">{c.name}</Link>
  ) : (
    <span className="font-semibold">{c.name}</span>
  )
}

function Outcome({ c }: { c: Row }) {
  if (c.gradingStatus === 'grading') return <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Grading</span>
  if (c.gradingStatus === 'error') return <span className="text-destructive">Grading error</span>
  if (!c.band) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">{c.band}{c.verdict && c.verdict !== 'none' ? ` · ${c.verdict === 'approve' ? 'Approved' : 'Requested changes'}` : ''}</div>
      {c.humanReview ? (
        <span className="inline-flex items-center gap-1 font-semibold text-success"><ShieldCheck className="size-3.5" /> Human reviewed</span>
      ) : c.needsReview ? (
        <span className="inline-flex items-center gap-1 font-semibold text-destructive"><AlertTriangle className="size-3.5" /> Needs review</span>
      ) : null}
    </div>
  )
}

/** Side-by-side comparison of 2–4 candidates across the same metrics. */
function Compare({ rows, onClose }: { rows: Row[]; onClose: () => void }) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Comparison</h2>
        <button onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Metric</th>
            {rows.map((r) => <th key={r._id} className="py-2 pr-4"><CandidateName c={r} /></th>)}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const vals = rows.map((r) => m.value(r))
            // Highest score wins; for time taken, fastest wins.
            const nums = vals.filter((v): v is number => v !== null)
            const best = nums.length ? (m.key === 'time' ? Math.min(...nums) : Math.max(...nums)) : null
            return (
              <tr key={m.key} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-4 text-muted-foreground">{m.label}</td>
                {rows.map((r, i) => (
                  <td key={r._id} className="py-2.5 pr-4">
                    <div className={cn('font-mono', vals[i] !== null && vals[i] === best && nums.length > 1 && 'font-semibold text-success')}>
                      {m.show ? m.show(r) : fmt(vals[i])}
                    </div>
                    {m.key !== 'time' && vals[i] !== null ? (
                      <div className="mt-1 h-1.5 w-full max-w-40 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, vals[i]!))}%` }} />
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            )
          })}
          <tr>
            <td className="py-2.5 pr-4 text-muted-foreground">Final outcome</td>
            {rows.map((r) => <td key={r._id} className="py-2.5 pr-4"><Outcome c={r} /></td>)}
          </tr>
        </tbody>
      </table>
    </section>
  )
}

import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { RecruiterNav, TopBar, cleanError } from '@/components/rb'
import { RecruiterGate, SignOutButton } from '@/components/recruiter-gate'
import { cn } from '@/lib/utils'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/reliability']

export const Route = createFileRoute('/reliability')({
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: () => (
    <RecruiterGate>
      <Reliability />
    </RecruiterGate>
  ),
})

type Status = 'pass' | 'fail' | 'nodata'
const fmt = (x: number | null | undefined, digits = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(digits))
const pct = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`)

function StatusTag({ status }: { status: Status }) {
  const map = {
    pass: { icon: <CheckCircle2 className="size-3.5" />, label: 'Meets target', cls: 'text-success' },
    fail: { icon: <XCircle className="size-3.5" />, label: 'Below target', cls: 'text-destructive' },
    nodata: { icon: <CircleDashed className="size-3.5" />, label: 'Not enough data', cls: 'text-muted-foreground' },
  }[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', map.cls)}>
      {map.icon} {map.label}
    </span>
  )
}

function Tile({ id, label, value, detail, target, status }: { id: string; label: string; value: string; detail?: string; target: string; status: Status }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Target {target}</span>
        <StatusTag status={status} />
      </div>
    </div>
  )
}

function Reliability() {
  const d = useQuery(api.reliability.dashboard)
  const startAdversarial = useMutation(api.reliability.startAdversarial)
  const startGolden = useMutation(api.reliability.startGolden)
  const setBaseline = useMutation(api.reliability.setBaseline)
  const [msg, setMsg] = useState('')

  const run = async (fn: () => Promise<unknown>, what: string) => {
    setMsg('')
    try {
      await fn()
      setMsg(`${what} started.`)
    } catch (err) {
      setMsg(cleanError(err))
    }
  }

  if (!d) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar subtitle="Reliability" right={<><RecruiterNav /><SignOutButton /></>} />
        <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </div>
    )
  }

  const t = d.targets
  const kappa = d.agreement.pooled
  const s = (ok: boolean, n: number): Status => (n === 0 ? 'nodata' : ok ? 'pass' : 'fail')

  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Reliability" right={<><RecruiterNav /><SignOutButton /></>} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Measuring the measurer</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          How well the judge council agrees with human graders, with itself and over time. Intervals are 95% (Wilson for
          rates, bootstrap for kappa). {d.counts.graded} graded submissions · {d.counts.goldenSubmissions} in the golden set ·{' '}
          {d.counts.labels} human labels. Scores should not drive hiring decisions until agreement meets target on at least
          30–50 golden submissions.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile id="SM-1" label="Council vs humans (QWK, issues)" value={fmt(kappa.kappa)} detail={`n=${kappa.n} · CI ${fmt(kappa.ci.lo)}–${fmt(kappa.ci.hi)}`}
            target={`≥ ${t.kappa}`} status={s(kappa.kappa >= t.kappa, kappa.n)} />
          <Tile id="SM-2" label="Test–retest std. dev." value={d.retest ? fmt(d.retest.std, 1) : '—'} detail={d.retest ? `${d.retest.n} runs: ${d.retest.scores.join(', ')}` : 'Run from a report'}
            target={`≤ ${t.retestStd} pts`} status={d.retest ? s(d.retest.std <= t.retestStd, d.retest.n) : 'nodata'} />
          <Tile id="SM-3" label="Evidence validity" value={pct(d.evidence.p)} detail={`CI ${pct(d.evidence.lo)}–${pct(d.evidence.hi)}`}
            target={`≥ ${t.evidenceValidity * 100}%`} status={s(d.evidence.p >= t.evidenceValidity, d.counts.graded)} />
          <Tile id="SM-4" label="Auto-resolution rate" value={pct(d.autoResolution.p)} detail={`CI ${pct(d.autoResolution.lo)}–${pct(d.autoResolution.hi)}`}
            target="85–95%" status={s(d.autoResolution.p >= t.autoResolutionLo && d.autoResolution.p <= t.autoResolutionHi, d.counts.graded)} />
          <Tile id="SM-5" label="Max perturbation shift" value={d.perturbation ? `${d.perturbation.maxAbs} pts` : '—'} detail={d.perturbation ? d.perturbation.deltas.map((x) => `${x.label} ${x.delta >= 0 ? '+' : ''}${x.delta}`).join(' · ') : 'Run from a report'}
            target={`≤ ${t.perturbation} pts`} status={d.perturbation ? s(d.perturbation.maxAbs <= t.perturbation, 1) : 'nodata'} />
          <Tile id="SM-8" label="Grading latency p95" value={d.latency.n ? `${fmt(d.latency.p95, 0)} s` : '—'} detail={d.latency.n ? `p50 ${fmt(d.latency.p50, 0)} s · n=${d.latency.n}` : undefined}
            target={`≤ ${t.latencyP95Sec} s`} status={s(d.latency.p95 <= t.latencyP95Sec, d.latency.n)} />
          <Tile id="REL-4" label="Inter-judge Fleiss' κ" value={fmt(d.interJudge.fleiss)} detail={`${pct(d.interJudge.unanimity.p)} unanimous · n=${d.interJudge.n}`}
            target="report only" status={d.interJudge.n ? 'pass' : 'nodata'} />
          <Tile id="REL-10" label="Adversarial suite" value={d.adversarial ? `${d.adversarial.passed}/${d.adversarial.total}` : '—'} detail="Real judges vs injection, bait and edge cases"
            target="all pass" status={d.adversarial ? s(d.adversarial.passed === d.adversarial.total, 1) : 'nodata'} />
        </div>

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Agreement per item (REL-2)</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="py-1.5 font-semibold">Item</th><th className="font-semibold">n</th><th className="font-semibold">QWK</th><th className="font-semibold">95% CI</th>
                </tr>
              </thead>
              <tbody>
                {d.agreement.perItem.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-muted-foreground">Add golden-set grades from any report to populate this table.</td></tr>
                ) : d.agreement.perItem.map((r) => (
                  <tr key={r.itemId} className="border-t border-border font-mono">
                    <td className="py-1.5">{r.itemId}</td><td>{r.n}</td><td>{fmt(r.kappa)}</td><td>{fmt(r.ci.lo)}–{fmt(r.ci.hi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Detection accuracy</dt><dd className="font-mono">{pct(d.agreement.detectionAccuracy.p)} (n={kappa.n})</dd>
              <dt className="text-muted-foreground">Human–human QWK</dt><dd className="font-mono">{fmt(d.agreement.humanHuman.kappa)} (n={d.agreement.humanHuman.n})</dd>
              <dt className="text-muted-foreground">Score vs human MAE</dt><dd className="font-mono">{fmt(d.agreement.score.mae, 1)} pts (n={d.agreement.score.n})</dd>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Per judge model (REL-4, REL-5)</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="py-1.5 font-semibold">Model</th><th className="font-semibold">Agrees w/ consensus</th><th className="font-semibold">Evidence valid</th>
                </tr>
              </thead>
              <tbody>
                {d.models.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 text-muted-foreground">No graded submissions yet.</td></tr>
                ) : d.models.map((m) => (
                  <tr key={m.model} className="border-t border-border">
                    <td className="py-1.5 font-mono text-xs">{m.model}</td>
                    <td className="font-mono">{pct(m.consensusAgreement.p)} <span className="text-xs text-muted-foreground">n={m.votes}</span></td>
                    <td className="font-mono">{pct(m.evidenceValidity.p)} <span className="text-xs text-muted-foreground">n={m.positives}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm text-muted-foreground">
              Average cost: <span className="font-mono text-foreground">{fmt(d.cost.meanCalls, 1)}</span> judge calls per submission (NFR-COST-1).
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Regression gate (REL-7)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Before changing prompts, rubric, models or weights: run the golden set, compare with the baseline, and only ship if the gate passes.
            </p>
            {d.gate ? (
              <div className="mt-3 text-sm">
                <StatusTag status={d.gate.pass ? 'pass' : 'fail'} />
                <p className="mt-1 font-mono">Baseline κ {fmt(d.gate.baselineKappa)} → latest κ {fmt(d.gate.candidateKappa)}</p>
                {d.gate.failures.map((f) => <p key={f} className="text-destructive">{f}</p>)}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {d.golden ? 'Mark a golden run as baseline, then run the golden set again after a change.' : 'No golden-set run yet.'}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => run(() => startGolden({}), 'Golden-set run')} className="rounded-md border border-border px-3 py-1.5 text-sm">Run golden set</button>
              <button onClick={() => run(() => startAdversarial({}), 'Adversarial suite')} className="rounded-md border border-border px-3 py-1.5 text-sm">Run adversarial suite</button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Both use real judge calls (about 15 per submission or case).</p>
            {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Weight calibration (§11.2)</h2>
            {d.calibration ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Best-fitting weights for {d.calibration.n} human overall score(s). Mean error {fmt(d.calibration.maeBefore, 1)} → {fmt(d.calibration.maeAfter, 1)} pts.
                  Treat as a suggestion until n ≥ 30; changing weights needs a new scoring version and a passing gate.
                </p>
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {Object.entries(d.calibration.weights).map(([k, w]) => (
                      <tr key={k} className="border-t border-border"><td className="py-1.5">{k}</td><td className="font-mono">{fmt(w)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Add overall scores in the golden-set panel of a report to calibrate.</p>
            )}
          </div>
        </section>

        {d.adversarial ? (
          <section className="mt-5 rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">Latest adversarial run</h2>
            <ul className="mt-3 divide-y divide-border text-sm">
              {d.adversarial.cases.map((c) => (
                <li key={c.label} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span><span className="font-mono text-xs">{c.label}</span> · {c.expectation}</span>
                  <span className="flex items-center gap-3"><span className="font-mono text-xs text-muted-foreground">score {c.overall}</span><StatusTag status={c.passed ? 'pass' : 'fail'} /></span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-5 rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Recent evaluation runs (EX-1)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="py-1.5 font-semibold">Started</th><th className="font-semibold">Kind</th><th className="font-semibold">Progress</th><th className="font-semibold">Versions</th><th />
                </tr>
              </thead>
              <tbody>
                {d.recent.length === 0 ? (
                  <tr><td colSpan={5} className="py-4 text-muted-foreground">No runs yet.</td></tr>
                ) : d.recent.map((r) => (
                  <tr key={r._id} className="border-t border-border">
                    <td className="py-1.5 font-mono text-xs">{new Date(r.startedAt).toLocaleString()}</td>
                    <td>{r.kind}{r.baseline ? ' · baseline' : ''}</td>
                    <td className={r.status === 'error' ? 'text-destructive' : ''}>{r.status === 'error' ? `error: ${r.error}` : `${r.done}/${r.total} ${r.status}`}</td>
                    <td className="font-mono text-xs text-muted-foreground">{r.versions.prompt} · {r.versions.scoring}</td>
                    <td className="text-right">
                      {r.kind === 'golden' && r.status === 'done' && !r.baseline ? (
                        <button onClick={() => run(() => setBaseline({ runId: r._id as Id<'evalRuns'> }), 'Baseline change')} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                          Set as baseline
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

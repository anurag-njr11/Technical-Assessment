import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Loader2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { RecruiterNav, SeverityChip, TopBar, cleanError } from '@/components/rb'
import { RecruiterGate, SignOutButton } from '@/components/recruiter-gate'
import { MODULE_LABEL } from '@/lib/scenario'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/items']

export const Route = createFileRoute('/items')({
  head: () => ({ meta: [{ title: meta.title }, { name: 'description', content: meta.description }] }),
  component: () => (
    <RecruiterGate>
      <Items />
    </RecruiterGate>
  ),
})

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

type Impact = { rows: Array<{ group: string; n: number; passed: number; rate: number; ratio: number }>; minRatio: number; pass: boolean | null }

function ImpactNote({ impact }: { impact: Impact }) {
  if (impact.pass === null) {
    return <p className="text-xs text-muted-foreground">Adverse-impact check: not enough self-identified group data yet (needs 2+ groups).</p>
  }
  return (
    <p className={impact.pass ? 'text-xs text-success' : 'text-xs font-semibold text-destructive'}>
      Adverse-impact check (four-fifths rule): lowest impact ratio {impact.minRatio.toFixed(2)} — {impact.pass ? 'passes' : 'FAILS: review this configuration before using it'}.
    </p>
  )
}

// SB-3 item statistics, SB-4 enable/disable, CU-2 category emphasis, FB-6 impact check.
function Items() {
  const data = useQuery(api.items.stats)
  const me = useQuery(api.access.me)
  const setEnabled = useMutation(api.items.setEnabled)
  const setEmphasis = useMutation(api.items.setEmphasis)
  const [msg, setMsg] = useState('')
  const isOwner = !!me && me.signedIn && me.role === 'owner'

  const run = async (fn: () => Promise<Impact>) => {
    setMsg('')
    try {
      const impact = await fn()
      setMsg(impact.pass === false ? 'Saved, but the adverse-impact check fails under this configuration.' : 'Saved.')
    } catch (err) {
      setMsg(cleanError(err))
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Item bank" right={<><RecruiterNav /><SignOutButton /></>} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Item bank</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every planted issue and decoy, how often candidates find it, and its Rasch difficulty (higher = harder; shown once
          2+ submissions exist). Owners can switch issues off or change category emphasis within validated ranges. Changes
          apply to submissions graded from now on, and each change runs an adverse-impact check.
        </p>
        {msg ? <p className="mt-3 text-sm">{msg}</p> : null}
        {!data ? (
          <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <section className="mt-6 rounded-xl border border-border bg-card p-6">
              <h2 className="text-sm font-semibold">Category emphasis</h2>
              <p className="mt-1 text-xs text-muted-foreground">Multiplies the detection weight of every issue in a category ({data.limits.min}×–{data.limits.max}×). For example, raise Security for fintech roles.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {data.emphasis.map((e) => (
                  <label key={e.category} className="text-xs font-semibold">
                    {e.category}
                    <select
                      value={String(e.multiplier)}
                      disabled={!isOwner}
                      onChange={(ev) => run(() => setEmphasis({ category: e.category, multiplier: Number(ev.target.value) }))}
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-normal"
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5].map((m) => <option key={m} value={String(m)}>{m}×</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-3"><ImpactNote impact={data.adverseImpact} /></div>
            </section>

            {data.scenarios.map((s) => (
              <section key={s.scenarioId} className="mt-5 overflow-x-auto rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5">
                  <h2 className="text-sm font-semibold">{s.title}</h2>
                  <span className="text-xs text-muted-foreground">{MODULE_LABEL[s.kind]} · {s.n} graded</span>
                </div>
                <table className="mt-3 w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-6 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Severity</th>
                      <th className="px-3 py-2 font-semibold">Weight</th>
                      <th className="px-3 py-2 font-semibold">Found / flagged</th>
                      <th className="px-3 py-2 font-semibold">Difficulty</th>
                      <th className="px-6 py-2 font-semibold">In use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.id} className="border-b border-border last:border-0">
                        <td className="px-6 py-2.5"><span className="font-mono text-xs text-muted-foreground">{i.id}</span> {i.title}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{i.category}</td>
                        <td className="px-3 py-2.5"><SeverityChip severity={i.severity} /></td>
                        <td className="px-3 py-2.5 font-mono">{i.weight}</td>
                        <td className="px-3 py-2.5 font-mono">{pct(i.rate)} <span className="text-xs text-muted-foreground">n={i.n}</span></td>
                        <td className="px-3 py-2.5 font-mono">{i.difficulty === null ? '—' : i.difficulty.toFixed(2)}</td>
                        <td className="px-6 py-2.5">
                          {i.kind === 'decoy' ? (
                            <span className="text-xs text-muted-foreground">Always (decoy)</span>
                          ) : (
                            <label className="inline-flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={i.enabled} disabled={!isOwner}
                                onChange={(e) => run(() => setEnabled({ scenarioId: s.scenarioId, itemId: i.id, enabled: e.target.checked }))} />
                              {i.enabled ? 'On' : 'Off'}
                            </label>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">Directed Build faults are graded by hidden code checks and aren't configurable in this pilot.</p>
          </>
        )}
      </main>
    </div>
  )
}

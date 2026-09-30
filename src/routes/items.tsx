import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { PageHeader, PageSpinner, Panel, SeverityChip, cleanError } from '@/components/rb'
import { RecruiterGate, RecruiterPage } from '@/components/recruiter-gate'
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
    <RecruiterPage>
        <PageHeader
          eyebrow="Configuration"
          title="Item bank"
          description="Every planted issue and decoy, how often candidates find it, and its Rasch difficulty (higher = harder; shown once 2+ submissions exist). Owners can switch issues off or change category emphasis within validated ranges. Changes apply to submissions graded from now on, and each change runs an adverse-impact check."
        />
        {msg ? <p role="status" className="rb-rise mt-4 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">{msg}</p> : null}
        {!data ? (
          <PageSpinner />
        ) : (
          <>
            <Panel
              className="mt-8"
              title="Category emphasis"
              description={`Multiplies the detection weight of every issue in a category (${data.limits.min}×–${data.limits.max}×). For example, raise Security for fintech roles.`}
            >
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {data.emphasis.map((e) => (
                  <label key={e.category} className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-semibold">
                    {e.category}
                    <select
                      value={String(e.multiplier)}
                      disabled={!isOwner}
                      onChange={(ev) => run(() => setEmphasis({ category: e.category, multiplier: Number(ev.target.value) }))}
                      className="mt-2 w-full rounded-lg border border-input bg-card px-2 py-1.5 text-sm font-normal"
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5].map((m) => <option key={m} value={String(m)}>{m}×</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-4"><ImpactNote impact={data.adverseImpact} /></div>
            </Panel>

            {data.scenarios.map((s) => (
              <Panel
                key={s.scenarioId}
                flush
                className="mt-5"
                title={s.title}
                actions={<span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{MODULE_LABEL[s.kind]} · {s.n} graded</span>}
              >
                <div className="mt-4 overflow-x-auto border-t border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-6 py-2.5 font-semibold">Item</th>
                      <th className="px-3 py-2.5 font-semibold">Category</th>
                      <th className="px-3 py-2.5 font-semibold">Severity</th>
                      <th className="px-3 py-2.5 font-semibold">Weight</th>
                      <th className="px-3 py-2.5 font-semibold">Found / flagged</th>
                      <th className="px-3 py-2.5 font-semibold">Difficulty</th>
                      <th className="px-6 py-2.5 font-semibold">In use</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((i) => (
                      <tr key={i.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
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
                </div>
              </Panel>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">Directed Build faults are graded by hidden code checks and aren't configurable in this pilot.</p>
          </>
        )}
    </RecruiterPage>
  )
}

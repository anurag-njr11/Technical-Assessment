import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Scenario } from '@/lib/scenario'

// M3 evidence-first report: judge findings that cite trajectory events, and the
// interaction timeline those citations point into.

export type TrajVote = { judge: string; model: string; family?: string; decision: boolean; evidence: string; eventIds: string[]; valid: boolean; discardedReason?: string }
export type Finding = {
  id: string
  title: string
  dimension: string
  kind: 'detected' | 'missed' | 'false_positive' | 'behavior'
  question: string
  votes: TrajVote[]
  agreement: string
  confidence: 'high' | 'medium' | 'low'
  needsReview: boolean
}
export type TrajectoryResult = { dimensions: Array<{ key: string; label: string; score: number; detail: string }>; findings: Finding[] }
export type BuildEvent = { id: string; t: number; type: string; data?: string; tokens?: { input: number; output: number } }

const GROUPS: Array<{ kind: Finding['kind']; title: string }> = [
  { kind: 'detected', title: 'Detected issues' },
  { kind: 'missed', title: 'Missed issues' },
  { kind: 'false_positive', title: 'False positives' },
  { kind: 'behavior', title: 'Other behaviours' },
]

const isSplit = (f: Finding) => {
  const valid = f.votes.filter((v) => v.valid)
  return valid.some((v) => v.decision) && valid.some((v) => !v.decision)
}

export function EvidenceReport({ trajectory, overall, band, code, events }: { trajectory: TrajectoryResult; overall: number; band: string; code?: string; events?: BuildEvent[] }) {
  const [highlight, setHighlight] = useState<string | null>(null)
  const jump = (id: string) => {
    setHighlight(id)
    document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const split = trajectory.findings.filter(isSplit)
  const dimLabel = Object.fromEntries(trajectory.dimensions.map((d) => [d.key, d.label]))
  return (
    <>
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Why this score</h2>
          <span className="text-sm">
            Overall <span className="font-mono text-lg font-semibold">{overall}</span> <span className="text-muted-foreground">· {band}</span>
          </span>
        </div>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="py-2 pr-4 font-semibold">Dimension</th>
              <th className="py-2 pr-4 font-semibold">Score</th>
              <th className="py-2 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {trajectory.dimensions.map((d) => (
              <tr key={d.key} className="border-b border-border last:border-0">
                <td className="py-2.5 pr-4 font-medium">{d.label}</td>
                <td className={cn('py-2.5 pr-4 font-mono', d.score < 34 ? 'text-destructive' : '')}>{Math.round(d.score)}</td>
                <td className="py-2.5 text-muted-foreground">{d.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {split.length > 0 ? (
        <section className="rounded-xl border border-warning/30 bg-card p-6">
          <h2 className="text-sm font-semibold">Judge disagreements</h2>
          <ul className="mt-3 divide-y divide-border">
            {split.map((f) => (
              <li key={f.id} className="py-3 text-sm">
                <div className="font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.question}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.votes.map((v) => (
                    <span key={v.judge} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', !v.valid ? 'border-dashed text-muted-foreground' : v.decision ? 'border-success/30 bg-success-soft text-success' : 'border-destructive/30 bg-destructive-soft text-destructive')}>
                      {v.judge}: {!v.valid ? 'Discarded' : v.decision ? 'Yes' : 'No'}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {GROUPS.map((g) => {
        const fs = trajectory.findings.filter((f) => f.kind === g.kind)
        if (!fs.length) return null
        return (
          <section key={g.kind} className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">({fs.length})</span></h2>
            <div className="mt-3 space-y-3">
              {fs.map((f) => <FindingCard key={f.id} f={f} dimension={dimLabel[f.dimension] ?? f.dimension} onJump={jump} />)}
            </div>
          </section>
        )
      })}

      {events ? <Timeline code={code ?? ''} events={events} highlight={highlight} /> : null}
    </>
  )
}

const CONFIDENCE: Record<Finding['confidence'], string> = {
  high: 'bg-success-soft text-success border-success/30',
  medium: 'bg-warning-soft text-warning border-warning/30',
  low: 'bg-destructive-soft text-destructive border-destructive/30',
}

function FindingCard({ f, dimension, onJump }: { f: Finding; dimension: string; onJump: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const valid = f.votes.filter((v) => v.valid)
  const quote = (valid.find((v) => v.decision && v.evidence) ?? valid.find((v) => v.evidence))?.evidence
  const eventIds = [...new Set(valid.flatMap((v) => v.eventIds))]
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{f.title} <span className="text-xs font-normal text-muted-foreground">· {dimension}</span></span>
        <span className="text-xs text-muted-foreground">Judges: {f.agreement} agree</span>
        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize', CONFIDENCE[f.confidence])}>{f.confidence} confidence</span>
        {f.needsReview ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2.5 py-0.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="size-3" /> Human review recommended
          </span>
        ) : null}
      </div>
      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm italic text-foreground/80">
        <span className="not-italic text-xs font-semibold text-muted-foreground">What the candidate did: </span>
        {quote ? `“${quote}”` : 'No evidence quoted.'}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {eventIds.map((id) => (
          <button key={id} onClick={() => onJump(id)} className="rounded border border-border px-1.5 py-0.5 font-mono text-muted-foreground hover:bg-accent hover:text-foreground">
            {id}
          </button>
        ))}
        <button onClick={() => setOpen((o) => !o)} className="ml-auto font-semibold text-muted-foreground hover:text-foreground">
          {open ? 'Hide judge votes' : 'Show judge votes'}
        </button>
      </div>
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {f.votes.map((v) => (
            <div key={v.judge} className={cn('rounded-md border p-2.5 text-xs', v.valid ? 'border-border' : 'border-dashed border-border opacity-70')}>
              <div className="flex justify-between gap-2 font-semibold">
                <span>{v.judge}</span>
                <span className={v.valid ? '' : 'text-destructive'}>{!v.valid ? 'Discarded' : v.decision ? 'Yes' : 'No'}</span>
              </div>
              <div className="mt-1 truncate font-mono text-muted-foreground">{v.model}{v.family ? ` · ${v.family}` : ''}</div>
              {v.discardedReason ? <div className="mt-1 text-destructive">{v.discardedReason}</div> : null}
              {v.evidence ? <div className="mt-1 italic text-foreground/80">“{v.evidence}”</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The AI-generated PR the candidate reviewed, with the agent's rationale and
 * assumptions. An assumption is marked challenged when a detected
 * challengeAssumptions finding has id `A<n>` (1-based, scenario order).
 */
export function AgentPR({ scenario, findings }: { scenario: Scenario; findings: Finding[] }) {
  const challenges = findings.filter((f) => f.dimension === 'challengeAssumptions')
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">AI-generated PR · {scenario.ticketId} {scenario.title}</h2>
      <p className="mt-2 text-sm"><span className="font-semibold">Agent rationale: </span><span className="text-muted-foreground">{scenario.rationale}</span></p>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Agent assumptions</h3>
      <ol className="mt-2 space-y-1.5 text-sm">
        {scenario.assumptions.map((text, i) => {
          const f = challenges.find((c) => c.id === `A${i + 1}`)
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">A{i + 1}</span>
              <span className="min-w-0 flex-1">{text}</span>
              {f ? (
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold', f.kind === 'detected' ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-muted text-muted-foreground')}>
                  {f.kind === 'detected' ? 'Challenged' : 'Not challenged'}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Show diff ({scenario.files.length} files)</summary>
        {scenario.files.map((file) => (
          <div key={file.path} className="mt-3">
            <div className="font-mono text-xs font-semibold">{file.path}</div>
            <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono text-xs">
              {file.lines.map((l) => (
                <div key={l.n} className={l.kind === 'add' ? 'bg-success-soft' : ''}>
                  <span className="inline-block w-8 select-none text-muted-foreground">{l.n}</span>{l.kind === 'add' ? '+ ' : '  '}{l.code}
                </div>
              ))}
            </pre>
          </div>
        ))}
      </details>
    </section>
  )
}

const LABEL: Record<string, string> = {
  ai_prompt: 'Prompt', ai_response: 'AI response', fault_injected: 'Planted fault', accept_suggestion: 'Accepted', reject_suggestion: 'Rejected',
  test_run: 'Ran tests', file_open: 'Opened', code_edit: 'Edited code',
}

function parseResponse(data?: string): { text: string; code?: string } {
  try {
    const r = JSON.parse(data ?? '{}') as { text?: string; code?: string }
    return { text: r.text ?? '', code: r.code }
  } catch {
    return { text: data ?? '' }
  }
}

/** Readable interaction timeline: prompt → AI response → accept/reject → edits → tests. */
export function Timeline({ code, events, highlight }: { code: string; events: BuildEvent[]; highlight?: string | null }) {
  // fault_injected data is "F1|<ai_response event id>": mark that response for the recruiter.
  const faults = new Map(events.filter((e) => e.type === 'fault_injected').map((e) => {
    const [fault, target] = (e.data ?? '').split('|')
    return [target, fault] as const
  }))
  const mmss = (t: number) => `${Math.floor(t / 60000)}:${String(Math.floor((t % 60000) / 1000)).padStart(2, '0')}`
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Interaction timeline ({events.length} events)</h2>
      <ol className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto pr-1 text-sm">
        {events.filter((e) => e.type !== 'fault_injected').map((e) => {
          const fault = faults.get(e.id)
          const resp = e.type === 'ai_response' ? parseResponse(e.data) : null
          return (
            <li
              key={e.id}
              id={`ev-${e.id}`}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                fault ? 'border-destructive/40' : 'border-border',
                highlight === e.id && 'bg-warning-soft ring-2 ring-warning',
                e.type === 'ai_response' && 'ml-6',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{mmss(e.t)}</span>
                <span className="font-semibold">{LABEL[e.type] ?? e.type}</span>
                <span className="font-mono text-muted-foreground">{e.id}</span>
                {e.tokens ? <span className="text-muted-foreground">{e.tokens.input + e.tokens.output} tokens</span> : null}
                {fault ? <span className="rounded-full bg-destructive-soft px-2 py-0.5 font-semibold text-destructive">Planted fault {fault} (hidden from candidate)</span> : null}
              </div>
              {resp ? (
                <>
                  {resp.text ? <p className="mt-1.5 whitespace-pre-wrap text-foreground/90">{resp.text}</p> : null}
                  {resp.code ? <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs">{resp.code}</pre> : null}
                </>
              ) : e.type === 'code_edit' ? (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Code snapshot</summary>
                  <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs">{e.data}</pre>
                </details>
              ) : e.data ? (
                <p className={cn('mt-1.5 whitespace-pre-wrap', e.type === 'ai_prompt' ? 'text-foreground' : 'text-muted-foreground')}>{e.data}</p>
              ) : null}
            </li>
          )
        })}
      </ol>
      {/* Judges cite the final submission as event "final". */}
      <div id="ev-final" className={highlight === 'final' ? 'mt-5 rounded-lg ring-2 ring-primary' : 'mt-5'}>
        <h3 className="text-sm font-semibold">{code ? 'Final code' : 'Final submission'}</h3>
        {code
          ? <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs">{code}</pre>
          : <p className="mt-2 text-xs text-muted-foreground">The candidate's verdict and review comments are shown above.</p>}
      </div>
    </section>
  )
}

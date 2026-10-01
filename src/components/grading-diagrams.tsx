// Plain-English diagrams for the methodology page. Pure HTML/CSS (no images)
// so they follow the theme tokens in light and dark mode and reflow on phones.
import { ArrowDown, ArrowRight, Bot, Check, Code2, FileSearch, Gavel, Quote, Scale, Send, ShieldCheck, UserCheck, X } from 'lucide-react'
import { WEIGHTS } from '@/convex/scoring'

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Arrow() {
  return (
    <div aria-hidden className="flex shrink-0 items-center justify-center text-muted-foreground/70">
      <ArrowDown className="size-4 sm:hidden" />
      <ArrowRight className="hidden size-4 sm:block" />
    </div>
  )
}

function Frame({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <figure className="mt-4">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">{children}</div>
      {caption ? <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  )
}

const Tag = ({ ai }: { ai?: boolean }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ai ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
    {ai ? <Bot className="size-3" /> : <Code2 className="size-3" />}
    {ai ? 'AI' : 'Plain code'}
  </span>
)

/* ------------------------------------------------------------------ */
/* 0. The big picture                                                  */
/* ------------------------------------------------------------------ */

const OVERVIEW: Array<{ icon: typeof Send; title: string; body: string; ai?: boolean }> = [
  { icon: Send, title: 'Candidate submits', body: 'Comments, verdict, answers' },
  { icon: FileSearch, title: 'Match to answer key', body: 'Which comment is about which planted problem' },
  { icon: Bot, title: '3 AI judges', body: 'Answer simple yes/no questions', ai: true },
  { icon: Quote, title: 'Proof check', body: 'Every “yes” must quote the candidate' },
  { icon: Scale, title: 'Majority vote', body: 'Disagreements go to a person' },
  { icon: Gavel, title: 'Score', body: 'Fixed, published formula' },
  { icon: UserCheck, title: 'Human-reviewed report', body: 'Evidence for every point' },
]

export function OverviewFlow() {
  return (
    <Frame caption="Only one step uses AI. Everything that decides the score — matching, proof checking, voting and the maths — is ordinary code that gives the same answer every time.">
      {[OVERVIEW.slice(0, 4), OVERVIEW.slice(4)].map((row, r) => (
        <div key={r}>
          {r === 1 ? (
            <div aria-hidden className="flex justify-center py-1 text-muted-foreground/70 sm:justify-end sm:pr-[12%]">
              <ArrowDown className="size-4" />
            </div>
          ) : null}
          <ol start={r * 4 + 1} className="flex flex-col items-stretch gap-2 sm:flex-row">
            {row.map((s, i) => (
              <li key={s.title} className="contents">
                <div className={`flex min-w-0 flex-1 items-start gap-3 rounded-lg border p-3 sm:flex-col sm:gap-2 ${s.ai ? 'border-primary/40 bg-accent' : 'border-border bg-background'}`}>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${s.ai ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    <s.icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold leading-tight">{r * 4 + i + 1}. {s.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.body}</p>
                  </div>
                </div>
                {i < row.length - 1 ? <Arrow /> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Tag ai /> AI answers questions</span>
        <span className="flex items-center gap-1.5"><Tag /> Code makes every decision</span>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Answer key: planted problems and decoys                          */
/* ------------------------------------------------------------------ */

const CODE: Array<[number, string, 'bug' | 'decoy' | null]> = [
  [12, 'async function refund(orderId, amount) {', null],
  [13, '  const order = await db.orders.get(orderId)', null],
  [14, '  await payments.refund(order.chargeId, amount)', 'bug'],
  [15, '  order.status = "refunded"', null],
  [16, '  const cents = Math.round(amount * 100)', 'decoy'],
  [17, '  await db.orders.save(order)', null],
]

export function AnswerKeyDiagram() {
  return (
    <Frame caption="Illustrative example. Real scenarios have several planted problems of different severity, plus decoys that punish “flag everything” reviewing.">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <pre className="overflow-x-auto rounded-lg border border-border bg-background py-2 font-mono text-[12px] leading-6">
          {CODE.map(([n, text, mark]) => (
            <div key={n} className={`flex gap-3 px-3 ${mark === 'bug' ? 'bg-destructive-soft' : mark === 'decoy' ? 'bg-warning-soft' : ''}`}>
              <span className="w-5 shrink-0 select-none text-right text-muted-foreground">{n}</span>
              <span className="whitespace-pre">{text}</span>
            </div>
          ))}
        </pre>
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-destructive/30 bg-destructive-soft p-3">
            <p className="font-semibold text-destructive">Planted problem (line 14)</p>
            <p className="mt-1 text-muted-foreground">No check that the refund is ≤ what was paid. Finding it earns points, weighted by severity.</p>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning-soft p-3">
            <p className="font-semibold text-warning">Decoy (line 16)</p>
            <p className="mt-1 text-muted-foreground">Looks suspicious but is correct. Flagging it as a bug costs points.</p>
          </div>
        </div>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Location matching                                                */
/* ------------------------------------------------------------------ */

export function MatchingDiagram() {
  const lines = Array.from({ length: 13 }, (_, i) => i + 9) // 9..21
  return (
    <Frame caption="A comment is only compared with planted items within 3 lines of it. Comments outside every window are still read — the judges sort them into valid extra points, nitpicks or false alarms.">
      <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-background py-1 font-mono text-[11px]">
          {lines.map((n) => {
            const inWindow = n >= 11 && n <= 17
            return (
              <div key={n} className={`flex items-center gap-2 px-2 leading-5 ${n === 14 ? 'bg-destructive-soft font-semibold text-destructive' : inWindow ? 'bg-accent' : ''}`}>
                <span className="w-5 text-right text-muted-foreground">{n}</span>
                <span className="truncate">{n === 14 ? '← planted problem' : n === 16 ? '💬 comment A' : n === 20 ? '💬 comment B' : ''}</span>
              </div>
            )
          })}
        </div>
        <div className="flex flex-col justify-center gap-3 text-sm">
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft p-3">
            <Check className="mt-0.5 size-4 shrink-0 text-success" />
            <p><span className="font-semibold">Comment A, line 16</span> <span className="text-muted-foreground">is inside the window (lines 11–17), so the judges are asked whether it describes the planted problem.</span></p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p><span className="font-semibold">Comment B, line 20</span> <span className="text-muted-foreground">is outside it. It can’t get credit for line 14 just by being nearby; it is judged on its own merits.</span></p>
          </div>
          <p className="text-xs text-muted-foreground">Being on the right line is never enough. The judges must confirm it is the <em>same problem</em>.</p>
        </div>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 3. The council                                                      */
/* ------------------------------------------------------------------ */

const COUNCIL = [
  { name: 'Judge A', main: 'Google Gemini', backup: 'Alibaba Qwen' },
  { name: 'Judge B', main: 'Anthropic Claude', backup: 'Mistral Large' },
  { name: 'Judge C', main: 'Meta Llama', backup: 'DeepSeek' },
]

export function CouncilDiagram() {
  return (
    <Frame caption="Six models from six different companies. If a judge’s main model is down, its backup steps in — and the backup is never from a company already on the panel, so the three opinions stay independent.">
      <div className="grid gap-3 sm:grid-cols-3">
        {COUNCIL.map((j) => (
          <div key={j.name} className="rounded-lg border border-border bg-background p-3 text-center">
            <span className="mx-auto grid size-9 place-items-center rounded-full bg-primary text-primary-foreground"><Bot className="size-4" /></span>
            <p className="mt-2 text-sm font-semibold">{j.name}</p>
            <p className="mt-2 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">{j.main}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">backup: {j.backup}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border px-2.5 py-1">Work independently</span>
        <span className="rounded-full border border-border px-2.5 py-1">Never see names or emails</span>
        <span className="rounded-full border border-border px-2.5 py-1">Same settings every time (temperature 0)</span>
        <span className="rounded-full border border-border px-2.5 py-1">Ignore instructions hidden in answers</span>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Yes/no checklist                                                 */
/* ------------------------------------------------------------------ */

const QUESTIONS: Array<[string, boolean[]]> = [
  ['Does it identify this same problem?', [true, true, true]],
  ['Does it explain the impact?', [true, true, false]],
  ['Does it propose a fix?', [true, true, true]],
  ['Is it constructive?', [true, true, true]],
]

function YesNo({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="inline-grid size-6 place-items-center rounded-md bg-success-soft text-success"><Check className="size-3.5" /><span className="sr-only">yes</span></span>
  ) : (
    <span className="inline-grid size-6 place-items-center rounded-md bg-destructive-soft text-destructive"><X className="size-3.5" /><span className="sr-only">no</span></span>
  )
}

export function ChecklistDiagram() {
  return (
    <Frame caption="Judges never give a score out of 10. Narrow yes/no questions are far more consistent between models — and between runs — than asking “how good is this?”">
      <blockquote className="rounded-lg border-l-4 border-primary bg-background px-4 py-3 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Candidate’s comment · line 16</span>
        <p className="mt-1">“Nothing stops a refund larger than the original charge — a typo could pay out 10×. Check amount ≤ order.total before calling payments.refund.”</p>
      </blockquote>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 text-left font-medium">Question</th>
              {COUNCIL.map((j) => <th key={j.name} className="w-16 py-2 font-medium">{j.name.replace('Judge ', '')}</th>)}
              <th className="w-24 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {QUESTIONS.map(([q, votes]) => {
              const yes = votes.filter(Boolean).length
              return (
                <tr key={q} className="border-t border-border">
                  <td className="py-2 pr-2">{q}</td>
                  {votes.map((v, i) => <td key={i} className="py-2 text-center"><YesNo yes={v} /></td>)}
                  <td className="py-2 text-center text-xs font-semibold">{yes >= 2 ? <span className="text-success">Yes ({yes}/3)</span> : <span className="text-destructive">No ({yes}/3)</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 5. Proof check                                                      */
/* ------------------------------------------------------------------ */

export function EvidenceDiagram() {
  return (
    <Frame caption="This stops an AI from “hallucinating” credit the candidate didn’t earn — or being talked into it by text hidden in an answer.">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        <div className="flex-1 rounded-lg border border-primary/40 bg-accent p-3 text-sm">
          <p className="text-xs font-semibold text-accent-foreground">Judge says YES, and must quote:</p>
          <p className="mt-1 font-mono text-xs">“Check amount ≤ order.total”</p>
        </div>
        <Arrow />
        <div className="flex-1 rounded-lg border-2 border-dashed border-border bg-background p-3 text-center text-sm">
          <ShieldCheck className="mx-auto size-5 text-primary" />
          <p className="mt-1 font-semibold">Is that exact phrase in the candidate’s own words?</p>
          <p className="text-xs text-muted-foreground">checked by code, not AI</p>
        </div>
        <Arrow />
        <div className="flex flex-1 flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft p-2.5">
            <Check className="size-4 shrink-0 text-success" /><span><b>Found</b> → the vote counts</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-soft p-2.5">
            <X className="size-4 shrink-0 text-destructive" /><span><b>Not found</b> → vote thrown away</span>
          </div>
        </div>
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 6. Majority vote and escalation                                     */
/* ------------------------------------------------------------------ */

const OUTCOMES: Array<{ votes: Array<boolean | null>; title: string; body: string; tone: 'ok' | 'warn' }> = [
  { votes: [true, true, true], title: 'All agree', body: 'Decided automatically.', tone: 'ok' },
  { votes: [true, true, false], title: '2 against 1', body: 'Majority decides. On a serious problem, a person double-checks.', tone: 'warn' },
  { votes: [true, null, null], title: 'Fewer than 2 usable votes', body: 'Not enough evidence for a machine decision on a serious problem — a person decides.', tone: 'warn' },
]

export function ConsensusDiagram() {
  return (
    <Frame caption="Escalation never changes the score by itself. It puts the submission in the review queue with the exact reason, and a person confirms or overrides.">
      <div className="grid gap-3 md:grid-cols-3">
        {OUTCOMES.map((o) => (
          <div key={o.title} className={`rounded-lg border p-3 ${o.tone === 'ok' ? 'border-success/30 bg-success-soft' : 'border-warning/30 bg-warning-soft'}`}>
            <div className="flex gap-1.5">
              {o.votes.map((v, i) =>
                v === null ? (
                  <span key={i} className="inline-grid size-6 place-items-center rounded-md border border-dashed border-muted-foreground/40 text-[10px] text-muted-foreground">–</span>
                ) : (
                  <YesNo key={i} yes={v} />
                ),
              )}
            </div>
            <p className={`mt-2 text-sm font-semibold ${o.tone === 'ok' ? 'text-success' : 'text-warning'}`}>{o.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{o.body}</p>
          </div>
        ))}
      </div>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 7. Score: weights, worked example, bands                            */
/* ------------------------------------------------------------------ */

const PARTS: Array<{ key: keyof typeof WEIGHTS; label: string; example: number; cls: string }> = [
  { key: 'detection', label: 'Found the problems', example: 0.8, cls: 'bg-primary' },
  { key: 'precision', label: 'Few false alarms', example: 1, cls: 'bg-primary/75' },
  { key: 'decoyDiscipline', label: 'Left decoys alone', example: 1, cls: 'bg-primary/55' },
  { key: 'explanationQuality', label: 'Explained impact & fix', example: 0.75, cls: 'bg-primary/40' },
  { key: 'verdict', label: 'Right verdict', example: 1, cls: 'bg-primary/25' },
]

const BANDS = [
  { from: 0, to: 50, label: 'Below bar', cls: 'bg-destructive/15 text-destructive' },
  { from: 50, to: 60, label: 'Borderline', cls: 'bg-warning/15 text-warning' },
  { from: 60, to: 80, label: 'Meets bar', cls: 'bg-primary/15 text-primary' },
  { from: 80, to: 100, label: 'Strong', cls: 'bg-success/15 text-success' },
]

export function ScoreDiagram() {
  const rows = PARTS.map((p) => ({ ...p, weight: WEIGHTS[p.key], points: WEIGHTS[p.key] * p.example * 100 }))
  const total = Math.round(rows.reduce((s, r) => s + r.points, 0))
  return (
    <Frame caption="Worked example. The same answers always produce the same score; the weights are published here and versioned with every result.">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where the 100 points come from</p>
      <div className="mt-2 flex h-9 overflow-hidden rounded-lg text-[11px] font-semibold">
        {rows.map((r) => (
          <div key={r.key} className={`${r.cls} flex items-center justify-center ${r.weight >= 0.2 ? 'text-primary-foreground' : 'text-foreground'}`} style={{ width: `${r.weight * 100}%` }} title={r.label}>
            {Math.round(r.weight * 100)}
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1.5 text-left font-medium">Part</th>
              <th className="py-1.5 text-right font-medium">Candidate did</th>
              <th className="py-1.5 text-right font-medium">× worth</th>
              <th className="py-1.5 text-right font-medium">= points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1.5"><span className={`mr-2 inline-block size-2.5 rounded-sm ${r.cls}`} />{r.label}</td>
                <td className="py-1.5 text-right font-mono">{Math.round(r.example * 100)}%</td>
                <td className="py-1.5 text-right font-mono text-muted-foreground">{Math.round(r.weight * 100)}</td>
                <td className="py-1.5 text-right font-mono">{Number(r.points.toFixed(2))}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-foreground/20 font-semibold">
              <td className="py-2" colSpan={3}>Overall</td>
              <td className="py-2 text-right font-mono text-base">{total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bands</p>
      <div className="relative mt-7">
        <div className="absolute -top-6 flex -translate-x-1/2 flex-col items-center" style={{ left: `${total}%` }} aria-hidden>
          <span className="rounded bg-foreground px-1.5 font-mono text-[11px] font-semibold leading-4 text-background">{total}</span>
          <span className="size-0 border-x-4 border-t-4 border-x-transparent border-t-foreground" />
        </div>
        <div className="flex h-8 overflow-hidden rounded-lg text-[10px] font-semibold sm:text-[11px]">
          {BANDS.map((b) => (
            <div key={b.label} className={`flex items-center justify-center text-center leading-tight ${b.cls}`} style={{ width: `${b.to - b.from}%` }}>
              {b.label}
            </div>
          ))}
        </div>
        <div className="relative mt-1 h-3 font-mono text-[10px] text-muted-foreground">
          {[0, 50, 60, 80, 100].map((n) => (
            <span key={n} className="absolute" style={{ left: `${n}%`, transform: n === 0 ? 'none' : n === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{n}</span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-sm">This candidate scores <b>{total}</b> → <span className="font-semibold text-success">Strong</span>.</p>
    </Frame>
  )
}

/* ------------------------------------------------------------------ */
/* 8. People stay in charge                                            */
/* ------------------------------------------------------------------ */

const HUMAN = [
  { title: 'Recruiter reads the report', body: 'Every point links to the candidate’s own words and each judge’s vote.' },
  { title: 'Can override any item', body: 'Only with a written reason. Every change is logged with who and when.' },
  { title: 'Candidate sees how the score was built', body: 'When results are shared — and can ask a person to look again.' },
]

export function HumanDiagram() {
  return (
    <Frame>
      <ol className="flex flex-col items-stretch gap-2 sm:flex-row">
        {HUMAN.map((h, i) => (
          <li key={h.title} className="contents">
            <div className="flex-1 rounded-lg border border-border bg-background p-3">
              <span className="grid size-7 place-items-center rounded-full bg-muted"><UserCheck className="size-3.5" /></span>
              <p className="mt-2 text-sm font-semibold">{h.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{h.body}</p>
            </div>
            {i < HUMAN.length - 1 ? <Arrow /> : null}
          </li>
        ))}
      </ol>
    </Frame>
  )
}

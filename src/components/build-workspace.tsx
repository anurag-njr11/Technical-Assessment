import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { ArrowRight, Check, Loader2, Play, Plus, Send, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { BuildScenario } from '@/lib/scenario'
import { cn } from '@/lib/utils'

// Build-with-AI workspace: Task → Code editor → AI assistant → Tests → Submit.
// The assistant runs server-side (convex/builds.ts) so every prompt, response,
// accept/dismiss and manual edit is recorded. Tests run in a Web Worker in the
// candidate's own browser.

type Msg = { id: string; role: 'user' | 'assistant'; text: string; code?: string; decided?: 'accepted' | 'rejected' }
type TestResult = { name: string; pass: boolean; detail?: string }
export type ChatEvent = { id: string; type: string; data: string }

// Each test body sees every top-level function/const in the candidate's code by
// name, may use `await`, and must return true to pass.
const VISIBLE_TESTS: Record<string, Array<{ name: string; src: string }>> = {
  'disc-12-build': [
    { name: 'SAVE10 takes 10% off $100', src: 'return applyDiscount({ subtotal: 100, items: [] }, "SAVE10") === 90' },
    { name: 'FLAT5 takes $5 off $60', src: 'return applyDiscount({ subtotal: 60, items: [] }, "FLAT5") === 55' },
    { name: 'Orders under $50 pay the subtotal', src: 'return applyDiscount({ subtotal: 40, items: [] }, "SAVE10") === 40' },
    { name: 'Unknown codes throw "Invalid code"', src: 'try { applyDiscount({ subtotal: 80, items: [] }, "BOGUS"); return false } catch (e) { return e.message === "Invalid code" }' },
  ],
  // searchOrders(db, userId, query) against a mocked db.query(sql, params).
  'orders-api-build': [
    {
      name: 'Returns the rows from the database',
      src: `const db = { query: async () => [{ id: 1 }] }; const r = await searchOrders(db, 7, "lamp"); return Array.isArray(r) && r.length === 1`,
    },
    // Ownership and injection are deliberately untested: spotting them is the assessment.
    {
      name: 'Newest first, at most 50',
      src: `let q; const db = { query: async (sql, params) => { q = { sql, params }; return [] } }; await searchOrders(db, 7, "lamp"); return /order\\s+by\\s+created_at\\s+desc/i.test(q.sql) && (/limit\\s+50\\b/i.test(q.sql) || (/limit\\s+\\?/i.test(q.sql) && (q.params || []).includes(50)))`,
    },
  ],
}

function runTests(code: string, tests: Array<{ name: string; src: string }>): Promise<TestResult[]> {
  const worker = `self.onmessage = async (e) => {
    const { code, tests } = e.data
    const names = [...new Set([...code.matchAll(/^(?:export\\s+)?(?:async\\s+)?(?:function\\*?\\s+|const\\s+|let\\s+|var\\s+|class\\s+)([A-Za-z_$][\\w$]*)/gm)].map((m) => m[1]))]
    let ns
    try {
      ns = new Function(code.replace(/\\bexport\\s+(default\\s+)?/g, '') + '\\n;return {' + names.join(',') + '};')()
    } catch (err) {
      postMessage(tests.map((t) => ({ name: t.name, pass: false, detail: 'Code does not run: ' + err.message })))
      return
    }
    const AsyncFunction = (async () => {}).constructor
    const out = []
    for (const t of tests) {
      try {
        const pass = (await new AsyncFunction(...Object.keys(ns), t.src)(...Object.values(ns))) === true
        out.push({ name: t.name, pass })
      } catch (err) {
        out.push({ name: t.name, pass: false, detail: String(err && err.message || err) })
      }
    }
    postMessage(out)
  }`
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }))
    const w = new Worker(url)
    const timer = setTimeout(() => {
      w.terminate()
      resolve(tests.map((t) => ({ name: t.name, pass: false, detail: 'Timed out (infinite loop?)' })))
    }, 2000)
    w.onmessage = (e) => {
      clearTimeout(timer)
      w.terminate()
      URL.revokeObjectURL(url)
      resolve(e.data as TestResult[])
    }
    w.postMessage({ code, tests })
  })
}

function fromChat(chat: ChatEvent[]): Msg[] {
  return chat.flatMap((c): Msg[] => {
    if (c.type === 'ai_prompt') return [{ id: c.id, role: 'user', text: c.data }]
    if (c.type !== 'ai_response') return []
    try {
      const d = JSON.parse(c.data) as { text: string; code?: string }
      return [{ id: c.id, role: 'assistant', text: d.text, code: d.code || undefined }]
    } catch {
      return [{ id: c.id, role: 'assistant', text: c.data }]
    }
  })
}

export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <span className="grid size-5 place-items-center rounded-full bg-muted font-mono text-[11px]">{n}</span>
      {children}
    </h2>
  )
}

/**
 * Chat with the server-side AI (api.builds.ask). Used by the build workspace
 * (with Insert/Dismiss on code) and by code review ("Ask the agent").
 * The input is controlled by the parent so it can pre-fill questions.
 */
export function AssistantChat({
  token,
  chat,
  prompt,
  setPrompt,
  onInsert,
  emptyText,
  className,
}: {
  token: string
  chat: ChatEvent[]
  prompt: string
  setPrompt: (p: string) => void
  onInsert?: (code: string) => void
  emptyText: string
  className?: string
}) {
  const ask = useAction(api.builds.ask)
  const log = useMutation(api.builds.log)
  const [messages, setMessages] = useState<Msg[]>(() => fromChat(chat))
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const chatEnd = useRef<HTMLDivElement>(null)
  const scroll = () => setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = prompt.trim()
    if (!text || pending) return
    setPending(text)
    setPrompt('')
    setError('')
    scroll()
    try {
      const r = await ask({ token, prompt: text })
      setMessages((m) => [...m, { id: `u${r.id}`, role: 'user', text }, { id: r.id, role: 'assistant', text: r.text, code: r.code || undefined }])
      scroll()
    } catch (err) {
      setPrompt(text)
      setError(
        err instanceof Error && /Uncaught Error: /.test(err.message)
          ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0]
          : 'No reply this time. Please try again in a moment.',
      )
    } finally {
      setPending('')
    }
  }

  const decide = (m: Msg, decision: 'accepted' | 'rejected') => {
    if (decision === 'accepted' && m.code) onInsert?.(m.code)
    setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, decided: decision } : x)))
    void log({ token, type: decision === 'accepted' ? 'accept_suggestion' : 'reject_suggestion', data: m.id })
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4 lg:max-h-none">
        {messages.length === 0 && !pending ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={cn('rounded-lg p-3 text-sm', m.role === 'user' ? 'ml-8 bg-primary text-primary-foreground' : 'mr-4 border border-border bg-background')}>
            <p className="whitespace-pre-wrap">{m.text}</p>
            {m.code ? (
              <>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs text-foreground">{m.code}</pre>
                {!onInsert ? null : m.decided ? (
                  <p className="mt-2 text-xs text-muted-foreground">{m.decided === 'accepted' ? 'Inserted into the editor' : 'Dismissed'}</p>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => decide(m, 'accepted')} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                      <Plus className="size-3.5" /> Insert into editor
                    </button>
                    <button onClick={() => decide(m, 'rejected')} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium">Dismiss</button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ))}
        {pending ? (
          <>
            <div className="ml-8 rounded-lg bg-primary p-3 text-sm text-primary-foreground"><p className="whitespace-pre-wrap">{pending}</p></div>
            <div className="mr-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" /> Thinking…
            </div>
          </>
        ) : null}
        <div ref={chatEnd} />
      </div>
      {error ? <p className="px-4 pb-2 text-[13px] text-destructive" role="alert">{error}</p> : null}
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <input
          id="assistant-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message the AI"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
        />
        <button type="submit" disabled={!!pending} aria-label="Send" className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  )
}

export function BuildWorkspace({
  token,
  scenario,
  code,
  setCode,
  chat,
  onSubmit,
  submitting,
  error,
}: {
  token: string
  scenario: BuildScenario
  code: string
  setCode: (c: string) => void
  chat: ChatEvent[]
  onSubmit: () => void
  submitting: boolean
  error: string
}) {
  const log = useMutation(api.builds.log)
  const [prompt, setPrompt] = useState('')
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [running, setRunning] = useState(false)
  const editTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(editTimer.current), [])

  // Manual edits: log a snapshot once the candidate stops typing for 3s.
  const edit = (next: string) => {
    setCode(next)
    clearTimeout(editTimer.current)
    editTimer.current = setTimeout(() => void log({ token, type: 'code_edit', data: next.slice(0, 4000) }), 3000)
  }

  const test = async () => {
    setRunning(true)
    const r = await runTests(code, VISIBLE_TESTS[scenario.id] ?? [])
    setResults(r)
    setRunning(false)
    void log({ token, type: 'test_run', data: `${r.filter((x) => x.pass).length}/${r.length} passed` })
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[300px_1fr_380px] lg:grid-rows-[1fr_auto_auto]">
      <aside className="border-b border-border bg-card p-5 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:border-b-0 lg:border-r">
        <Step n={1}>Task</Step>
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">{scenario.summary}</p>
        <ul className="mt-4 space-y-2 text-sm text-foreground/80">
          {scenario.criteria.map((c) => (
            <li key={c} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{c}</li>
          ))}
        </ul>
        {scenario.apiReference.length ? (
          <>
            <h3 className="mt-6 text-xs font-semibold text-muted-foreground">Reference</h3>
            <ul className="mt-2 space-y-1.5 font-mono text-xs text-muted-foreground">
              {scenario.apiReference.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </>
        ) : null}
      </aside>

      <section className="flex min-w-0 flex-col bg-card lg:col-start-2 lg:row-start-1">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <Step n={2}>Code editor</Step>
          <span className="font-mono text-xs text-muted-foreground">{scenario.fileName}</span>
        </div>
        <textarea
          value={code}
          onChange={(e) => edit(e.target.value)}
          spellCheck={false}
          aria-label="Code editor"
          className="min-h-[420px] flex-1 resize-none bg-background p-5 font-mono text-[13px] leading-6 outline-none"
        />
      </section>

      <aside className="flex flex-col border-t border-border bg-card lg:col-start-3 lg:row-span-3 lg:row-start-1 lg:border-l lg:border-t-0">
        <div className="border-b border-border px-5 py-3"><Step n={3}>AI assistant</Step></div>
        <AssistantChat
          token={token}
          chat={chat}
          prompt={prompt}
          setPrompt={setPrompt}
          onInsert={(c) => setCode(`${code.trimEnd()}\n\n${c}\n`)}
          emptyText="Ask for help with any part of the task. You decide what goes into your code."
          className="flex-1"
        />
      </aside>

      <section className="border-t border-border bg-card px-5 py-3 text-sm lg:col-start-2 lg:row-start-2" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <Step n={4}>Tests</Step>
          <button onClick={test} disabled={running} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-60">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run tests
          </button>
        </div>
        {results ? (
          <>
            <div className="mt-2 font-semibold">{results.filter((r) => r.pass).length} / {results.length} passed</div>
            <ul className="mt-2 space-y-1">
              {results.map((r) => (
                <li key={r.name} className={cn('flex items-start gap-2', r.pass ? 'text-success' : 'text-destructive')}>
                  {r.pass ? <Check className="mt-0.5 size-4" /> : <X className="mt-0.5 size-4" />}
                  <span>{r.name}{r.detail ? <span className="text-muted-foreground"> · {r.detail}</span> : null}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">These tests are a sample. Make sure your code meets every point in the task.</p>
          </>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3 lg:col-start-2 lg:row-start-3">
        <Step n={5}>Submit</Step>
        <div className="flex flex-wrap items-center gap-3">
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          <button
            onClick={() => window.confirm('Submit your final code? You can’t change it afterwards.') && onSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit final code'} <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </main>
  )
}

import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { ArrowRight, Bot, Check, Loader2, Play, Plus, Send, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { BuildScenario } from '@/lib/scenario'
import { cn } from '@/lib/utils'

// M3 · Directed Build workspace (pilot). The assistant runs server-side
// (convex/builds.ts) so every prompt, response and accept/reject is recorded.
// Visible tests run in a Web Worker in the candidate's own browser; grading
// uses hidden server-side checks instead.

type Msg = { id: string; role: 'user' | 'assistant'; text: string; code?: string; decided?: 'accepted' | 'rejected' }
type TestResult = { name: string; pass: boolean; detail?: string }

const VISIBLE_TESTS: Record<string, Array<{ name: string; src: string }>> = {
  'disc-12-build': [
    { name: 'SAVE10 takes 10% off $100', src: 'return applyDiscount({ subtotal: 100, items: [] }, "SAVE10") === 90' },
    { name: 'FLAT5 takes $5 off $60', src: 'return applyDiscount({ subtotal: 60, items: [] }, "FLAT5") === 55' },
    { name: 'Orders under $50 pay the subtotal', src: 'return applyDiscount({ subtotal: 40, items: [] }, "SAVE10") === 40' },
    { name: 'Unknown codes throw "Invalid code"', src: 'try { applyDiscount({ subtotal: 80, items: [] }, "BOGUS"); return false } catch (e) { return e.message === "Invalid code" }' },
  ],
}

function runTests(code: string, tests: Array<{ name: string; src: string }>): Promise<TestResult[]> {
  const worker = `self.onmessage = (e) => {
    const { code, tests } = e.data
    const out = []
    let fn
    try {
      fn = new Function(code.replace(/\\bexport\\s+/g, '') + '\\n;return applyDiscount;')()
    } catch (err) {
      postMessage(tests.map((t) => ({ name: t.name, pass: false, detail: 'Code does not compile: ' + err.message })))
      return
    }
    for (const t of tests) {
      try {
        const pass = new Function('applyDiscount', t.src)(fn) === true
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

function fromChat(chat: Array<{ id: string; type: string; data: string }>): Msg[] {
  return chat.map((c) => {
    if (c.type === 'ai_prompt') return { id: c.id, role: 'user', text: c.data }
    try {
      const d = JSON.parse(c.data) as { text: string; code?: string }
      return { id: c.id, role: 'assistant', text: d.text, code: d.code || undefined }
    } catch {
      return { id: c.id, role: 'assistant', text: c.data }
    }
  })
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
  chat: Array<{ id: string; type: string; data: string }>
  onSubmit: () => void
  submitting: boolean
  error: string
}) {
  const ask = useMutation(api.builds.ask)
  const log = useMutation(api.builds.log)
  const [messages, setMessages] = useState<Msg[]>(() => fromChat(chat))
  const [prompt, setPrompt] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState('')
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [running, setRunning] = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = prompt.trim()
    if (!text) return
    setAsking(true)
    setAskError('')
    try {
      const r = await ask({ token, prompt: text })
      setMessages((m) => [...m, { id: `u${r.id}`, role: 'user', text }, { id: r.id, role: 'assistant', text: r.text, code: r.code || undefined }])
      setPrompt('')
      setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setAskError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'The assistant is unavailable.')
    } finally {
      setAsking(false)
    }
  }

  const decide = (m: Msg, decision: 'accepted' | 'rejected') => {
    if (decision === 'accepted' && m.code) setCode(`${code.trimEnd()}\n\n${m.code}\n`)
    setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, decided: decision } : x)))
    void log({ token, type: decision === 'accepted' ? 'accept_suggestion' : 'reject_suggestion', data: m.id })
  }

  const test = async () => {
    setRunning(true)
    const r = await runTests(code, VISIBLE_TESTS[scenario.id] ?? [])
    setResults(r)
    setRunning(false)
    void log({ token, type: 'test_run', data: `${r.filter((x) => x.pass).length}/${r.length} passed` })
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] gap-0 lg:grid-cols-[300px_1fr_380px]">
      <aside className="border-b border-border bg-card p-5 lg:border-b-0 lg:border-r">
        <h2 className="text-sm font-semibold">Ticket</h2>
        <ul className="mt-3 space-y-2 text-sm text-foreground/80">
          {scenario.criteria.map((c) => (
            <li key={c} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{c}</li>
          ))}
        </ul>
        <h2 className="mt-6 text-sm font-semibold">API reference</h2>
        <ul className="mt-2 space-y-1.5 font-mono text-xs text-muted-foreground">
          {scenario.apiReference.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-col bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-[13px] font-semibold">discount.js</span>
          <button onClick={test} disabled={running} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-60">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run visible tests
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          aria-label="Code editor"
          className="min-h-[420px] flex-1 resize-none bg-background p-5 font-mono text-[13px] leading-6 outline-none"
        />
        {results ? (
          <div className="border-t border-border px-5 py-3 text-sm" aria-live="polite">
            <div className="font-semibold">{results.filter((r) => r.pass).length} / {results.length} visible tests passed</div>
            <ul className="mt-2 space-y-1">
              {results.map((r) => (
                <li key={r.name} className={cn('flex items-start gap-2', r.pass ? 'text-success' : 'text-destructive')}>
                  {r.pass ? <Check className="mt-0.5 size-4" /> : <X className="mt-0.5 size-4" />}
                  <span>{r.name}{r.detail ? <span className="text-muted-foreground"> · {r.detail}</span> : null}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Hidden checks cover more cases than these.</p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3">
          {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
          <button
            onClick={() => window.confirm('Submit your final code? You can’t change it afterwards.') && onSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit final code'} <ArrowRight className="size-4" />
          </button>
        </div>
      </section>

      <aside className="flex flex-col border-t border-border bg-card lg:border-l lg:border-t-0">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold">
          <Bot className="size-4" /> AI assistant
        </div>
        <div className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4 lg:max-h-none">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ask for help with any part of the ticket, e.g. "write the code table" or "how should I handle invalid codes?"</p>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} className={cn('rounded-lg p-3 text-sm', m.role === 'user' ? 'ml-8 bg-primary text-primary-foreground' : 'mr-4 border border-border bg-background')}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.code ? (
                <>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs text-foreground">{m.code}</pre>
                  {m.decided ? (
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
          <div ref={chatEnd} />
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask the assistant…"
            aria-label="Message the AI assistant"
            maxLength={2000}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
          <button type="submit" disabled={asking} aria-label="Send" className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-60">
            {asking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
        {askError ? <p className="px-4 pb-3 text-[13px] text-destructive">{askError}</p> : null}
      </aside>
    </main>
  )
}

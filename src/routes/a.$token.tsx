import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ArrowRight, Bot, Clock, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Page, PageSpinner, btn } from '@/components/rb'

// Landing page for a recruiter's shareable assessment link / QR code.
export const Route = createFileRoute('/a/$token')({
  head: () => ({ meta: [{ title: 'Your assessment — ReviewBench' }] }),
  component: Join,
})

function Join() {
  const { token } = Route.useParams()
  const info = useQuery(api.assessments.publicInfo, { token })
  const join = useMutation(api.assessments.join)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const key = `rb:join:${token}`

  // Each join creates a new candidate, so a refresh reuses the one we already have.
  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(key)
    } catch {}
    if (saved) void navigate({ to: '/assess', search: { t: saved }, replace: true })
  }, [key, navigate])

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Enter your name to start.')
    setBusy(true)
    setError('')
    try {
      const r = await join({ token, name: name.trim(), email: email.trim() || undefined })
      try {
        localStorage.setItem(key, r.candidateToken)
      } catch {}
      await navigate({ to: '/assess', search: { t: r.candidateToken } })
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'Could not start. Please try again.')
      setBusy(false)
    }
  }

  return (
    <Page subtitle="Assessment" width="form" className="max-w-lg sm:py-16">
        {info === undefined ? (
          <PageSpinner />
        ) : info === null || !info.open ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.35)]">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Lock className="size-5" /></div>
            <h1 className="mt-4 text-xl font-semibold">{info === null ? "This link isn't valid" : 'This assessment is closed'}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {info === null
                ? 'Check that you have the whole link, or ask the hiring team for a new one.'
                : 'It is no longer accepting new candidates. Contact the hiring team if you think this is a mistake.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_40px_-24px_hsl(var(--foreground)/0.35)]">
            <div className="h-1 bg-gradient-to-r from-primary to-primary/40" />
            <div className="p-6 sm:p-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{info.role} · {info.level}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{info.title}</h1>
            <ul className="mt-5 space-y-2.5 text-sm">
              <li className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5"><Clock className="size-4 shrink-0 text-primary" />{info.minutes} minutes. The timer starts when you begin.</li>
              {info.aiAssisted ? (
                <li className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5"><Bot className="size-4 shrink-0 text-primary" />You'll work with an AI coding assistant.</li>
              ) : null}
              <li className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5"><ShieldCheck className="size-4 shrink-0 text-primary" />Your progress saves automatically.</li>
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              Work on your own, the way you normally would. Use the tools provided, check your work before you submit, and
              don't share the task.
            </p>
            <form onSubmit={start} className="mt-6 space-y-3">
              <label className="block text-sm font-medium">
                Your name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={100}
                  required
                  className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15 sm:text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Email <span className="font-normal text-muted-foreground">(optional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  maxLength={200}
                  className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/15 sm:text-sm"
                />
              </label>
              {error ? <p className="text-[13px] text-destructive" role="alert">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className={`${btn.primary} w-full py-3`}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Start <ArrowRight className="size-4" />
              </button>
            </form>
            </div>
          </div>
        )}
    </Page>
  )
}

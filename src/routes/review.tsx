import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Loader2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { BandChip, RecruiterNav, TopBar } from '@/components/rb'
import { RecruiterGate, SignOutButton } from '@/components/recruiter-gate'
import siteMetadata from '@/metadata.json'

const meta = siteMetadata['/review']

export const Route = createFileRoute('/review')({
  head: () => ({
    meta: [{ title: meta.title }, { name: 'description', content: meta.description }],
  }),
  component: () => (
    <RecruiterGate>
      <ReviewQueue />
    </RecruiterGate>
  ),
})

// HR-1: escalated submissions waiting for a human, with the specific reasons.
function ReviewQueue() {
  const rows = useQuery(api.reviews.queue)
  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Review queue" right={<><RecruiterNav /><SignOutButton /></>} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The judge council escalates when judges disagree or too few votes are usable on a serious item. Escalation never
          changes the score by itself: open the report, confirm or override the flagged items with a justification, then mark
          the review complete.
        </p>
        <div className="mt-6 space-y-3">
          {rows === undefined ? (
            <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              Nothing is waiting for review.
            </div>
          ) : (
            rows.map((r) => (
              <Link
                key={r._id}
                to="/report"
                search={{ id: r._id }}
                className="block rounded-xl border border-border bg-card p-5 hover:border-foreground/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{r.candidateName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{new Date(r.submittedAt).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.overrideCount ? <span className="text-xs text-muted-foreground">{r.overrideCount} override(s) so far</span> : null}
                    <BandChip band={r.band} score={r.overall} />
                  </div>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-destructive">
                  {r.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

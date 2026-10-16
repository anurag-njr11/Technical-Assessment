import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { BandChip, PageHeader, PageSpinner } from '@/components/rb'
import { RecruiterGate, RecruiterPage } from '@/components/recruiter-gate'
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
    <RecruiterPage>
      <PageHeader
        eyebrow="Human review"
        title="Review queue"
        description="The judge council escalates when judges disagree or too few votes are usable on a serious item. Escalation never changes the score by itself: open the report, confirm or override the flagged items with a justification, then mark the review complete."
      />
      <div className="mt-8">
        {rows === undefined ? (
          <PageSpinner />
        ) : rows.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-input bg-card px-6 py-16 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="mt-3 font-semibold">All clear</p>
            <p className="mt-1 text-sm text-muted-foreground">Nothing is waiting for review.</p>
          </div>
        ) : (
          <div className="rb-stagger grid gap-4 lg:grid-cols-2">
            {rows.map((r) => (
              <Link
                key={r._id}
                to="/report"
                search={{ id: r._id }}
                className="rb-lift group flex flex-col rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold group-hover:text-primary">{r.candidateName}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{new Date(r.submittedAt).toLocaleString()}</div>
                  </div>
                  <BandChip band={r.band} score={r.overall} />
                </div>
                <ul className="mt-4 space-y-1.5 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive">
                  {r.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{reason}</li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                  <span>{r.overrideCount ? `${r.overrideCount} override(s) so far` : 'No overrides yet'}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-primary">
                    Open report <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </RecruiterPage>
  )
}

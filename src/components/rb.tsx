import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export function TopBar({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/" className="flex items-center gap-2.5 text-foreground">
          <span className="grid size-7 place-items-center rounded-md bg-primary font-mono text-xs font-semibold text-primary-foreground">
            RB
          </span>
          <span className="text-[15px] font-semibold tracking-tight">ReviewBench</span>
        </Link>
        {subtitle ? (
          <>
            <span className="h-5 w-px bg-border" />
            <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-3">{right}</div>
    </header>
  )
}

const severityStyles: Record<string, string> = {
  critical: 'bg-destructive-soft text-destructive border-destructive/30',
  high: 'bg-warning-soft text-warning border-warning/30',
  medium: 'bg-muted text-foreground border-border',
  low: 'bg-muted text-muted-foreground border-border',
  none: 'bg-muted text-muted-foreground border-border',
}

export function SeverityChip({ severity, className }: { severity: string; className?: string }) {
  const label = severity === 'none' ? 'Decoy' : severity.charAt(0).toUpperCase() + severity.slice(1)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        severityStyles[severity] ?? severityStyles.low,
        className,
      )}
    >
      {label}
    </span>
  )
}

const outcomeStyles: Record<string, { label: string; cls: string }> = {
  found: { label: 'Found', cls: 'bg-success-soft text-success border-success/30' },
  missed: { label: 'Missed', cls: 'bg-destructive-soft text-destructive border-destructive/30' },
  false_alarm: { label: 'False alarm', cls: 'bg-warning-soft text-warning border-warning/30' },
  clean: { label: 'Left alone', cls: 'bg-success-soft text-success border-success/30' },
  not_exposed: { label: 'Not exposed', cls: 'bg-muted text-muted-foreground border-border' },
}

export function OutcomeChip({ outcome }: { outcome: string }) {
  const o = outcomeStyles[outcome] ?? { label: outcome, cls: 'bg-muted text-muted-foreground border-border' }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', o.cls)}>
      {o.label}
    </span>
  )
}

export function BandChip({ band, score }: { band?: string; score?: number }) {
  if (band === undefined || score === undefined) return <span className="text-sm text-muted-foreground">—</span>
  const cls =
    band === 'Strong'
      ? 'bg-success-soft text-success border-success/30'
      : band === 'Meets bar'
        ? 'bg-warning-soft text-warning border-warning/30'
        : band === 'Borderline'
          ? 'bg-muted text-foreground border-border'
          : 'bg-destructive-soft text-destructive border-destructive/30'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', cls)}>
      <span className="font-mono">{score}</span>
      <span>·</span>
      <span>{band}</span>
    </span>
  )
}

const NAV = [
  { to: '/recruiter', label: 'Candidates' },
  { to: '/review', label: 'Review queue' },
  { to: '/items', label: 'Item bank' },
  { to: '/reliability', label: 'Reliability' },
] as const

/** Top-level navigation for recruiter pages. */
export function RecruiterNav() {
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Recruiter">
      {NAV.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          activeProps={{ className: 'bg-accent text-foreground' }}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  )
}

export function cleanError(err: unknown, fallback = 'Something went wrong.') {
  return err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : fallback
}

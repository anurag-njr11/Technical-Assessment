import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TopBar({ subtitle, right, nav }: { subtitle?: string; right?: React.ReactNode; nav?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 text-foreground">
            <img src="/favicon.svg" alt="" className="size-8 rounded-lg shadow-sm" />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">ReviewBench</span>
          </Link>
          {subtitle ? (
            <>
              <span className="hidden h-5 w-px bg-border sm:block" />
              <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
            </>
          ) : null}
          {nav ? <div className="ml-4 hidden md:block">{nav}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">{right}</div>
      </div>
      {nav ? <div className="overflow-x-auto border-t border-border px-2 py-1.5 md:hidden">{nav}</div> : null}
    </header>
  )
}

const WIDTH = { wide: 'max-w-7xl', narrow: 'max-w-3xl', form: 'max-w-md' } as const

/** Page frame: top bar plus one content column. Every page uses one of three widths. */
export function Page({
  subtitle,
  right,
  nav,
  width = 'wide',
  className,
  children,
}: {
  subtitle?: string
  right?: React.ReactNode
  nav?: React.ReactNode
  width?: keyof typeof WIDTH
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle={subtitle} right={right} nav={nav} />
      <main className={cn('rb-rise mx-auto px-4 py-8 sm:px-6 sm:py-10', WIDTH[width], className)}>{children}</main>
    </div>
  )
}

/** Title block at the top of a page: optional eyebrow, title, description and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p> : null}
        <h1 className={cn('text-2xl font-semibold tracking-tight sm:text-[28px]', eyebrow && 'mt-2')}>{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Card with an optional header row. `flush` drops the body padding (for tables and lists). */
export function Panel({
  title,
  description,
  actions,
  flush,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  flush?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const head = title || actions ? (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', flush ? 'px-5 pt-5 sm:px-6' : '')}>
      <div className="min-w-0">
        {title ? <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2> : null}
        {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  ) : null
  return (
    <section className={cn('rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]', !flush && 'p-5 sm:p-6', className)}>
      {head}
      {head && children && !flush ? <div className="mt-4">{children}</div> : children}
    </section>
  )
}

/** Centered spinner used while a page's data loads. */
export function PageSpinner() {
  return (
    <div className="grid place-items-center py-24" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Shared button looks. */
export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50',
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
    <nav className="flex items-center gap-1" aria-label="Recruiter">
      {NAV.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          activeProps={{ className: 'bg-accent text-accent-foreground' }}
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

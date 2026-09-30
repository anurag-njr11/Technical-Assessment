import { useEffect, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react'
import { Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { TopBar } from '@/components/rb'

/**
 * Wraps every recruiter-only page. Candidates never see this: they take the
 * assessment without an account. Recruiters must (1) sign in with a verified
 * email and (2) be a member of the workspace (owner, or invited by the owner).
 */
export function RecruiterGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <FullPageSpinner />
  return (
    <>
      <AuthLoading>
        <FullPageSpinner />
      </AuthLoading>
      <Unauthenticated>
        <Shell>
          <SignInForms />
        </Shell>
      </Unauthenticated>
      <Authenticated>
        <Membership>{children}</Membership>
      </Authenticated>
    </>
  )
}

export function SignOutButton() {
  const { signOut } = useAuthActions()
  return (
    <button
      onClick={() => void signOut()}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <LogOut className="size-3.5" /> Sign out
    </button>
  )
}

function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar subtitle="Hiring team" right={right} />
      <main className="mx-auto flex max-w-md flex-col px-6 py-16">{children}</main>
    </div>
  )
}

function Membership({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.access.me)
  const claim = useMutation(api.access.claimWorkspace)
  const accept = useMutation(api.access.acceptInvite)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (me === undefined) return <FullPageSpinner />
  if (!me.signedIn) return <FullPageSpinner />
  if (me.role) return <>{children}</>

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell right={<SignOutButton />}>
      <Card>
        <div className="grid size-10 place-items-center rounded-md border border-border">
          <ShieldCheck className="size-5" />
        </div>
        {!me.workspaceClaimed ? (
          <>
            <h1 className="mt-4 text-xl font-semibold">Set up your workspace</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              No one has claimed this ReviewBench workspace yet. Claim it to become the owner. You'll be able to invite
              teammates by email.
            </p>
            <PrimaryButton busy={busy} onClick={() => run(() => claim({}))}>
              Claim workspace as {me.email}
            </PrimaryButton>
          </>
        ) : me.invited ? (
          <>
            <h1 className="mt-4 text-xl font-semibold">You've been invited</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {me.email} was invited to this hiring team.
            </p>
            <PrimaryButton busy={busy} onClick={() => run(() => accept({}))}>
              Join the team
            </PrimaryButton>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold">No access yet</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {me.email} isn't on this hiring team. Ask the workspace owner to invite this email address, then refresh
              this page.
            </p>
          </>
        )}
        {error ? <p className="mt-3 text-[13px] text-destructive">{error}</p> : null}
      </Card>
    </Shell>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-7">{children}</div>
}

function PrimaryButton({
  children,
  busy,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode
  busy?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy}
      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  )
}

function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  inputMode,
  value,
  onChange,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'email' | 'text'
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
      />
    </label>
  )
}

type Step =
  | 'signIn'
  | 'signUp'
  | 'forgot'
  | { type: 'verifyEmail'; email: string }
  | { type: 'resetPassword'; email: string }

function friendly(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : ''
  if (/InvalidSecret|InvalidAccountId|Invalid password/i.test(msg)) return 'Incorrect email or password.'
  if (/already exists/i.test(msg)) return 'An account with this email already exists. Sign in instead.'
  if (/Invalid code|Could not verify/i.test(msg)) return 'That code is invalid or expired.'
  if (/password/i.test(msg) && /invalid/i.test(msg)) return 'Password must be at least 8 characters.'
  return fallback
}

function SignInForms() {
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<Step>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = (s: Step) => {
    setStep(s)
    setError('')
    setPassword('')
    setCode('')
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validEmail) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('email', email.trim())
      fd.set('password', password)
      fd.set('flow', step === 'signUp' ? 'signUp' : 'signIn')
      const res = await signIn('password', fd)
      if (!res.signingIn) setStep({ type: 'verifyEmail', email: email.trim() })
    } catch (err) {
      setError(friendly(err, step === 'signUp' ? 'Could not create the account.' : 'Incorrect email or password.'))
    } finally {
      setBusy(false)
    }
  }

  const submitVerify = async (e: React.FormEvent, targetEmail: string) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your email.')
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('email', targetEmail)
      fd.set('code', code)
      fd.set('flow', 'email-verification')
      await signIn('password', fd)
    } catch (err) {
      setError(friendly(err, 'That code is invalid or expired.'))
    } finally {
      setBusy(false)
    }
  }

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validEmail) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('email', email.trim())
      fd.set('flow', 'reset')
      await signIn('password', fd)
      setStep({ type: 'resetPassword', email: email.trim() })
    } catch (err) {
      setError(friendly(err, 'Could not send a reset code.'))
    } finally {
      setBusy(false)
    }
  }

  const submitReset = async (e: React.FormEvent, targetEmail: string) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your email.')
    if (password.length < 8) return setError('New password must be at least 8 characters.')
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('email', targetEmail)
      fd.set('code', code)
      fd.set('newPassword', password)
      fd.set('flow', 'reset-verification')
      await signIn('password', fd)
    } catch (err) {
      setError(friendly(err, 'Could not reset the password.'))
    } finally {
      setBusy(false)
    }
  }

  const err = error ? <p className="mt-3 text-[13px] text-destructive">{error}</p> : null

  if (typeof step === 'object' && step.type === 'verifyEmail') {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">We sent a 6-digit code to {step.email}.</p>
        <form className="mt-5 space-y-4" onSubmit={(e) => submitVerify(e, step.email)}>
          <Field label="Verification code" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError('') }} />
          {err}
          <PrimaryButton type="submit" busy={busy}>Verify and continue</PrimaryButton>
        </form>
        <button onClick={() => reset('signIn')} className="mt-4 text-sm text-muted-foreground hover:text-foreground">Back to sign in</button>
      </Card>
    )
  }

  if (typeof step === 'object' && step.type === 'resetPassword') {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter the code sent to {step.email} and a new password.</p>
        <form className="mt-5 space-y-4" onSubmit={(e) => submitReset(e, step.email)}>
          <Field label="Reset code" name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError('') }} />
          <Field label="New password" name="newPassword" type="password" autoComplete="new-password" value={password} onChange={(v) => { setPassword(v); setError('') }} placeholder="At least 8 characters" />
          {err}
          <PrimaryButton type="submit" busy={busy}>Reset password</PrimaryButton>
        </form>
      </Card>
    )
  }

  if (step === 'forgot') {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">We'll email you a reset code.</p>
        <form className="mt-5 space-y-4" onSubmit={submitForgot}>
          <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(v) => { setEmail(v); setError('') }} />
          {err}
          <PrimaryButton type="submit" busy={busy}>Send reset code</PrimaryButton>
        </form>
        <button onClick={() => reset('signIn')} className="mt-4 text-sm text-muted-foreground hover:text-foreground">Back to sign in</button>
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold">{step === 'signIn' ? 'Sign in to your hiring workspace' : 'Create your account'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Results and answer keys are only visible to your hiring team. Candidates don't need an account.
      </p>
      <form className="mt-5 space-y-4" onSubmit={submitCredentials}>
        <Field label="Work email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(v) => { setEmail(v); setError('') }} />
        <Field label="Password" name="password" type="password" autoComplete={step === 'signUp' ? 'new-password' : 'current-password'} value={password} onChange={(v) => { setPassword(v); setError('') }} placeholder="At least 8 characters" />
        {err}
        <PrimaryButton type="submit" busy={busy}>{step === 'signIn' ? 'Sign in' : 'Create account'}</PrimaryButton>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button onClick={() => reset(step === 'signIn' ? 'signUp' : 'signIn')} className="font-medium hover:underline">
          {step === 'signIn' ? 'Create an account' : 'Have an account? Sign in'}
        </button>
        {step === 'signIn' ? (
          <button onClick={() => reset('forgot')} className="text-muted-foreground hover:text-foreground">Forgot password?</button>
        ) : null}
      </div>
    </Card>
  )
}

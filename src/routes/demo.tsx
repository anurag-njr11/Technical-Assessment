import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { Authenticated, AuthLoading, Unauthenticated, useMutation } from 'convex/react'
import { Loader2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Page, btn, cleanError } from '@/components/rb'

// "Try the live demo": anonymous sign-in, join the shared demo workspace as a
// read-only viewer, then land on the recruiter dashboard.
export const Route = createFileRoute('/demo')({
  head: () => ({ meta: [{ title: 'Live demo — ReviewBench' }] }),
  component: Demo,
})

function Demo() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <Page subtitle="Live demo" width="form" className="sm:py-24">
      {mounted ? (
        <>
          <AuthLoading><Opening text="Opening the demo…" /></AuthLoading>
          <Unauthenticated><SignInAnonymously /></Unauthenticated>
          <Authenticated><JoinDemo /></Authenticated>
        </>
      ) : (
        <Opening text="Opening the demo…" />
      )}
    </Page>
  )
}

function Opening({ text }: { text: string }) {
  return (
    <div className="grid place-items-center gap-3 py-16 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-6 animate-spin" />
      {text}
    </div>
  )
}

function SignInAnonymously() {
  const { signIn } = useAuthActions()
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    signIn('anonymous').catch((err) => setError(cleanError(err, 'Could not open the demo.')))
  }, [signIn])
  return error ? <p className="text-center text-sm text-destructive">{error}</p> : <Opening text="Opening the demo…" />
}

function JoinDemo() {
  const join = useMutation(api.demo.join)
  const navigate = useNavigate()
  const { signOut } = useAuthActions()
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    join({})
      .then(() => navigate({ to: '/recruiter', replace: true }))
      .catch((err) => setError(cleanError(err, 'Could not open the demo.')))
  }, [join, navigate])
  if (!error) return <Opening text="Setting up your demo workspace…" />
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <button onClick={() => void signOut().then(() => location.reload())} className={btn.secondary}>Sign out and open the demo</button>
    </div>
  )
}

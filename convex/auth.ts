import { convexAuth } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"
import { Anonymous } from "@convex-dev/auth/providers/Anonymous"
import Google from "@auth/core/providers/google"
import { ResendOTP } from "./ResendOTP"

// Recruiters sign in with email + password. Email ownership is verified with a
// one-time code before a session is issued, so invites keyed by email can be
// trusted. Candidates do not need accounts.
//
// SEC-4: Google sign-in is added when AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are
// set. AUTH_GOOGLE_HD limits it to one Google Workspace domain. Only addresses
// Google reports as verified count as verified (invites are keyed by email).
const hd = process.env.AUTH_GOOGLE_HD
const google = process.env.AUTH_GOOGLE_ID
  ? [
      Google({
        authorization: hd ? { params: { hd } } : undefined,
        profile(p) {
          if (hd && p.hd !== hd) throw new Error(`Sign in with your ${hd} Google account.`)
          return { id: p.sub, name: p.name, email: p.email, image: p.picture, emailVerified: p.email_verified === true } as never
        },
      }),
    ]
  : []

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Anonymous: only for "Try the live demo" (read-only viewer of the demo workspace).
  providers: [ResendOTP, Password({ reset: ResendOTP, verify: ResendOTP }), Anonymous, ...google],
})

export const googleEnabled = () => google.length > 0

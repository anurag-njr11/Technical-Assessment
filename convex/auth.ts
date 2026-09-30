import { convexAuth } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"
import { ResendOTP } from "./ResendOTP"

// Recruiters sign in with email + password. Email ownership is verified with a
// one-time code before a session is issued, so invites keyed by email can be
// trusted. Candidates do not need accounts.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP, Password({ reset: ResendOTP, verify: ResendOTP })],
})

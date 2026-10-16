import { v } from "convex/values"
import { internalAction } from "./_generated/server"

/** Sends via Resend; without RESEND_API_KEY (local dev) the email goes to the Convex logs. */
export async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[dev] email to ${to}: ${subject}\n${text}`)
    return
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "ReviewBench <onboarding@resend.dev>", to: [to], subject, text }),
  })
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string }
    throw new Error(errorData.message || "Failed to send email")
  }
}

/** Public URL of a path on the site (SITE_URL is set for Convex Auth). */
export const siteUrl = (path: string) => `${(process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`

export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  handler: async (_ctx, args) => {
    await sendEmail(args.to, args.subject, args.text)
  },
})

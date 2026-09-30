import { Email } from "@convex-dev/auth/providers/Email";

function generateOTP(length: number): string {
  const digits = "0123456789";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (num) => digits[num % digits.length]).join("");
}

export const ResendOTP = Email({
  id: "resend-otp",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP(6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    // Local dev without an email provider: the code goes to the Convex logs.
    if (!process.env.RESEND_API_KEY) {
      console.log(`[dev] verification code for ${email}: ${token}`)
      return
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "ReviewBench <onboarding@resend.dev>",
        to: [email],
        subject: "Your ReviewBench verification code",
        text: `Your verification code is ${token}. It expires in 15 minutes.`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to send verification email");
    }
  },
});

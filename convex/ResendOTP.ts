import { Email } from "@convex-dev/auth/providers/Email";
import { sendEmail } from "./email";

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
    await sendEmail(email, "Your ReviewBench verification code", `Your verification code is ${token}. It expires in 15 minutes.`);
  },
});

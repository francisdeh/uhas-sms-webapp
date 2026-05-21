import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Provider-agnostic email sender. Today this is wired to Gmail SMTP via the
// SMTP_* env vars; swapping to Resend / SendGrid / Postmark / Mailgun later
// is a one-line change inside getTransporter() — callers don't care.
//
// Env vars consumed:
//   SMTP_HOST           e.g. "smtp.gmail.com"      (required to send)
//   SMTP_PORT           e.g. "465"                  (default 465 → TLS)
//   SMTP_USER           e.g. "you@gmail.com"
//   SMTP_PASS           Gmail App Password (NOT the account password)
//   EMAIL_FROM          e.g. 'UHAS SMS <noreply@uhas.edu.gh>'  (default: SMTP_USER)
//   EMAIL_DEV_REDIRECT  if set + NODE_ENV !== "production", every email is
//                       sent to this address instead of the real recipient.
//                       Keeps dev/test from accidentally emailing parents.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailResult =
  | { success: true; skipped?: boolean }
  | { success: false; error: string };

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransporter;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const transporter = getTransporter();

  // No SMTP configured — log the email instead of sending. Lets every
  // environment (dev, CI, tests) run the same code path without exploding.
  if (!transporter) {
    console.warn(
      `[email] SMTP not configured — would have sent to ${msg.to}: ${msg.subject}`
    );
    return { success: true, skipped: true };
  }

  const devRedirect =
    process.env.NODE_ENV !== "production" && process.env.EMAIL_DEV_REDIRECT;
  const to = devRedirect || msg.to;
  const subject = devRedirect ? `[dev → ${msg.to}] ${msg.subject}` : msg.subject;
  const from = process.env.EMAIL_FROM ?? `UHAS SMS <${process.env.SMTP_USER}>`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text: msg.text,
      html: msg.html,
    });
    return { success: true };
  } catch (err) {
    const message = (err as Error).message ?? "Unknown email error";
    console.error(`[email] send to ${msg.to} failed:`, message);
    return { success: false, error: message };
  }
}

// Build a fully-qualified URL to a route in the app. Uses APP_URL on the
// server (set on Railway) and falls back to the public client URL for dev.
export function appUrl(pathname: string): string {
  const base =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${trimmedBase}${trimmedPath}`;
}

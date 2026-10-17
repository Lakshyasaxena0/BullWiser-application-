// ─────────────────────────────────────────────────────────────────────────────
// mailer.ts — sends transactional email over HTTPS (not SMTP).
// Render's free tier blocks outbound SMTP ports, so we use an email API instead.
//
// Configure ONE provider on Render:
//   Brevo  (free 300 mails/day, can send from a single verified sender address):
//       BREVO_API_KEY=xkeysib-...
//   Resend (needs a verified domain to mail other people):
//       RESEND_API_KEY=re_...
// and the sender:
//       MAIL_FROM="BullWiser <noreply@yourdomain.com>"   (must be verified at the provider)
//
// With no provider configured nothing is sent; the message is written to the server log
// instead so the flow can still be tested.
// ─────────────────────────────────────────────────────────────────────────────

export interface MailMessage { to: string; subject: string; text: string; html: string }

function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  return m ? { name: (m[1] || 'BullWiser').trim(), email: m[2].trim() } : { name: 'BullWiser', email: raw.trim() };
}

export function isMailConfigured(): boolean {
  return !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) && !!process.env.MAIL_FROM;
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const from = process.env.MAIL_FROM || '';
  const brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if ((!brevoKey && !resendKey) || !from) {
    console.warn('[Mail] No email provider configured (set BREVO_API_KEY or RESEND_API_KEY, and MAIL_FROM). Not sent.');
    console.warn(`[Mail] Would have sent to ${msg.to}: ${msg.subject}\n${msg.text}`);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let res: Response;
    if (brevoKey) {
      const sender = parseFrom(from);
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: msg.to }], subject: msg.subject, htmlContent: msg.html, textContent: msg.text }),
      });
    } else {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      });
    }
    if (!res.ok) {
      console.error(`[Mail] Provider rejected the message (HTTP ${res.status}):`, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[Mail] Send failed:', err?.name === 'AbortError' ? 'timeout' : err?.message || err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

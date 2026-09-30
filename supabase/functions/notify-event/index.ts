// supabase/functions/notify-event/index.ts
// ---------------------------------------------------------------------
// Sends one notification email through Brevo (free plan: 300 emails/day).
// Called ONLY by the database (public.send_notification_email), which
// sends the shared secret in the x-internal-secret header.
//
// Required secrets (supabase secrets set ...):
//   INTERNAL_TRIGGER_SECRET  same value as the Vault secret 'notify_event_secret'
//   BREVO_API_KEY            Brevo → SMTP & API → API Keys
//   MAIL_FROM_EMAIL          a sender verified in Brevo (Senders & IP)
//   MAIL_FROM_NAME           optional, default "IT Support"
//
// Body: { to_email, to_name?, subject, message, ticket_url? }
//       (to_emails: string[] is also accepted)
// ---------------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Ticket subjects and replies are written by users: never inject them as raw HTML. */
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderHtml(p: { to_name?: string; subject: string; message: string; ticket_url?: string }) {
  const button = p.ticket_url && /^https:\/\//.test(p.ticket_url)
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${esc(p.ticket_url)}"
            style="background:#4f46e5;color:#ffffff;padding:11px 22px;border-radius:8px;
                   text-decoration:none;display:inline-block;font-weight:600;font-size:14px;">
           Open ticket
         </a>
       </td></tr>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f6fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border:1px solid #e4e6ef;border-radius:14px;
                    font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#111827;">
        <tr><td style="padding:18px 24px;border-bottom:1px solid #f0f1f7;font-weight:700;color:#4f46e5;font-size:15px;">
          IT Support
        </td></tr>
        <tr><td style="padding:22px 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:17px;font-weight:700;padding-bottom:10px;">${esc(p.subject)}</td></tr>
            ${p.to_name ? `<tr><td style="font-size:14px;color:#374151;padding-bottom:6px;">Hi ${esc(p.to_name)},</td></tr>` : ''}
            <tr><td dir="auto" style="font-size:14px;line-height:1.7;color:#374151;padding-bottom:16px;white-space:pre-wrap;">${esc(p.message)}</td></tr>
            ${button}
          </table>
        </td></tr>
        <tr><td style="padding:16px 24px;font-size:12px;color:#9ca3af;border-top:1px solid #f0f1f7;">
          This is an automatic message from the IT Support portal. Please reply inside the ticket, not to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('INTERNAL_TRIGGER_SECRET');
  if (!expected || req.headers.get('x-internal-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('MAIL_FROM_EMAIL');
  const fromName = Deno.env.get('MAIL_FROM_NAME') ?? 'IT Support';
  if (!apiKey || !fromEmail) return json({ error: 'Email is not configured' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const recipients: string[] = (
    Array.isArray(body.to_emails) ? body.to_emails : [body.to_email]
  ).filter((e: unknown) => typeof e === 'string' && e.includes('@'));

  if (!recipients.length || !body.subject) {
    return json({ error: 'to_email and subject are required' }, 400);
  }

  const subject = String(body.subject).slice(0, 200);
  const html = renderHtml({
    to_name: recipients.length === 1 ? body.to_name : undefined,
    subject,
    message: String(body.message ?? ''),
    ticket_url: body.ticket_url,
  });

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: recipients.map(email => ({ email })),
        subject,
        htmlContent: html,
        textContent: `${subject}\n\n${body.message ?? ''}${body.ticket_url ? `\n\nOpen ticket: ${body.ticket_url}` : ''}`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('Brevo error', res.status, detail);
      return json({ error: 'Email provider error', status: res.status }, 502);
    }
    return json({ success: true });
  } catch (err) {
    console.error('notify-event failed:', err);
    return json({ error: (err as Error).message }, 500);
  }
});
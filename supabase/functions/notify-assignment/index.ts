// supabase/functions/notify-assignment/index.ts
// Sends an email to the assigned team member when a ticket is assigned to them.
// Uses Resend API (free tier: 3000 emails/month).
// If you prefer SMTP, swap the fetch call for an SMTP client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is authenticated admin
    const authHeader = req.headers.get('Authorization')!;
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: profile } = await adminClient
      .from('user_profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    const { assignee_email, assignee_name, ticket_number, ticket_subject, ticket_url } = await req.json();

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'IT Support <noreply@yourdomain.com>';

    if (!RESEND_API_KEY) {
      // If no email service configured, just return success (silent fail)
      console.log('No RESEND_API_KEY configured — email skipped');
      return new Response(JSON.stringify({ success: true, email_sent: false }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailBody = {
      from: FROM_EMAIL,
      to: [assignee_email],
      subject: `[${ticket_number}] Ticket assigned to you: ${ticket_subject}`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto;">
          <div style="background: #4f46e5; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 18px;">🎫 New ticket assigned</h2>
          </div>
          <div style="background: #fff; padding: 28px; border: 1px solid #e4e6ef; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; margin: 0 0 16px;">Hi <strong>${assignee_name}</strong>,</p>
            <p style="color: #374151; margin: 0 0 20px;">A support ticket has been assigned to you:</p>
            <div style="background: #f9fafb; border: 1px solid #e4e6ef; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">${ticket_number}</div>
              <div style="font-size: 16px; font-weight: 600; color: #111827;">${ticket_subject}</div>
            </div>
            <a href="${ticket_url}"
              style="display: inline-block; background: #4f46e5; color: #fff; text-decoration: none;
                     padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              View ticket →
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">IT Support Portal</p>
          </div>
        </div>
      `,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message ?? 'Email send failed');

    return new Response(JSON.stringify({ success: true, email_sent: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
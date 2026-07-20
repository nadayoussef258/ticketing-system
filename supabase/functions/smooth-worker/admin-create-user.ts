import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization')!;
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: roleRow } = await adminClient.from('user_org').select('role').eq('user_id', user.id).single();
  if (roleRow?.role !== 'it') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

  const { email, password, org_id, role, full_name } = await req.json();

  const { data: created, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  await adminClient.from('user_org').insert({ user_id: created.user.id, org_id: role === 'it' ? null : org_id, role });
  if (role === 'it') await adminClient.from('team_members').insert({ id: created.user.id, full_name: full_name ?? email.split('@')[0], email });

  return new Response(JSON.stringify({ user_id: created.user.id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
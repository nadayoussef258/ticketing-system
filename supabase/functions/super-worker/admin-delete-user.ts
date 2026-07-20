import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization')!;
  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const { data: roleRow } = await adminClient.from('user_org').select('role').eq('user_id', user.id).single();
  if (roleRow?.role !== 'it') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

  const { user_id, action } = await req.json();
  if (user_id === user.id) return new Response(JSON.stringify({ error: 'Cannot modify own account' }), { status: 400, headers: corsHeaders });

  if (action === 'delete') {
    await adminClient.auth.admin.deleteUser(user_id);
  } else {
    const ban_duration = action === 'enable' ? 'none' : '876000h';
    await adminClient.auth.admin.updateUserById(user_id, { ban_duration } as any);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
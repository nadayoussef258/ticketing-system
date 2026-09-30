// supabase/functions/admin-users/index.ts
// ---------------------------------------------------------------------
// One Edge Function for all user management done by the IT admin.
// Replaces smooth-worker / dynamic-api / super-worker (leave those
// deployed until the new frontend is live, then you can delete them).
//
// Body: { action, ...params }
//   create          { email, password, full_name, role: 'it_staff' | 'project_admin', project_id? }
//   reset_password  { user_id, new_password }
//   disable         { user_id }
//   enable          { user_id }
//   delete          { user_id }
// ---------------------------------------------------------------------
// npm: specifier is the one Supabase recommends (esm.sh can hang on cold start)
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const CREATABLE_ROLES = ['it_staff', 'project_admin'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    return await handle(req);
  } catch (err) {
    console.error('admin-users failed:', err);
    return json({ error: (err as Error)?.message ?? 'Unexpected server error' }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1) Who is calling?
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 2) Only the IT admin may use this function
  const { data: me } = await admin
    .from('user_profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body?.action as string;

  // ---------------- create ----------------
  if (action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const full_name = String(body.full_name ?? '').trim() || email.split('@')[0];
    const role = body.role as (typeof CREATABLE_ROLES)[number];
    const project_id = role === 'project_admin' ? (body.project_id ?? null) : null;

    if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    if (full_name.length < 2) return json({ error: 'Name must be at least 2 characters' }, 400);
    if (!CREATABLE_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);
    if (role === 'project_admin' && !project_id) return json({ error: 'project_id is required' }, 400);

    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error || !created.user) return json({ error: error?.message ?? 'Could not create user' }, 400);

    const { error: profileError } = await admin.from('user_profiles').insert({
      id: created.user.id, full_name, role, project_id,
    });
    if (profileError) {
      // don't leave a login without a profile behind
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: profileError.message }, 400);
    }

    await admin.from('audit_logs').insert({
      actor_id: user.id, actor_name: me.full_name, action: 'team.user_created', target_type: 'user',
      target_id: created.user.id, project_id,
      details: { target_name: full_name, role },
    });

    return json({ user_id: created.user.id });
  }

  // ------------- actions on an existing user -------------
  const user_id = String(body.user_id ?? '');
  if (!user_id) return json({ error: 'user_id is required' }, 400);
  if (user_id === user.id) return json({ error: 'You cannot modify your own account here' }, 400);

  const { data: target } = await admin
    .from('user_profiles').select('full_name, role, project_id').eq('id', user_id).maybeSingle();
  if (!target) return json({ error: 'User not found' }, 404);
  if (target.role === 'admin' && action !== 'reset_password') {
    return json({ error: 'The IT admin account cannot be disabled or deleted' }, 400);
  }

  const log = (logAction: string) => admin.from('audit_logs').insert({
    actor_id: user.id, actor_name: me.full_name, action: logAction, target_type: 'user', target_id: user_id,
    project_id: target.project_id, details: { target_name: target.full_name },
  });

  if (action === 'reset_password') {
    const new_password = String(body.new_password ?? '');
    if (new_password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return json({ error: error.message }, 400);
    await log('team.password_reset');
    return json({ success: true });
  }

  if (action === 'disable' || action === 'enable') {
    const { error } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: action === 'disable' ? '876000h' : 'none',
    } as any);
    if (error) return json({ error: error.message }, 400);
    await log(action === 'disable' ? 'team.user_disabled' : 'team.user_enabled');
    return json({ success: true });
  }

  if (action === 'delete') {
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) {
      // Usually: the user has replies / tickets linked to them (history)
      return json({
        error: 'This account has ticket history and cannot be deleted. Disable it instead.',
        code: 'HAS_HISTORY',
      }, 409);
    }
    await log('team.user_deleted');
    return json({ success: true });
  }

  return json({ error: 'Unknown action' }, 400);
}
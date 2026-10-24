// Supabase Edge Function: permanently deletes the calling user's account.
// All personal rows are removed by ON DELETE CASCADE from auth.users (see docs/DATABASE.md §8).
// Deploy: supabase functions deploy delete-account
// The service role key is provided by the Edge runtime (SUPABASE_SERVICE_ROLE_KEY) and never
// leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'unauthorized' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Identify the caller from their own access token (never from the request body).
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json(401, { error: 'unauthorized' });

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    // Do not log personal data; the user id is enough to investigate.
    console.error('delete-account failed', data.user.id, deleteError.message);
    return json(500, { error: 'delete_failed' });
  }
  return json(200, { ok: true });
});

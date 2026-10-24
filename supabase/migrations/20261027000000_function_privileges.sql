-- Phase 7 hardening: Supabase grants EXECUTE on new public functions to anon and
-- authenticated by default. Only the functions the app calls stay callable by users.
--
--   search_foods      → authenticated (food search RPC)
--   is_premium        → service_role only (used inside triggers; the app reads
--                       public.subscriptions, which RLS limits to the user's own row)
--   trigger functions → nobody (triggers fire regardless of EXECUTE privilege)
--   billing writers   → service_role only (already revoked in 20261026000000_billing.sql)

revoke execute on function public.search_foods(text, text, integer, integer) from public, anon;

revoke execute on function public.is_premium(uuid) from public, anon, authenticated;
grant execute on function public.is_premium(uuid) to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_undelete() from public, anon, authenticated;
revoke execute on function public.enforce_free_plan_limit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Functions created by later migrations are not executable by anon unless granted explicitly.
alter default privileges in schema public revoke execute on functions from anon;
-- PostgreSQL's built-in default lets PUBLIC execute every new function; that one is global.
alter default privileges revoke execute on functions from public;

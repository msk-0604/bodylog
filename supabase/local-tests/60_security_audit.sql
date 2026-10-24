-- Phase 7: catalog-level security invariants for everything in the public schema.
-- Fails when a future migration forgets RLS, a search_path, or leaks EXECUTE to users.
do $$
declare
  r record;
  allowed_auth text[] := array['search_foods'];
begin
  -- every table has RLS enabled
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'FAIL: RLS disabled on public.%', r.relname;
  end loop;

  -- no views (they would bypass RLS unless security_invoker)
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    raise exception 'FAIL: unexpected view public.%', r.relname;
  end loop;

  -- security definer functions pin search_path
  for r in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    raise exception 'FAIL: security definer without search_path: public.%', r.proname;
  end loop;

  -- anon: no table access, no function execution
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))
  loop
    raise exception 'FAIL: anon has privileges on public.%', r.relname;
  end loop;
  for r in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    raise exception 'FAIL: anon can execute public.%', r.proname;
  end loop;

  -- authenticated: only the allow-listed RPCs
  for r in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not (p.proname = any (allowed_auth))
  loop
    raise exception 'FAIL: authenticated can execute public.%', r.proname;
  end loop;

  -- server-owned tables are read-only (or invisible) for users
  if has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.subscriptions', 'DELETE')
     or has_table_privilege('authenticated', 'public.subscription_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.food_master', 'INSERT')
     or has_table_privilege('authenticated', 'public.food_master', 'UPDATE') then
    raise exception 'FAIL: users can write server-owned tables';
  end if;
end $$;

-- functions created after the hardening migration are not executable by anon by default
create function public.zz_probe() returns int language sql as 'select 1';
do $$
begin
  if has_function_privilege('anon', 'public.zz_probe()', 'EXECUTE') then
    raise exception 'FAIL: default privileges still grant EXECUTE to anon';
  end if;
end $$;
drop function public.zz_probe();

\echo 'SECURITY AUDIT PASSED'

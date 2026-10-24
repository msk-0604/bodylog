-- Rules required by offline sync (docs/ARCHITECTURE.md §4)

-- 1) Deletes win: once a row is soft-deleted, a later upsert from another device
--    (which still has the old, undeleted copy) must not resurrect it.
create or replace function public.prevent_undelete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'body_measurements', 'custom_foods', 'food_favorites', 'meal_entries', 'meal_items',
    'meal_templates', 'meal_template_items', 'exercise_entries', 'exercise_sets'
  ] loop
    execute format(
      'create trigger prevent_undelete before update on public.%I
         for each row execute function public.prevent_undelete()', t);
  end loop;
end;
$$;

-- 2) Free-plan limit: BEFORE INSERT triggers also fire for `INSERT ... ON CONFLICT DO UPDATE`
--    (PostgREST upsert). An upsert of an EXISTING row is an update, not a new favorite/template,
--    so it must not be counted against the limit.
create or replace function public.enforce_free_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_count integer;
  v_exists boolean;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    execute format('select exists (select 1 from public.%I where id = $1)', tg_table_name)
      into v_exists using new.id;
    if v_exists then
      return new; -- upsert of an existing row → handled as an update
    end if;
  end if;
  if public.is_premium(new.user_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(tg_table_name || new.user_id::text));

  execute format(
    'select count(*) from public.%I where user_id = $1 and deleted_at is null and id <> $2',
    tg_table_name)
  into v_count
  using new.user_id, new.id;

  if v_count >= v_limit then
    raise exception 'free plan limit reached for %', tg_table_name
      using errcode = 'P0001', hint = 'premium_required';
  end if;
  return new;
end;
$$;

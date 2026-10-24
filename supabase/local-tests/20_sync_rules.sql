-- Sync-related server rules (migration 20261025000000_sync_rules.sql)
\set carol '33333333-3333-3333-3333-333333333333'
insert into auth.users (id, email) values (:'carol', 'carol@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', :'carol', false);

-- Soft-deleted rows cannot be resurrected by a stale upsert from another device
insert into public.body_measurements (id, user_id, weight_kg, measured_at, measured_on, time_zone)
values ('f0000000-0000-0000-0000-000000000001', :'carol', 60, now(), current_date, 'Asia/Tokyo');
update public.body_measurements set deleted_at = now() where id = 'f0000000-0000-0000-0000-000000000001';
insert into public.body_measurements (id, user_id, weight_kg, measured_at, measured_on, time_zone, deleted_at)
values ('f0000000-0000-0000-0000-000000000001', :'carol', 61, now(), current_date, 'Asia/Tokyo', null)
on conflict (id) do update set weight_kg = excluded.weight_kg, deleted_at = excluded.deleted_at;
do $$
begin
  if (select deleted_at from public.body_measurements where id = 'f0000000-0000-0000-0000-000000000001') is null then
    raise exception 'FAIL: soft-deleted row was resurrected';
  end if;
end $$;

-- Upserting an existing favorite at the free limit is an update, not a new favorite
do $$
declare i int;
begin
  for i in 1..10 loop
    insert into public.custom_foods (id, user_id, name, search_text)
    values (('f1000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, auth.uid(), 'c' || i, 'c' || i);
    insert into public.food_favorites (id, user_id, custom_food_id)
    values (('f2000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, auth.uid(),
            ('f1000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid);
  end loop;
  insert into public.food_favorites (id, user_id, custom_food_id, sort_order)
  values ('f2000000-0000-0000-0000-000000000001', auth.uid(), 'f1000000-0000-0000-0000-000000000001', 5)
  on conflict (id) do update set sort_order = excluded.sort_order;
  if (select sort_order from public.food_favorites where id = 'f2000000-0000-0000-0000-000000000001') <> 5 then
    raise exception 'FAIL: upsert of existing favorite not applied';
  end if;
  -- a genuinely new 11th favorite is still rejected, also via upsert
  begin
    insert into public.food_favorites (id, user_id, food_id)
    values (gen_random_uuid(), auth.uid(), 'aaaaaaaa-0000-0000-0000-000000000002')
    on conflict (id) do update set sort_order = excluded.sort_order;
    raise exception 'FAIL: 11th favorite accepted via upsert';
  exception when raise_exception then
    if sqlerrm not like 'free plan limit reached%' then raise; end if;
  end;
end $$;

-- nutrition_goals upsert by (user_id, effective_from) keeps one row per day
insert into public.nutrition_goals (id, user_id, effective_from, calorie_kcal)
values (gen_random_uuid(), :'carol', current_date, 1800)
on conflict (user_id, effective_from) do update set calorie_kcal = excluded.calorie_kcal;
insert into public.nutrition_goals (id, user_id, effective_from, calorie_kcal)
values (gen_random_uuid(), :'carol', current_date, 1900)
on conflict (user_id, effective_from) do update set calorie_kcal = excluded.calorie_kcal, id = excluded.id;
do $$
begin
  if (select count(*) from public.nutrition_goals) <> 1 then raise exception 'FAIL: duplicate goal rows'; end if;
  if (select calorie_kcal from public.nutrition_goals) <> 1900 then raise exception 'FAIL: goal not updated'; end if;
end $$;

reset role;
\echo 'SYNC RULE TESTS PASSED'

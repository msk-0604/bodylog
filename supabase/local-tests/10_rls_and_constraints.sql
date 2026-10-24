-- RLS / constraint tests for the BODYLOG schema. Each block raises on failure.
-- Run via scripts/db-test.sh (psql -v ON_ERROR_STOP=1).

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, email) values
  (:'alice', 'alice@example.com'),
  (:'bob', 'bob@example.com');

-- Food master is loaded by the service role.
insert into public.food_master
  (id, food_code, name, search_text, category_code, category_name,
   energy_kcal, protein_g, fat_g, carbohydrate_g, value_flags, source, source_version)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '01088', 'こめ［水稲めし］精白米 うるち米', 'こめ水稲めし精白米うるち米',
   '01', '穀類', 156, 2.5, 0.3, 37.1, '{}', 'test', 'test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '12004', '鶏卵 全卵 生', '鶏卵全卵生',
   '12', '卵類', 142, 12.2, 10.2, 0.4, '{}', 'test', 'test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '99999', 'テスト_100%食品', 'てすと_100%食品',
   '99', 'その他', null, 1, null, 1, '{"energy_kcal":"missing"}', 'test', 'test');

-- ---------------------------------------------------------------------------
-- handle_new_user trigger
do $$
begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'profiles not bootstrapped'; end if;
  if (select count(*) from public.user_preferences) <> 2 then raise exception 'preferences not bootstrapped'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Act as Alice
set role authenticated;
select set_config('request.jwt.claim.sub', :'alice', false);

insert into public.body_measurements (id, user_id, weight_kg, body_fat_pct, measured_at, measured_on, time_zone)
values ('b0000000-0000-0000-0000-000000000001', :'alice', 65.4, 22.5, now(), current_date, 'Asia/Tokyo');

insert into public.meal_entries (id, user_id, eaten_on, eaten_at, time_zone, meal_type)
values ('c0000000-0000-0000-0000-000000000001', :'alice', current_date, now(), 'Asia/Tokyo', 'breakfast');

insert into public.meal_items (id, user_id, meal_entry_id, food_id, food_name, grams,
  energy_kcal, protein_g, fat_g, carbohydrate_g, nutrient_source_version)
values ('d0000000-0000-0000-0000-000000000001', :'alice', 'c0000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001', '精白米 めし', 150, 234, 3.8, 0.5, 55.7, 'test');

do $$
begin
  if (select count(*) from public.body_measurements) <> 1 then raise exception 'alice cannot see own weight'; end if;
  if (select count(*) from public.food_master) <> 3 then raise exception 'alice cannot read food master'; end if;
end $$;

-- Search: normalized substring match, LIKE wildcards are literal, prefix matches first
do $$
declare n int;
begin
  select count(*) into n from public.search_foods('全卵');
  if n <> 1 then raise exception 'search 全卵 expected 1, got %', n; end if;
  select count(*) into n from public.search_foods('%');
  if n <> 1 then raise exception 'search %% must match literally, got %', n; end if;
  select count(*) into n from public.search_foods('_');
  if n <> 1 then raise exception 'search _ must match literally, got %', n; end if;
  select count(*) into n from public.search_foods('');
  if n <> 0 then raise exception 'empty search must return nothing'; end if;
  if (select energy_kcal from public.search_foods('てすと')) is not null then
    raise exception 'unknown energy must stay NULL';
  end if;
end $$;

-- Alice cannot write reference / billing data
do $$
begin
  begin
    insert into public.food_master (food_code, name, search_text, category_code, category_name, source, source_version)
    values ('x', 'x', 'x', 'x', 'x', 'x', 'x');
    raise exception 'FAIL: user inserted into food_master';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.subscriptions (user_id, status, expires_at)
    values (auth.uid(), 'active', now() + interval '30 days');
    raise exception 'FAIL: user granted themselves premium';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.subscription_events;
    raise exception 'FAIL: user can read subscription events';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Alice cannot create rows owned by Bob
do $$
begin
  begin
    insert into public.body_measurements (id, user_id, weight_kg, measured_at, measured_on, time_zone)
    values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 70, now(), current_date, 'Asia/Tokyo');
    raise exception 'FAIL: inserted row for another user';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Free plan: 10 favorites, 1 template (server-side)
do $$
declare i int;
begin
  -- 10 custom foods + favorites
  for i in 1..10 loop
    insert into public.custom_foods (id, user_id, name, search_text)
    values (('e0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, auth.uid(), 'food' || i, 'food' || i);
    insert into public.food_favorites (id, user_id, custom_food_id)
    values (gen_random_uuid(), auth.uid(), ('e0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid);
  end loop;
  begin
    insert into public.food_favorites (id, user_id, food_id)
    values (gen_random_uuid(), auth.uid(), 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FAIL: 11th favorite allowed on free plan';
  exception when raise_exception then
    if sqlerrm not like 'free plan limit reached%' then raise; end if;
  end;

  insert into public.meal_templates (id, user_id, name) values (gen_random_uuid(), auth.uid(), 'いつもの朝食');
  begin
    insert into public.meal_templates (id, user_id, name) values (gen_random_uuid(), auth.uid(), '2つ目');
    raise exception 'FAIL: 2nd template allowed on free plan';
  exception when raise_exception then
    if sqlerrm not like 'free plan limit reached%' then raise; end if;
  end;
end $$;

-- Soft-deleting a favorite frees a slot
update public.food_favorites set deleted_at = now()
where id = (select id from public.food_favorites order by created_at limit 1);
insert into public.food_favorites (id, user_id, food_id)
values (gen_random_uuid(), :'alice', 'aaaaaaaa-0000-0000-0000-000000000001');

-- Constraints
do $$
begin
  begin
    insert into public.body_measurements (id, user_id, weight_kg, measured_at, measured_on, time_zone)
    values (gen_random_uuid(), auth.uid(), 0, now(), current_date, 'Asia/Tokyo');
    raise exception 'FAIL: 0 kg accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.meal_entries (id, user_id, eaten_on, eaten_at, time_zone, meal_type)
    values (gen_random_uuid(), auth.uid(), current_date, now(), 'Asia/Tokyo', 'brunch');
    raise exception 'FAIL: invalid meal_type accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.meal_items (id, user_id, meal_entry_id, food_name, grams)
    values (gen_random_uuid(), auth.uid(), 'c0000000-0000-0000-0000-000000000001', 'x', 0);
    raise exception 'FAIL: 0 g accepted';
  exception when check_violation then null;
  end;
end $$;

-- Idempotent upsert by client id (sync retry must not duplicate)
insert into public.body_measurements (id, user_id, weight_kg, measured_at, measured_on, time_zone)
values ('b0000000-0000-0000-0000-000000000001', :'alice', 65.2, now(), current_date, 'Asia/Tokyo')
on conflict (id) do update set weight_kg = excluded.weight_kg;
do $$
begin
  if (select count(*) from public.body_measurements) <> 1 then raise exception 'upsert duplicated'; end if;
  if (select weight_kg from public.body_measurements) <> 65.2 then raise exception 'upsert did not update'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Act as Bob: cannot see or touch Alice's data
select set_config('request.jwt.claim.sub', :'bob', false);

do $$
declare n int;
begin
  if (select count(*) from public.body_measurements) <> 0 then raise exception 'bob sees alice weights'; end if;
  if (select count(*) from public.meal_entries) <> 0 then raise exception 'bob sees alice meals'; end if;
  if (select count(*) from public.meal_items) <> 0 then raise exception 'bob sees alice items'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'bob must see only own profile'; end if;

  update public.body_measurements set weight_kg = 99 where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'bob updated alice weight'; end if;

  delete from public.meal_entries where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'bob deleted alice meal'; end if;

  -- Bob cannot attach an item to Alice's meal entry (composite FK + RLS)
  begin
    insert into public.meal_items (id, user_id, meal_entry_id, food_name, grams)
    values (gen_random_uuid(), auth.uid(), 'c0000000-0000-0000-0000-000000000001', 'x', 10);
    raise exception 'FAIL: bob attached item to alice meal';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- anon has no access
reset role;
set role anon;
do $$
begin
  begin
    perform 1 from public.food_master;
    raise exception 'FAIL: anon can read food_master';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Premium (written by service role) lifts the limits; expiry restores them
reset role;
set role service_role;
insert into public.subscriptions (user_id, status, store, product_id, expires_at, will_renew)
values (:'alice', 'active', 'app_store', 'bodylog_premium_monthly', now() + interval '30 days', true);

set role authenticated;
select set_config('request.jwt.claim.sub', :'alice', false);
do $$
begin
  if not public.is_premium(auth.uid()) then raise exception 'premium not detected'; end if;
  insert into public.meal_templates (id, user_id, name) values (gen_random_uuid(), auth.uid(), 'premium 2');
  if (select count(*) from public.subscriptions) <> 1 then raise exception 'alice cannot read own subscription'; end if;
end $$;

reset role;
update public.subscriptions set status = 'expired', expires_at = now() - interval '1 day';
set role authenticated;
do $$
begin
  if public.is_premium(auth.uid()) then raise exception 'expired still premium'; end if;
  -- existing templates are kept after lapse
  if (select count(*) from public.meal_templates where deleted_at is null) <> 2 then
    raise exception 'templates must not be deleted on lapse';
  end if;
  begin
    insert into public.meal_templates (id, user_id, name) values (gen_random_uuid(), auth.uid(), '3');
    raise exception 'FAIL: template allowed after lapse';
  exception when raise_exception then
    if sqlerrm not like 'free plan limit reached%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion cascades all personal data
reset role;
delete from auth.users where id = :'alice';
do $$
begin
  if exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111') then raise exception 'profile survived'; end if;
  if (select count(*) from public.body_measurements) <> 0 then raise exception 'weights survived'; end if;
  if (select count(*) from public.meal_entries) + (select count(*) from public.meal_items) <> 0 then raise exception 'meals survived'; end if;
  if (select count(*) from public.food_favorites) + (select count(*) from public.custom_foods) <> 0 then raise exception 'foods survived'; end if;
  if (select count(*) from public.meal_templates) <> 0 then raise exception 'templates survived'; end if;
  if (select count(*) from public.subscriptions) <> 0 then raise exception 'subscription survived'; end if;
  if (select count(*) from public.food_master) <> 3 then raise exception 'food master must remain'; end if;
end $$;

\echo 'ALL DB TESTS PASSED'

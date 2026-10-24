-- Phase 4/5 tables as written by the sync engine (upsert by id / update own preferences).
\set erin '55555555-5555-5555-5555-555555555555'
\set frank '66666666-6666-6666-6666-666666666666'
insert into auth.users (id, email) values (:'erin', 'erin@example.com'), (:'frank', 'frank@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', :'erin', false);

insert into public.exercise_entries (id, user_id, exercise_type, name, performed_at, performed_on,
  time_zone, duration_min, kcal, kcal_is_estimated, mets)
values ('e1000000-0000-0000-0000-000000000001', :'erin', 'strength', '筋トレ', now(), current_date,
  'Asia/Tokyo', 45, 236, true, 5)
on conflict (id) do update set duration_min = excluded.duration_min;

insert into public.exercise_sets (id, user_id, exercise_entry_id, exercise_name, set_number, weight_kg, reps)
values ('e2000000-0000-0000-0000-000000000001', :'erin', 'e1000000-0000-0000-0000-000000000001', 'ベンチプレス', 1, 60, 10)
on conflict (id) do update set reps = excluded.reps;

-- preferences row was created by the signup trigger; the app only updates it
update public.user_preferences set include_exercise_in_budget = true where user_id = :'erin';

do $$
begin
  if (select count(*) from public.user_preferences) <> 1 then raise exception 'FAIL: preferences row visibility'; end if;
  if not (select include_exercise_in_budget from public.user_preferences) then raise exception 'FAIL: preference not updated'; end if;
  begin
    insert into public.exercise_entries (id, user_id, exercise_type, name, performed_at, performed_on, time_zone, duration_min)
    values (gen_random_uuid(), auth.uid(), 'yoga', 'x', now(), current_date, 'Asia/Tokyo', 10);
    raise exception 'FAIL: invalid exercise_type accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.exercise_sets (id, user_id, exercise_entry_id, exercise_name, set_number, reps)
    values (gen_random_uuid(), auth.uid(), 'e1000000-0000-0000-0000-000000000001', 'x', 2, 0);
    raise exception 'FAIL: 0 reps accepted';
  exception when check_violation then null;
  end;
end $$;

-- soft-deleted exercise cannot be resurrected
update public.exercise_entries set deleted_at = now() where id = 'e1000000-0000-0000-0000-000000000001';
insert into public.exercise_entries (id, user_id, exercise_type, name, performed_at, performed_on,
  time_zone, duration_min, deleted_at)
values ('e1000000-0000-0000-0000-000000000001', :'erin', 'strength', '筋トレ', now(), current_date, 'Asia/Tokyo', 50, null)
on conflict (id) do update set duration_min = excluded.duration_min, deleted_at = excluded.deleted_at;
do $$
begin
  if (select deleted_at from public.exercise_entries) is null then raise exception 'FAIL: exercise resurrected'; end if;
end $$;

-- frank cannot see or attach to erin's data
select set_config('request.jwt.claim.sub', :'frank', false);
do $$
begin
  if (select count(*) from public.exercise_entries) + (select count(*) from public.exercise_sets) <> 0 then
    raise exception 'FAIL: frank sees erin exercise';
  end if;
  update public.user_preferences set include_exercise_in_budget = true where user_id = '55555555-5555-5555-5555-555555555555';
  begin
    insert into public.exercise_sets (id, user_id, exercise_entry_id, exercise_name, set_number, reps)
    values (gen_random_uuid(), auth.uid(), 'e1000000-0000-0000-0000-000000000001', 'x', 1, 5);
    raise exception 'FAIL: frank attached a set to erin entry';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;
\echo 'EXERCISE/PREFERENCES TESTS PASSED'

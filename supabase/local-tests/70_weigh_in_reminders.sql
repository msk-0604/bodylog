-- Weigh-in push reminders: due computation per time zone (incl. DST), "already recorded" skip,
-- once per local day, retries, invalid tokens, multiple devices, account switch, privileges.
\set ivy  '99999999-0000-4000-8000-000000000001'
\set jun  '99999999-0000-4000-8000-000000000002'
\set ken  '99999999-0000-4000-8000-000000000003'
insert into auth.users (id, email) values
  (:'ivy', 'ivy@example.com'), (:'jun', 'jun@example.com'), (:'ken', 'ken@example.com');

-- ---------- app side (authenticated) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'ivy', false);
update public.user_preferences
   set weigh_in_reminder_enabled = true, weigh_in_reminder_time = '20:00', time_zone = 'Asia/Tokyo';
select public.register_push_token('device-ivy-phone', 'ExponentPushToken[ivy-phone]', 'ios');
select public.register_push_token('device-ivy-tablet', 'ExponentPushToken[ivy-tablet]', 'android');
do $$
begin
  begin
    perform public.register_push_token('device-bad-xx', 'not-a-token', 'ios');
    raise exception 'FAIL: malformed token accepted';
  exception when check_violation then null;
  end;
  begin
    update public.user_preferences set weigh_in_reminder_time = '07:03';
    raise exception 'FAIL: non 5-minute time accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_tokens (user_id, device_id, token, platform)
    values (auth.uid(), 'device-direct', 'ExponentPushToken[x]', 'ios');
    raise exception 'FAIL: direct insert into push_tokens';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.reminder_deliveries;
    raise exception 'FAIL: deliveries readable by users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_weigh_in_reminders(now());
    raise exception 'FAIL: users can run the scheduler';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.push_tokens) <> 2 then raise exception 'FAIL: own tokens not visible'; end if;
end $$;

select set_config('request.jwt.claim.sub', :'jun', false);
update public.user_preferences
   set weigh_in_reminder_enabled = true, weigh_in_reminder_time = '09:00', time_zone = 'America/New_York';
select public.register_push_token('device-jun-phone', 'ExponentPushToken[jun-phone]', 'android');
do $$ begin
  if (select count(*) from public.push_tokens) <> 1 then raise exception 'FAIL: token isolation'; end if;
end $$;

-- ken: reminder ON but no device → never claimed
select set_config('request.jwt.claim.sub', :'ken', false);
update public.user_preferences set weigh_in_reminder_enabled = true, weigh_in_reminder_time = '00:00';
reset role;

-- ---------- scheduler (service role) ----------
set role service_role;
do $$
declare
  ivy uuid := '99999999-0000-4000-8000-000000000001';
  jun uuid := '99999999-0000-4000-8000-000000000002';
  ken uuid := '99999999-0000-4000-8000-000000000003';
  r record;
  n integer;
  d uuid;
  tok uuid;
begin
  -- Oct 24 2026: Tokyo = UTC+9, New York = UTC-4 (EDT)
  -- 10:55Z = 19:55 Tokyo → before ivy's 20:00
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 10:55Z');
  if n <> 0 then raise exception 'FAIL: claimed before the reminder time (%)', n; end if;

  -- 11:05Z = 20:05 Tokyo → ivy due (no weight today) with both devices; jun is 07:05 in NY
  select * into r from public.claim_weigh_in_reminders('2026-10-24 11:05Z');
  if r.user_id is distinct from ivy or r.local_date <> '2026-10-24' then raise exception 'FAIL: ivy not due (%)', r; end if;
  if jsonb_array_length(r.tokens) <> 2 then raise exception 'FAIL: multi-device tokens %', r.tokens; end if;
  d := r.delivery_id;

  -- the next cron run (or a concurrent one) on the same local day claims nothing
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 11:10Z');
  if n <> 0 then raise exception 'FAIL: duplicate claim on the same local day'; end if;

  -- one device accepted, the other is gone → sent; the dead token is invalidated
  if public.record_weigh_in_results(d, jsonb_build_array(
       jsonb_build_object('token_id', r.tokens->0->>'id', 'status', 'ok', 'ticket_id', 'tk-1'),
       jsonb_build_object('token_id', r.tokens->1->>'id', 'status', 'error', 'error', 'DeviceNotRegistered')
     )) <> 'sent' then raise exception 'FAIL: delivery should be sent'; end if;
  if (select count(*) from public.push_tokens where user_id = ivy and invalidated_at is null) <> 1 then
    raise exception 'FAIL: DeviceNotRegistered token not invalidated';
  end if;

  -- jun: 12:00Z = 08:00 NY → not yet
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 12:00Z');
  if n <> 0 then raise exception 'FAIL: jun claimed before 09:00 NY'; end if;

  -- jun weighs in at 08:30 NY (same LOCAL date 2026-10-24) → not due at 09:05
  insert into public.body_measurements (id, user_id, weight_kg, measured_at, measured_on, time_zone)
  values ('99999999-1111-4000-8000-000000000001', jun, 70, '2026-10-24 12:30Z', '2026-10-24', 'America/New_York');
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 13:05Z');
  if n <> 0 then raise exception 'FAIL: notified although weight is recorded'; end if;

  -- the record is deleted → unrecorded again → due
  update public.body_measurements set deleted_at = now() where id = '99999999-1111-4000-8000-000000000001';
  select * into r from public.claim_weigh_in_reminders('2026-10-24 13:10Z');
  if r.user_id is distinct from jun then raise exception 'FAIL: not due after deleting the record'; end if;
  d := r.delivery_id;

  -- Expo unreachable → failed → retried after 5 min, at most 3 attempts in total
  perform public.fail_weigh_in_delivery(d, 'network: fetch failed');
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 13:12Z');
  if n <> 0 then raise exception 'FAIL: retried too early'; end if;
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 13:16Z');
  if n <> 1 then raise exception 'FAIL: failed delivery not retried'; end if;
  perform public.fail_weigh_in_delivery(d, 'http 503');
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 13:22Z');
  if n <> 1 then raise exception 'FAIL: third attempt'; end if;
  perform public.fail_weigh_in_delivery(d, 'http 503');
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-24 13:30Z');
  if n <> 0 then raise exception 'FAIL: more than 3 attempts'; end if;
  if (select attempts from public.reminder_deliveries where id = d) <> 3 then raise exception 'FAIL: attempts'; end if;

  -- Oct 25: ivy turns the reminder OFF → nothing
  update public.user_preferences set weigh_in_reminder_enabled = false where user_id = ivy;
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-25 11:05Z');
  if n <> 0 then raise exception 'FAIL: claimed while OFF'; end if;
  -- ON again with a later time (21:30 Tokyo) → not at 20:05, but at 21:35
  update public.user_preferences set weigh_in_reminder_enabled = true, weigh_in_reminder_time = '21:30' where user_id = ivy;
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-25 11:05Z');
  if n <> 0 then raise exception 'FAIL: old time still used'; end if;
  select * into r from public.claim_weigh_in_reminders('2026-10-25 12:35Z');
  if r.user_id is distinct from ivy or r.local_date <> '2026-10-25' then raise exception 'FAIL: new time not used'; end if;
  perform public.record_weigh_in_results(r.delivery_id, jsonb_build_array(
    jsonb_build_object('token_id', r.tokens->0->>'id', 'status', 'ok', 'ticket_id', 'tk-2')));

  -- jun on Oct 25: 17:00Z = 13:00 NY, 4 h after 09:00 → outside the 3 h window, not sent late
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-25 17:00Z');
  if n <> 0 then raise exception 'FAIL: sent outside the window'; end if;

  -- ivy moves to New York (the app saves the new zone): 11:05Z Oct 26 is 07:05 there
  update public.user_preferences set time_zone = 'America/New_York', weigh_in_reminder_time = '20:00' where user_id = ivy;
  select count(*) into n from public.claim_weigh_in_reminders('2026-10-26 11:05Z');
  if n <> 0 then raise exception 'FAIL: still using the old time zone'; end if;
  select * into r from public.claim_weigh_in_reminders('2026-10-27 00:05Z');  -- 20:05 Oct 26 in NY
  if r.user_id is distinct from ivy or r.local_date <> '2026-10-26' then raise exception 'FAIL: new zone (%)', r; end if;
  perform public.record_weigh_in_results(r.delivery_id, jsonb_build_array(
    jsonb_build_object('token_id', r.tokens->0->>'id', 'status', 'ok', 'ticket_id', 'tk-3')));

  -- DST end (NY, 2026-11-01): 01:30 happens twice → only one reminder
  update public.user_preferences set weigh_in_reminder_time = '01:30' where user_id = jun;
  select * into r from public.claim_weigh_in_reminders('2026-11-01 05:35Z');  -- 01:35 EDT
  if r.user_id is distinct from jun or r.local_date <> '2026-11-01' then raise exception 'FAIL: DST end first (%)', r; end if;
  perform public.record_weigh_in_results(r.delivery_id, jsonb_build_array(
    jsonb_build_object('token_id', r.tokens->0->>'id', 'status', 'ok', 'ticket_id', 'tk-4')));
  select count(*) into n from public.claim_weigh_in_reminders('2026-11-01 06:35Z');  -- 01:35 EST
  if n <> 0 then raise exception 'FAIL: sent twice in the repeated DST hour'; end if;

  -- DST start (NY, 2027-03-14): 02:30 does not exist → sent at the first run after the jump
  update public.user_preferences set weigh_in_reminder_time = '02:30' where user_id = jun;
  select * into r from public.claim_weigh_in_reminders('2027-03-14 07:05Z');  -- 03:05 EDT
  if r.user_id is distinct from jun or r.local_date <> '2027-03-14' then raise exception 'FAIL: DST start (%)', r; end if;

  -- a run that crashed after claiming (status stays "sending") is retried after 15 min
  select count(*) into n from public.claim_weigh_in_reminders('2027-03-14 07:15Z');
  if n <> 0 then raise exception 'FAIL: stuck delivery retried too early'; end if;
  select count(*) into n from public.claim_weigh_in_reminders('2027-03-14 07:25Z');
  if n <> 1 then raise exception 'FAIL: stuck delivery not retried'; end if;

  -- all devices gone → no_devices (final, not retried)
  select * into r from public.claim_weigh_in_reminders('2027-03-15 07:05Z');
  if r.user_id is distinct from jun then raise exception 'FAIL: jun 2027-03-15'; end if;
  if public.record_weigh_in_results(r.delivery_id, jsonb_build_array(
       jsonb_build_object('token_id', r.tokens->0->>'id', 'status', 'error', 'error', 'DeviceNotRegistered')
     )) <> 'no_devices' then raise exception 'FAIL: no_devices'; end if;
  select count(*) into n from public.claim_weigh_in_reminders('2027-03-15 07:30Z');
  if n <> 0 then raise exception 'FAIL: user without devices claimed'; end if;

  -- ken (no devices at all) was never claimed; an unknown time zone is ignored, not an error
  update public.user_preferences set time_zone = 'Mars/Olympus_Mons' where user_id = ken;
  perform public.claim_weigh_in_reminders('2026-10-24 15:05Z');
  if exists (select 1 from public.reminder_deliveries where user_id = ken) then raise exception 'FAIL: ken claimed'; end if;

  -- receipts: tickets older than 15 min are fetched; DeviceNotRegistered invalidates the token
  select token_id into tok from public.push_messages where ticket_id = 'tk-3';
  if not exists (select 1 from public.pending_push_receipts(now() + interval '20 minutes') where ticket_id = 'tk-3') then
    raise exception 'FAIL: pending receipts';
  end if;
  if exists (select 1 from public.pending_push_receipts(now()) ) then raise exception 'FAIL: receipts asked too early'; end if;
  perform public.record_push_receipts(jsonb_build_array(
    jsonb_build_object('ticket_id', 'tk-1', 'status', 'ok'),
    jsonb_build_object('ticket_id', 'tk-3', 'status', 'error', 'error', 'DeviceNotRegistered')));
  if (select invalidated_at from public.push_tokens where id = tok) is null then raise exception 'FAIL: receipt invalidation'; end if;
  if (select receipt_status from public.push_messages where ticket_id = 'tk-1') <> 'ok' then raise exception 'FAIL: receipt ok'; end if;
end $$;
reset role;

-- ---------- account switch on one device ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'ken', false);
-- jun signed out on this phone, ken signs in: the installation (and its token) moves to ken
select public.register_push_token('device-jun-phone', 'ExponentPushToken[jun-phone-2]', 'android');
select set_config('request.jwt.claim.sub', :'jun', false);
select public.unregister_push_token('device-jun-phone');  -- jun can't remove ken's device
do $$ begin
  if exists (select 1 from public.push_tokens) then raise exception 'FAIL: jun still owns the device'; end if;
end $$;
select set_config('request.jwt.claim.sub', :'ken', false);
do $$ begin
  if (select count(*) from public.push_tokens where invalidated_at is null) <> 1 then raise exception 'FAIL: ken device'; end if;
end $$;
-- sign-out on this device
select public.unregister_push_token('device-jun-phone');
do $$ begin
  if exists (select 1 from public.push_tokens) then raise exception 'FAIL: unregister'; end if;
end $$;
reset role;

-- re-registering the same token from a reinstall (new device id) keeps one row
set role authenticated;
select set_config('request.jwt.claim.sub', :'ivy', false);
select public.register_push_token('device-ivy-phone-reinstall', 'ExponentPushToken[ivy-phone]', 'ios');
reset role;
do $$ begin
  if (select count(*) from public.push_tokens where token = 'ExponentPushToken[ivy-phone]') <> 1 then
    raise exception 'FAIL: duplicate token rows after reinstall';
  end if;
end $$;

-- account deletion removes tokens and history
delete from auth.users where id = '99999999-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.push_tokens where user_id = '99999999-0000-4000-8000-000000000001')
     or exists (select 1 from public.reminder_deliveries where user_id = '99999999-0000-4000-8000-000000000001') then
    raise exception 'FAIL: data kept after account deletion';
  end if;
end $$;

\echo 'WEIGH-IN REMINDER TESTS PASSED'

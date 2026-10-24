-- Weigh-in reminder via server push (Expo Push Notifications).
--
-- Every few minutes the Edge Function `weigh-in-reminders` (started by pg_cron, see
-- supabase/manual/schedule_weigh_in_reminders.sql) calls claim_weigh_in_reminders(): users whose
-- reminder time has passed in THEIR time zone, who have NO weight record for that local date,
-- and who have at least one valid push token, get one delivery row per local date
-- (idempotency key: user_id + kind + local_date). Results and Expo receipts are stored per
-- device; tokens Expo reports as DeviceNotRegistered are invalidated.

-- ---------------------------------------------------------------------------
-- Settings (synced between the user's devices through user_preferences)
-- ---------------------------------------------------------------------------
alter table public.user_preferences
  add column weigh_in_reminder_enabled boolean not null default false,
  -- local wall-clock time "HH:MM" in 5-minute steps
  add column weigh_in_reminder_time text not null default '07:00'
    check (weigh_in_reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][05]$'),
  -- IANA zone of the device that last saved the settings (e.g. Asia/Tokyo)
  add column time_zone text not null default 'Asia/Tokyo'
    check (char_length(time_zone) between 1 and 64);

-- ---------------------------------------------------------------------------
-- Push tokens: one row per app installation (device_id), owned by the signed-in user
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 128),
  token text not null check (token ~ '^Expo(nent)?PushToken\[[^]]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  invalidated_at timestamptz,
  invalid_reason text,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index push_tokens_device on public.push_tokens (device_id);
create unique index push_tokens_token on public.push_tokens (token);
create index push_tokens_user on public.push_tokens (user_id) where invalidated_at is null;

create trigger set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Send history (server only)
-- ---------------------------------------------------------------------------
create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'weigh_in' check (kind in ('weigh_in')),
  local_date date not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'no_devices')),
  attempts integer not null default 1,
  -- scheduler clock of the latest claim (retry timing uses this, not the row's updated_at)
  last_attempt_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, local_date)
);

create trigger set_updated_at before update on public.reminder_deliveries
  for each row execute function public.set_updated_at();

-- One row per device per attempt. "ticket" = Expo accepted the message; "receipt" = Expo's
-- later report from APNs/FCM. Neither proves the OS actually displayed it (Focus modes, Doze,
-- user settings): that is only observable on the device.
create table public.push_messages (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.reminder_deliveries (id) on delete cascade,
  token_id uuid references public.push_tokens (id) on delete set null,
  ticket_id text,
  ticket_status text not null check (ticket_status in ('ok', 'error')),
  ticket_error text,
  receipt_status text check (receipt_status in ('ok', 'error')),
  receipt_error text,
  receipt_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_messages_pending_receipt on public.push_messages (created_at)
  where ticket_id is not null and receipt_checked_at is null;

alter table public.push_tokens enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.push_messages enable row level security;

-- Users may see their own registered devices; all writes go through the RPCs below.
create policy push_tokens_select on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.push_tokens from authenticated;
revoke all on public.push_tokens, public.reminder_deliveries, public.push_messages from anon;
revoke all on public.reminder_deliveries, public.push_messages from authenticated;

-- ---------------------------------------------------------------------------
-- App RPCs (authenticated)
-- ---------------------------------------------------------------------------

-- Registers this installation's Expo push token for the signed-in user. Re-registering moves the
-- installation (and its token) to the current user, so after an account switch on the same
-- device the previous account no longer receives reminders there.
create or replace function public.register_push_token(p_device_id text, p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- the same token can't stay on another installation row (reinstall → new device id)
  delete from public.push_tokens where token = p_token and device_id <> p_device_id;
  insert into public.push_tokens (user_id, device_id, token, platform)
  values (uid, p_device_id, p_token, p_platform)
  on conflict (device_id) do update set
    user_id = excluded.user_id,
    token = excluded.token,
    platform = excluded.platform,
    invalidated_at = null,
    invalid_reason = null,
    last_registered_at = now();
end;
$$;

-- Sign-out / reminder OFF on this device: the installation stops receiving this user's pushes.
create or replace function public.unregister_push_token(p_device_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where device_id = p_device_id and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Scheduler RPCs (service role only)
-- ---------------------------------------------------------------------------

-- Claims the deliveries due at p_now. Atomic and idempotent: concurrent or repeated runs never
-- claim the same (user, local date) twice; failed or stuck attempts are retried a few times
-- inside the window. Wall-clock arithmetic happens in each user's zone, so DST gaps/overlaps
-- only shift a reminder to the next run and the unique key prevents a second send.
create or replace function public.claim_weigh_in_reminders(
  p_now timestamptz default now(),
  p_limit integer default 500,
  p_window interval default interval '3 hours',
  p_max_attempts integer default 3,
  p_retry_after interval default interval '5 minutes',
  p_stuck_after interval default interval '15 minutes'
)
returns table (delivery_id uuid, user_id uuid, local_date date, tokens jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with prefs as (
    select p.user_id,
           (p_now at time zone p.time_zone) as local_now,
           p.weigh_in_reminder_time::time as at_time
    from public.user_preferences p
    join pg_catalog.pg_timezone_names z on z.name = p.time_zone  -- ignore unknown zones
    where p.weigh_in_reminder_enabled
  ),
  due as (
    select pr.user_id, pr.local_now::date as d
    from prefs pr
    where pr.local_now >= pr.local_now::date + pr.at_time
      and pr.local_now < pr.local_now::date + pr.at_time + p_window
      and not exists (
        select 1 from public.body_measurements b
        where b.user_id = pr.user_id and b.deleted_at is null and b.measured_on = pr.local_now::date
      )
      and exists (
        select 1 from public.push_tokens t
        where t.user_id = pr.user_id and t.invalidated_at is null
      )
    order by pr.user_id
    limit p_limit
  ),
  claimed as (
    insert into public.reminder_deliveries as rd (user_id, kind, local_date, status, last_attempt_at)
    select due.user_id, 'weigh_in', due.d, 'sending', p_now from due
    on conflict on constraint reminder_deliveries_user_id_kind_local_date_key do update
      set status = 'sending', attempts = rd.attempts + 1, last_error = null, last_attempt_at = p_now
      where rd.attempts < p_max_attempts
        and (
          (rd.status = 'failed' and rd.last_attempt_at <= p_now - p_retry_after)
          or (rd.status = 'sending' and rd.last_attempt_at <= p_now - p_stuck_after)
        )
    returning rd.id, rd.user_id, rd.local_date
  )
  select c.id, c.user_id, c.local_date,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform)
                            order by t.created_at)
           from public.push_tokens t
           where t.user_id = c.user_id and t.invalidated_at is null
         ), '[]'::jsonb)
  from claimed c;
end;
$$;

-- Stores Expo's per-device tickets for one delivery.
-- p_results: [{ "token_id": uuid, "status": "ok"|"error", "ticket_id": text?, "error": text? }]
create or replace function public.record_weigh_in_results(p_delivery_id uuid, p_results jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ok_count integer;
  gone_count integer;
  total integer;
  final_status text;
begin
  insert into public.push_messages (delivery_id, token_id, ticket_id, ticket_status, ticket_error)
  select p_delivery_id, (r->>'token_id')::uuid, r->>'ticket_id', r->>'status', r->>'error'
  from jsonb_array_elements(p_results) r;

  update public.push_tokens t
     set invalidated_at = now(), invalid_reason = 'DeviceNotRegistered'
   where t.id in (
     select (r->>'token_id')::uuid from jsonb_array_elements(p_results) r
     where r->>'error' = 'DeviceNotRegistered'
   );

  select count(*) filter (where r->>'status' = 'ok'),
         count(*) filter (where r->>'error' = 'DeviceNotRegistered'),
         count(*)
    into ok_count, gone_count, total
  from jsonb_array_elements(p_results) r;

  final_status := case
    when ok_count > 0 then 'sent'
    when total = 0 or gone_count = total then 'no_devices'  -- nothing left to retry
    else 'failed'
  end;
  update public.reminder_deliveries
     set status = final_status,
         last_error = case when final_status = 'sent' then null
                           else (select string_agg(distinct r->>'error', ',')
                                 from jsonb_array_elements(p_results) r where r->>'status' = 'error') end
   where id = p_delivery_id;
  return final_status;
end;
$$;

-- The whole request to Expo failed (network, 5xx, rate limit): retried by a later run.
create or replace function public.fail_weigh_in_delivery(p_delivery_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.reminder_deliveries set status = 'failed', last_error = left(p_error, 200)
  where id = p_delivery_id and status = 'sending';
$$;

-- Tickets whose receipts can be fetched (Expo keeps receipts ~24 h; ask after ~15 min).
create or replace function public.pending_push_receipts(
  p_now timestamptz default now(),
  p_min_age interval default interval '15 minutes',
  p_limit integer default 1000
)
returns table (ticket_id text)
language sql
security definer
set search_path = ''
as $$
  select m.ticket_id from public.push_messages m
  where m.ticket_id is not null and m.receipt_checked_at is null
    and m.created_at < p_now - p_min_age and m.created_at > p_now - interval '23 hours'
  order by m.created_at
  limit p_limit;
$$;

-- p_receipts: [{ "ticket_id": text, "status": "ok"|"error", "error": text? }]
create or replace function public.record_push_receipts(p_receipts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_messages m
     set receipt_status = r->>'status', receipt_error = r->>'error', receipt_checked_at = now()
    from jsonb_array_elements(p_receipts) r
   where m.ticket_id = r->>'ticket_id';

  update public.push_tokens t
     set invalidated_at = now(), invalid_reason = 'DeviceNotRegistered'
   where t.id in (
     select m.token_id from public.push_messages m
     join jsonb_array_elements(p_receipts) r on m.ticket_id = r->>'ticket_id'
     where r->>'error' = 'DeviceNotRegistered'
   );
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

revoke all on function public.claim_weigh_in_reminders(timestamptz, integer, interval, integer, interval, interval)
  from public, anon, authenticated;
revoke all on function public.record_weigh_in_results(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_weigh_in_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.pending_push_receipts(timestamptz, interval, integer) from public, anon, authenticated;
revoke all on function public.record_push_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.claim_weigh_in_reminders(timestamptz, integer, interval, integer, interval, interval)
  to service_role;
grant execute on function public.record_weigh_in_results(uuid, jsonb) to service_role;
grant execute on function public.fail_weigh_in_delivery(uuid, text) to service_role;
grant execute on function public.pending_push_receipts(timestamptz, interval, integer) to service_role;
grant execute on function public.record_push_receipts(jsonb) to service_role;

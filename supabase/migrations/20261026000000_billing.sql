-- Phase 6: server-side subscription state written by the RevenueCat webhook and the
-- subscription-sync Edge Function (service role only). The app only reads public.subscriptions.

-- Applies a subscription state for a user. Out-of-order deliveries are ignored: a state is
-- applied only if p_event_at is not older than the last applied one. Returns true if applied.
create or replace function public.apply_subscription_state(
  p_user_id uuid,
  p_status text,
  p_store text,
  p_product_id text,
  p_period_type text,
  p_expires_at timestamptz,
  p_will_renew boolean,
  p_event_id text,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  applied boolean;
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return false; -- unknown or deleted user (e.g. an anonymous RevenueCat id)
  end if;
  -- "never subscribed" results do not create a row
  if p_status = 'expired' and p_product_id is null
     and not exists (select 1 from public.subscriptions s where s.user_id = p_user_id) then
    return false;
  end if;

  insert into public.subscriptions as s (
    user_id, entitlement, status, store, product_id, period_type, expires_at, will_renew,
    last_event_id, last_event_at
  ) values (
    p_user_id, 'premium', p_status, p_store, p_product_id, p_period_type, p_expires_at,
    coalesce(p_will_renew, false), p_event_id, p_event_at
  )
  on conflict (user_id) do update set
    status = excluded.status,
    store = coalesce(excluded.store, s.store),
    product_id = coalesce(excluded.product_id, s.product_id),
    period_type = coalesce(excluded.period_type, s.period_type),
    expires_at = excluded.expires_at,
    will_renew = excluded.will_renew,
    last_event_id = excluded.last_event_id,
    last_event_at = excluded.last_event_at
  where s.last_event_at is null or excluded.last_event_at >= s.last_event_at
  returning true into applied;

  return coalesce(applied, false);
end;
$$;

-- Stores a raw webhook event once. Returns 'new', 'retry' (stored before but not finished)
-- or 'duplicate' (already processed).
create or replace function public.record_subscription_event(
  p_id text,
  p_user_id uuid,
  p_event_type text,
  p_event_at timestamptz,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing timestamptz;
  found_row boolean;
begin
  select true, e.processed_at into found_row, existing
    from public.subscription_events e where e.id = p_id;
  if found_row then
    return case when existing is null then 'retry' else 'duplicate' end;
  end if;
  insert into public.subscription_events (id, user_id, event_type, event_at, payload)
  values (
    p_id,
    case when exists (select 1 from auth.users u where u.id = p_user_id) then p_user_id end,
    p_event_type, p_event_at, p_payload
  )
  on conflict (id) do nothing;
  return 'new';
end;
$$;

create or replace function public.finish_subscription_event(p_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.subscription_events set processed_at = now() where id = p_id;
$$;

revoke all on function public.apply_subscription_state(uuid, text, text, text, text, timestamptz, boolean, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_subscription_event(text, uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_subscription_event(text) from public, anon, authenticated;
grant execute on function public.apply_subscription_state(uuid, text, text, text, text, timestamptz, boolean, text, timestamptz)
  to service_role;
grant execute on function public.record_subscription_event(text, uuid, text, timestamptz, jsonb)
  to service_role;
grant execute on function public.finish_subscription_event(text) to service_role;

-- Lifetime / promotional grants without an end date are stored as expires_at = 'infinity'
-- ('infinity' > now() is true, so public.is_premium() already treats them as active).

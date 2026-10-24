-- Phase 6: subscription state functions (service role only), ordering, idempotent events,
-- is_premium transitions and user isolation.
\set gina '77777777-7777-7777-7777-777777777777'
\set hiro '88888888-8888-8888-8888-888888888888'
insert into auth.users (id, email) values (:'gina', 'gina@example.com'), (:'hiro', 'hiro@example.com');

-- 1) app users cannot call the writer functions or write subscriptions directly
set role authenticated;
select set_config('request.jwt.claim.sub', :'gina', false);
do $$
begin
  begin
    perform public.apply_subscription_state(auth.uid(), 'active', 'app_store', 'p', 'normal',
      now() + interval '30 days', true, 'x', now());
    raise exception 'FAIL: authenticated can apply subscription state';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_subscription_event('x', auth.uid(), 'TEST', now(), '{}'::jsonb);
    raise exception 'FAIL: authenticated can record events';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.subscriptions (user_id, status, expires_at)
    values (auth.uid(), 'active', now() + interval '1 year');
    raise exception 'FAIL: authenticated can insert subscriptions';
  exception when insufficient_privilege then null;
  end;
  -- is_premium is internal (service role / triggers); users read public.subscriptions instead
  begin
    perform public.is_premium(auth.uid());
    raise exception 'FAIL: authenticated can call is_premium';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform public.apply_subscription_state('77777777-7777-7777-7777-777777777777', 'active',
      null, 'p', null, now() + interval '1 day', true, 'x', now());
    raise exception 'FAIL: anon can apply subscription state';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 2) service role: purchase → cancel (still premium until expiry) → expire; ordering guard
set role service_role;
do $$
declare
  g uuid := '77777777-7777-7777-7777-777777777777';
begin
  -- never subscribed → no row is created
  if public.apply_subscription_state(g, 'expired', null, null, null, null, false, 'sync:0', now() - interval '1 hour') then
    raise exception 'FAIL: expired row created for a user who never subscribed';
  end if;
  if exists (select 1 from public.subscriptions where user_id = g) then raise exception 'FAIL: row exists'; end if;

  if not public.apply_subscription_state(g, 'active', 'app_store', 'jp.bodylog.premium.monthly', 'normal',
      now() + interval '30 days', true, 'ev1', now() - interval '10 minutes') then
    raise exception 'FAIL: initial purchase not applied';
  end if;
  if not public.is_premium(g) then raise exception 'FAIL: not premium after purchase'; end if;

  -- an older event delivered late must not overwrite newer state
  if public.apply_subscription_state(g, 'expired', 'app_store', 'jp.bodylog.premium.monthly', 'normal',
      now() - interval '1 day', false, 'ev0', now() - interval '20 minutes') then
    raise exception 'FAIL: out-of-order event applied';
  end if;
  if not public.is_premium(g) then raise exception 'FAIL: premium lost by stale event'; end if;

  -- cancellation keeps access until the period ends
  perform public.apply_subscription_state(g, 'cancelled', 'app_store', null, null,
      now() + interval '30 days', false, 'ev2', now() - interval '5 minutes');
  if not public.is_premium(g) then raise exception 'FAIL: cancelled lost access before expiry'; end if;
  if (select will_renew from public.subscriptions where user_id = g) then raise exception 'FAIL: will_renew'; end if;
  if (select product_id from public.subscriptions where user_id = g) is distinct from 'jp.bodylog.premium.monthly' then
    raise exception 'FAIL: product_id lost on partial update';
  end if;

  -- billing issue in grace period keeps access
  perform public.apply_subscription_state(g, 'billing_issue', 'app_store', null, null,
      now() + interval '3 days', true, 'ev3', now() - interval '4 minutes');
  if not public.is_premium(g) then raise exception 'FAIL: grace period'; end if;

  -- expiration removes access
  perform public.apply_subscription_state(g, 'expired', 'app_store', null, null,
      now() - interval '1 minute', false, 'ev4', now() - interval '3 minutes');
  if public.is_premium(g) then raise exception 'FAIL: premium after expiration'; end if;

  -- resubscribe, then refund removes access immediately
  perform public.apply_subscription_state(g, 'active', 'app_store', null, null,
      now() + interval '30 days', true, 'ev5', now() - interval '2 minutes');
  if not public.is_premium(g) then raise exception 'FAIL: resubscribe'; end if;
  perform public.apply_subscription_state(g, 'refunded', 'app_store', null, null,
      now() + interval '30 days', false, 'ev6', now() - interval '1 minute');
  if public.is_premium(g) then raise exception 'FAIL: premium after refund'; end if;

  -- lifetime / promotional grant without an end date
  perform public.apply_subscription_state(g, 'active', 'promotional', 'rc_promo_premium_lifetime', null,
      'infinity', false, 'ev7', now());
  if not public.is_premium(g) then raise exception 'FAIL: infinity grant'; end if;

  -- unknown users (anonymous RevenueCat ids are filtered before; deleted users here) are ignored
  if public.apply_subscription_state('99999999-9999-9999-9999-999999999999', 'active', null, 'p', null,
      now() + interval '1 day', true, 'ev8', now()) then
    raise exception 'FAIL: unknown user applied';
  end if;

  -- events: stored once; unfinished events can be retried; finished ones are duplicates
  if public.record_subscription_event('rc-1', g, 'INITIAL_PURCHASE', now(), '{"a":1}') <> 'new' then
    raise exception 'FAIL: new event';
  end if;
  if public.record_subscription_event('rc-1', g, 'INITIAL_PURCHASE', now(), '{"a":1}') <> 'retry' then
    raise exception 'FAIL: unfinished event should be retried';
  end if;
  perform public.finish_subscription_event('rc-1');
  if public.record_subscription_event('rc-1', g, 'INITIAL_PURCHASE', now(), '{"a":1}') <> 'duplicate' then
    raise exception 'FAIL: duplicate event';
  end if;
  if (select count(*) from public.subscription_events where id = 'rc-1') <> 1 then raise exception 'FAIL: event count'; end if;
  -- an event for an unknown user is kept for auditing without a user id
  perform public.record_subscription_event('rc-2', '99999999-9999-9999-9999-999999999999', 'TEST', now(), '{}');
  if (select user_id from public.subscription_events where id = 'rc-2') is not null then raise exception 'FAIL: unknown user id kept'; end if;
end $$;
reset role;

-- 3) users see only their own subscription and never the raw events
set role authenticated;
select set_config('request.jwt.claim.sub', :'hiro', false);
do $$
begin
  if exists (select 1 from public.subscriptions) then raise exception 'FAIL: other user subscription visible'; end if;
  begin
    perform 1 from public.subscription_events;
    raise exception 'FAIL: events readable';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', :'gina', false);
do $$
begin
  if (select count(*) from public.subscriptions) <> 1 then raise exception 'FAIL: own subscription not visible'; end if;
  begin
    update public.subscriptions set status = 'active', expires_at = 'infinity';
    raise exception 'FAIL: user can update own subscription';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 4) account deletion removes the subscription row and detaches events
delete from auth.users where id = :'gina';
do $$
begin
  if exists (select 1 from public.subscriptions where user_id = '77777777-7777-7777-7777-777777777777') then
    raise exception 'FAIL: subscription kept after account deletion';
  end if;
  if (select user_id from public.subscription_events where id = 'rc-1') is not null then
    raise exception 'FAIL: event still linked to deleted user';
  end if;
end $$;

\echo 'BILLING TESTS PASSED'

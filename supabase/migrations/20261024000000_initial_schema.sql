-- BODYLOG initial schema
-- See docs/DATABASE.md for the design rationale.
--
-- Conventions
-- * UUID primary keys. User-generated rows use client-generated UUIDs so offline
--   records can be upserted idempotently (same id = same record).
-- * All user-owned tables carry user_id and have RLS enabled: users can only
--   access their own rows. Child tables use a composite FK (parent_id, user_id)
--   so a child can never point to another user's parent.
-- * Records that are synced from devices use soft delete (deleted_at) so the
--   deletion itself can be synced (tombstone). Hard purge runs on account deletion.
-- * Local calendar date (`*_on`) is stored next to the instant (`*_at`) and the
--   IANA time zone at recording time, so daily totals never shift when the user travels.
-- * Unknown nutrient values are NULL — never 0.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles & preferences
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (char_length(nickname) <= 20),
  height_cm numeric(4, 1) check (height_cm between 80 and 250),
  birth_date date check (birth_date between date '1900-01-01' and current_date),
  sex text check (sex in ('male', 'female', 'unspecified')),
  activity_level text check (activity_level in ('low', 'moderate', 'high')),
  time_zone text not null default 'Asia/Tokyo' check (char_length(time_zone) between 1 and 64),
  terms_version text,
  terms_accepted_at timestamptz,
  privacy_version text,
  privacy_accepted_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Add exercise kcal to the day's budget (net METs are used to avoid double counting).
  include_exercise_in_budget boolean not null default false,
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Goal history: the goal in effect on a date is the row with the latest
-- effective_from <= that date. Editing a goal inserts/updates the row for "today",
-- so past analyses keep using the goals that applied at that time.
create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null,
  goal_type text not null default 'lose' check (goal_type in ('lose', 'maintain', 'gain')),
  calorie_kcal integer not null check (calorie_kcal between 500 and 10000),
  protein_g numeric(5, 1) check (protein_g between 0 and 1000),
  fat_g numeric(5, 1) check (fat_g between 0 and 1000),
  carbohydrate_g numeric(5, 1) check (carbohydrate_g between 0 and 2000),
  start_weight_kg numeric(4, 1) check (start_weight_kg between 20 and 300),
  target_weight_kg numeric(4, 1) check (target_weight_kg between 20 and 300),
  exercise_minutes_per_week integer check (exercise_minutes_per_week between 0 and 10080),
  -- How the calorie goal was produced; 'estimate' values must be shown as 推定.
  calorie_source text not null default 'manual' check (calorie_source in ('manual', 'estimate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Body measurements
-- ---------------------------------------------------------------------------

create table public.body_measurements (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric(4, 1) not null check (weight_kg between 20 and 300),
  body_fat_pct numeric(3, 1) check (body_fat_pct between 1 and 75),
  measured_at timestamptz not null,
  measured_on date not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index body_measurements_user_time_idx
  on public.body_measurements (user_id, measured_at desc)
  where deleted_at is null;
create index body_measurements_user_updated_idx on public.body_measurements (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Foods
-- ---------------------------------------------------------------------------

-- 日本食品標準成分表 based master. Values per 100 g of edible portion.
-- Read-only for app users; written by the import script with the service role.
create table public.food_master (
  id uuid primary key default gen_random_uuid(),
  food_code text not null,
  name text not null check (char_length(name) between 1 and 200),
  -- normalizeForSearch(name + aliases); same function as the app (src/domain/searchNormalize.ts)
  search_text text not null,
  category_code text not null,
  category_name text not null,
  energy_kcal numeric(6, 1) check (energy_kcal >= 0),
  protein_g numeric(6, 2) check (protein_g >= 0),
  fat_g numeric(6, 2) check (fat_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g >= 0),
  -- Per-nutrient qualifiers from the source table, e.g. {"fat_g": "trace"}.
  -- Values: "trace" (Tr), "estimated" (推定値/括弧付き), "missing" (-), "zero_estimated" ((0)).
  value_flags jsonb not null default '{}'::jsonb,
  source text not null,
  source_version text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_version, food_code)
);

create index food_master_search_trgm_idx
  on public.food_master using gin (search_text extensions.gin_trgm_ops)
  where is_active;
create index food_master_category_idx on public.food_master (category_code) where is_active;

-- Known serving weights (e.g. 卵 1個 = 50 g). Only verified values are stored;
-- unknown servings are never guessed.
create table public.food_serving_units (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_master (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 20),
  grams numeric(6, 1) not null check (grams > 0 and grams <= 5000),
  source text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id, label)
);

create table public.custom_foods (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  search_text text not null,
  energy_kcal numeric(6, 1) check (energy_kcal >= 0),
  protein_g numeric(6, 2) check (protein_g >= 0),
  fat_g numeric(6, 2) check (fat_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g >= 0),
  serving_label text check (char_length(serving_label) between 1 and 20),
  serving_grams numeric(6, 1) check (serving_grams > 0 and serving_grams <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  check ((serving_label is null) = (serving_grams is null))
);

create index custom_foods_user_idx on public.custom_foods (user_id, updated_at);
create index custom_foods_search_trgm_idx
  on public.custom_foods using gin (search_text extensions.gin_trgm_ops)
  where deleted_at is null;

create table public.food_favorites (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid references public.food_master (id) on delete cascade,
  custom_food_id uuid,
  default_grams numeric(6, 1) check (default_grams > 0 and default_grams <= 5000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (num_nonnulls(food_id, custom_food_id) = 1),
  foreign key (custom_food_id, user_id) references public.custom_foods (id, user_id) on delete cascade
);

create unique index food_favorites_user_food_uniq
  on public.food_favorites (user_id, food_id) where deleted_at is null and food_id is not null;
create unique index food_favorites_user_custom_uniq
  on public.food_favorites (user_id, custom_food_id) where deleted_at is null and custom_food_id is not null;
create index food_favorites_user_idx on public.food_favorites (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- Meals
-- ---------------------------------------------------------------------------

create table public.meal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  eaten_on date not null,
  eaten_at timestamptz not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create index meal_entries_user_day_idx
  on public.meal_entries (user_id, eaten_on) where deleted_at is null;
create index meal_entries_user_updated_idx on public.meal_entries (user_id, updated_at);

-- Nutrient values are a SNAPSHOT taken when the item was logged, so later
-- food master corrections never change past records.
create table public.meal_items (
  id uuid primary key,
  user_id uuid not null,
  meal_entry_id uuid not null,
  food_id uuid references public.food_master (id) on delete set null,
  custom_food_id uuid,
  food_name text not null check (char_length(food_name) between 1 and 200),
  food_code text,
  quantity numeric(7, 2) check (quantity > 0),
  unit_label text check (char_length(unit_label) <= 20),
  grams numeric(6, 1) not null check (grams > 0 and grams <= 5000),
  energy_kcal numeric(7, 1) check (energy_kcal >= 0),
  protein_g numeric(6, 1) check (protein_g >= 0),
  fat_g numeric(6, 1) check (fat_g >= 0),
  carbohydrate_g numeric(6, 1) check (carbohydrate_g >= 0),
  nutrient_source_version text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (meal_entry_id, user_id) references public.meal_entries (id, user_id) on delete cascade,
  foreign key (custom_food_id, user_id) references public.custom_foods (id, user_id)
);

create index meal_items_entry_idx on public.meal_items (meal_entry_id);
create index meal_items_user_updated_idx on public.meal_items (user_id, updated_at);
-- "最近使った食品"
create index meal_items_user_recent_idx
  on public.meal_items (user_id, created_at desc) where deleted_at is null;

create table public.meal_templates (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  default_meal_type text check (default_meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create index meal_templates_user_idx on public.meal_templates (user_id, sort_order);

create table public.meal_template_items (
  id uuid primary key,
  user_id uuid not null,
  template_id uuid not null,
  food_id uuid references public.food_master (id) on delete set null,
  custom_food_id uuid,
  food_name text not null check (char_length(food_name) between 1 and 200),
  quantity numeric(7, 2) check (quantity > 0),
  unit_label text check (char_length(unit_label) <= 20),
  grams numeric(6, 1) not null check (grams > 0 and grams <= 5000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (template_id, user_id) references public.meal_templates (id, user_id) on delete cascade,
  foreign key (custom_food_id, user_id) references public.custom_foods (id, user_id)
);

create index meal_template_items_template_idx on public.meal_template_items (template_id);

-- ---------------------------------------------------------------------------
-- Exercise
-- ---------------------------------------------------------------------------

create table public.exercise_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_type text not null
    check (exercise_type in ('walking', 'running', 'cycling', 'strength', 'swimming', 'other')),
  name text not null check (char_length(name) between 1 and 60),
  performed_at timestamptz not null,
  performed_on date not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  duration_min integer not null check (duration_min between 1 and 1440),
  kcal numeric(6, 1) check (kcal >= 0 and kcal <= 10000),
  kcal_is_estimated boolean not null default false,
  mets numeric(4, 1) check (mets > 0 and mets <= 25),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create index exercise_entries_user_day_idx
  on public.exercise_entries (user_id, performed_on) where deleted_at is null;
create index exercise_entries_user_updated_idx on public.exercise_entries (user_id, updated_at);

create table public.exercise_sets (
  id uuid primary key,
  user_id uuid not null,
  exercise_entry_id uuid not null,
  exercise_name text not null check (char_length(exercise_name) between 1 and 60),
  set_number smallint not null check (set_number between 1 and 100),
  weight_kg numeric(5, 1) check (weight_kg between 0 and 1000),
  reps smallint check (reps between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (exercise_entry_id, user_id) references public.exercise_entries (id, user_id) on delete cascade
);

create index exercise_sets_entry_idx on public.exercise_sets (exercise_entry_id);

-- ---------------------------------------------------------------------------
-- Subscriptions (written ONLY by the server: RevenueCat webhook Edge Function)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entitlement text not null default 'premium',
  status text not null
    check (status in ('active', 'cancelled', 'billing_issue', 'expired', 'refunded', 'paused')),
  store text check (store in ('app_store', 'play_store', 'promotional', 'test_store')),
  product_id text,
  period_type text,
  expires_at timestamptz,
  will_renew boolean not null default false,
  last_event_id text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Raw webhook events, keyed by RevenueCat event id for idempotency (duplicates are ignored).
create table public.subscription_events (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index subscription_events_user_idx on public.subscription_events (user_id, event_at);

-- ---------------------------------------------------------------------------
-- Notifications (local notifications; settings synced so they survive reinstall)
-- ---------------------------------------------------------------------------

create table public.notification_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weigh_in', 'breakfast', 'lunch', 'dinner', 'daily_review')),
  enabled boolean not null default false,
  local_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_preferences', 'nutrition_goals', 'body_measurements', 'food_master',
    'food_serving_units', 'custom_foods', 'food_favorites', 'meal_entries', 'meal_items',
    'meal_templates', 'meal_template_items', 'exercise_entries', 'exercise_sets',
    'subscriptions', 'notification_settings'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Premium check & free-plan limits (enforced server-side, not only in the app)
-- ---------------------------------------------------------------------------

create or replace function public.is_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.entitlement = 'premium'
      and s.status not in ('expired', 'refunded', 'paused')
      and s.expires_at > now()
  );
$$;

revoke all on function public.is_premium(uuid) from public;
grant execute on function public.is_premium(uuid) to authenticated, service_role;

create or replace function public.enforce_free_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_count integer;
begin
  -- Only check when a row becomes active (insert, or un-delete).
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return new;
  end if;
  if public.is_premium(new.user_id) then
    return new;
  end if;

  -- Serialize concurrent inserts for the same user.
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

create trigger food_favorites_free_limit
  before insert or update of deleted_at on public.food_favorites
  for each row execute function public.enforce_free_plan_limit('10');

create trigger meal_templates_free_limit
  before insert or update of deleted_at on public.meal_templates
  for each row execute function public.enforce_free_plan_limit('1');

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Food search
-- ---------------------------------------------------------------------------

-- p_query must already be normalized with normalizeForSearch() on the client.
create or replace function public.search_foods(
  p_query text,
  p_category_code text default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  food_code text,
  name text,
  category_code text,
  category_name text,
  energy_kcal numeric,
  protein_g numeric,
  fat_g numeric,
  carbohydrate_g numeric,
  value_flags jsonb,
  source_version text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(coalesce(p_query, ''), '\', '\\'), '%', '\%'), '_', '\_') as esc
  )
  select f.id, f.food_code, f.name, f.category_code, f.category_name,
         f.energy_kcal, f.protein_g, f.fat_g, f.carbohydrate_g, f.value_flags, f.source_version
  from public.food_master f, q
  where f.is_active
    and char_length(q.esc) > 0
    and f.search_text like '%' || q.esc || '%'
    and (p_category_code is null or f.category_code = p_category_code)
  order by (f.search_text like q.esc || '%') desc, char_length(f.search_text), f.food_code
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.search_foods(text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.body_measurements enable row level security;
alter table public.food_master enable row level security;
alter table public.food_serving_units enable row level security;
alter table public.custom_foods enable row level security;
alter table public.food_favorites enable row level security;
alter table public.meal_entries enable row level security;
alter table public.meal_items enable row level security;
alter table public.meal_templates enable row level security;
alter table public.meal_template_items enable row level security;
alter table public.exercise_entries enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.notification_settings enable row level security;

-- profiles: own row only; rows are created by the trigger, never deleted directly
create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy user_preferences_select on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_preferences_update on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Standard owner policies for user-owned record tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'nutrition_goals', 'body_measurements', 'custom_foods', 'food_favorites',
    'meal_entries', 'meal_items', 'meal_templates', 'meal_template_items',
    'exercise_entries', 'exercise_sets', 'notification_settings'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Food master: read-only reference data for signed-in users
create policy food_master_select on public.food_master
  for select to authenticated using (is_active);
create policy food_serving_units_select on public.food_serving_units
  for select to authenticated using (true);

-- Subscriptions: users may READ their own state; only the service role writes.
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- subscription_events: no policies → no access for anon/authenticated (service role bypasses RLS).

-- Defense in depth: anon gets nothing on public tables.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.food_master, public.food_serving_units,
  public.subscriptions from authenticated;
revoke all on public.subscription_events from authenticated;

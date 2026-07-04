
-- =========================
-- ENUMS
-- =========================
create type public.app_role as enum ('admin', 'user');
create type public.server_status as enum ('up', 'degraded', 'down', 'unknown');
create type public.alert_kind as enum ('email', 'discord', 'telegram', 'webhook');

-- =========================
-- PROFILES
-- =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- =========================
-- USER_ROLES
-- =========================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- profiles policies
create policy "profiles: user reads own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: admin reads all" on public.profiles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "profiles: user updates own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: insert self" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- user_roles policies
create policy "roles: user reads own" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "roles: admin reads all" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "roles: admin manages" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================
-- SIGNUP TRIGGER
-- =========================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  select not exists (select 1 from public.user_roles) into is_first;

  insert into public.user_roles (user_id, role)
  values (new.id, case when is_first then 'admin'::public.app_role else 'user'::public.app_role end);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================
-- SERVERS
-- =========================
create table public.servers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  host text not null,
  description text,
  category text,
  is_public boolean not null default false,
  public_slug text unique,
  interval_seconds integer not null default 30 check (interval_seconds between 15 and 3600),
  failure_threshold integer not null default 3 check (failure_threshold between 1 and 20),
  current_status public.server_status not null default 'unknown',
  last_checked_at timestamptz,
  last_latency_ms integer,
  consecutive_failures integer not null default 0,
  ssl_days_remaining integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_servers_owner on public.servers(owner_id);
create index idx_servers_public on public.servers(is_public) where is_public;
grant select, insert, update, delete on public.servers to authenticated;
grant select on public.servers to anon;
grant all on public.servers to service_role;
alter table public.servers enable row level security;

create policy "servers: owner all" on public.servers
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "servers: admin all" on public.servers
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy "servers: public read" on public.servers
  for select to anon using (is_public = true);
create policy "servers: public read auth" on public.servers
  for select to authenticated using (is_public = true);

-- =========================
-- CHECKS (histórico)
-- =========================
create table public.checks (
  id bigserial primary key,
  server_id uuid not null references public.servers(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status public.server_status not null,
  http_status integer,
  latency_ms integer,
  dns_resolved_ip text,
  ssl_days_remaining integer,
  error text
);
create index idx_checks_server_time on public.checks(server_id, checked_at desc);
grant select, insert on public.checks to authenticated;
grant select on public.checks to anon;
grant all on public.checks to service_role;
alter table public.checks enable row level security;

create policy "checks: owner read" on public.checks
  for select to authenticated
  using (exists (select 1 from public.servers s where s.id = checks.server_id and s.owner_id = auth.uid()));
create policy "checks: admin read" on public.checks
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "checks: public read" on public.checks
  for select to anon
  using (exists (select 1 from public.servers s where s.id = checks.server_id and s.is_public));
create policy "checks: public read auth" on public.checks
  for select to authenticated
  using (exists (select 1 from public.servers s where s.id = checks.server_id and s.is_public));

-- =========================
-- INCIDENTS
-- =========================
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reason text,
  notified boolean not null default false
);
create index idx_incidents_server on public.incidents(server_id, started_at desc);
grant select on public.incidents to authenticated;
grant select on public.incidents to anon;
grant all on public.incidents to service_role;
alter table public.incidents enable row level security;

create policy "incidents: owner read" on public.incidents
  for select to authenticated
  using (exists (select 1 from public.servers s where s.id = incidents.server_id and s.owner_id = auth.uid()));
create policy "incidents: admin read" on public.incidents
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "incidents: public read" on public.incidents
  for select to anon
  using (exists (select 1 from public.servers s where s.id = incidents.server_id and s.is_public));
create policy "incidents: public read auth" on public.incidents
  for select to authenticated
  using (exists (select 1 from public.servers s where s.id = incidents.server_id and s.is_public));

-- =========================
-- ALERT CHANNELS
-- =========================
create table public.alert_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind public.alert_kind not null,
  target text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_alerts_owner on public.alert_channels(owner_id);
grant select, insert, update, delete on public.alert_channels to authenticated;
grant all on public.alert_channels to service_role;
alter table public.alert_channels enable row level security;

create policy "alerts: owner all" on public.alert_channels
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "alerts: admin read" on public.alert_channels
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- =========================
-- NOTIFICATIONS LOG
-- =========================
create table public.notifications_log (
  id bigserial primary key,
  incident_id uuid references public.incidents(id) on delete set null,
  server_id uuid references public.servers(id) on delete cascade,
  channel_id uuid references public.alert_channels(id) on delete set null,
  event text not null,
  ok boolean not null,
  response text,
  sent_at timestamptz not null default now()
);
create index idx_notif_server on public.notifications_log(server_id, sent_at desc);
grant select on public.notifications_log to authenticated;
grant all on public.notifications_log to service_role;
alter table public.notifications_log enable row level security;

create policy "notif: owner read" on public.notifications_log
  for select to authenticated
  using (exists (select 1 from public.servers s where s.id = notifications_log.server_id and s.owner_id = auth.uid()));
create policy "notif: admin read" on public.notifications_log
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- =========================
-- updated_at trigger
-- =========================
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger servers_touch_updated
  before update on public.servers
  for each row execute function public.tg_touch_updated_at();

-- =========================
-- Realtime
-- =========================
alter publication supabase_realtime add table public.servers;
alter publication supabase_realtime add table public.checks;
alter publication supabase_realtime add table public.incidents;

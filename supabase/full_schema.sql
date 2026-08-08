-- StreamMonitor.site - Esquema Completo do Banco de Dados
-- Este arquivo reconstrói toda a estrutura do banco de dados necessária para o Stream Monitor.
-- Instruções:
-- 1. Abra o SQL Editor no seu painel do Supabase.
-- 2. Cole o conteúdo deste arquivo e execute.
-- 3. Certifique-se de que as extensões (pg_cron, pgcrypto, etc) estão habilitadas caso o script falhe nelas.

-- ======================================================================================
-- 1. EXTENSÕES
-- ======================================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";


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

alter function public.tg_touch_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.tg_touch_updated_at() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- Add phone to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Subscription plan enum
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trial','active','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.plan_type AS ENUM ('trial','monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending','approved','rejected','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('pix','credit_card','boleto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subscriptions table (one active row per user)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan public.plan_type NOT NULL DEFAULT 'trial',
  status public.subscription_status NOT NULL DEFAULT 'trial',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs: user reads own" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "subs: user inserts own" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "subs: admin reads all" ON public.subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "subs: admin manages" ON public.subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_subs_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Payments (structure prepared for Mercado Pago PIX)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text,
  method public.payment_method NOT NULL DEFAULT 'pix',
  status public.payment_status NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  plan public.plan_type NOT NULL,
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_copy_paste text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay: user reads own" ON public.payments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pay: user inserts own" ON public.payments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pay: admin manages" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id, created_at DESC);

-- Update handle_new_user to capture phone and create trial subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone'
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (new.id, 'trial', 'trial', now(), now() + interval '30 days')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- Ensure trigger exists on auth.users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Backfill for existing users missing a subscription
INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
SELECT u.id, 'trial', 'trial', now(), now() + interval '30 days'
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
WHERE s.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Helper: computed status accounting for expiration
CREATE OR REPLACE FUNCTION public.subscription_is_active(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND expires_at > now() AND status IN ('trial','active')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.subscription_is_active(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO service_role;

-- Regiões de monitoramento
CREATE TABLE public.check_regions (
  code text PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  flag text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.check_regions TO anon, authenticated;
GRANT ALL ON public.check_regions TO service_role;

ALTER TABLE public.check_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Regions readable by everyone"
  ON public.check_regions FOR SELECT
  USING (true);

-- Checks por região
CREATE TABLE public.region_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  region_code text NOT NULL REFERENCES public.check_regions(code) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('up','down','degraded','unknown','pending')),
  http_status int,
  latency_ms int,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_region_checks_server_time ON public.region_checks(server_id, checked_at DESC);
CREATE INDEX idx_region_checks_server_region_time ON public.region_checks(server_id, region_code, checked_at DESC);

GRANT SELECT ON public.region_checks TO anon, authenticated;
GRANT INSERT ON public.region_checks TO authenticated;
GRANT ALL ON public.region_checks TO service_role;

ALTER TABLE public.region_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own region checks"
  ON public.region_checks FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = region_checks.server_id AND s.owner_id = auth.uid()));

CREATE POLICY "Public reads region checks of public servers"
  ON public.region_checks FOR SELECT
  TO anon
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = region_checks.server_id AND s.is_public = true));

-- Seed regiões
INSERT INTO public.check_regions (code, name, city, country, flag, latitude, longitude) VALUES
  ('origin',        'Origem (Lovable)',   'Origem',    'Global',    '🌐', 0,        0),
  ('sa-east-1',     'AWS São Paulo',      'São Paulo', 'Brasil',    '🇧🇷', -23.5505, -46.6333),
  ('us-east-1',     'AWS Virgínia',       'Ashburn',   'EUA',       '🇺🇸', 39.0438,  -77.4874),
  ('eu-central-1',  'AWS Frankfurt',      'Frankfurt', 'Alemanha',  '🇩🇪', 50.1109,  8.6821),
  ('ap-northeast-1','AWS Tóquio',         'Tóquio',    'Japão',     '🇯🇵', 35.6762,  139.6503);

-- 1) profiles additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) code generator
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- 3) backfill codes for existing profiles
UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

-- 4) referrals table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_used text NOT NULL,
  converted_at timestamptz,
  reward_granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_id)
);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own referrals (as referrer or referred)"
  ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "Admins see all referrals"
  ON public.referrals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) update handle_new_user: generate code, apply referral bonus (10 extra days)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  trial_days int := 30;
  my_code text;
BEGIN
  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT id INTO referrer FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
    IF referrer IS NOT NULL AND referrer <> new.id THEN
      trial_days := 40; -- 10 extra days
    ELSE
      referrer := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (new.id, 'trial', 'trial', now(), now() + (trial_days || ' days')::interval)
  ON CONFLICT (user_id) DO NOTHING;

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6) reward trigger when a payment is marked paid
CREATE OR REPLACE FUNCTION public.grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref record;
BEGIN
  IF NEW.status <> 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  SELECT * INTO ref FROM public.referrals
    WHERE referred_id = NEW.user_id AND reward_granted_at IS NULL
    LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.subscriptions
    SET expires_at = GREATEST(expires_at, now()) + interval '30 days',
        status = CASE WHEN status IN ('expired','cancelled') THEN 'active' ELSE status END
    WHERE user_id = ref.referrer_id;

  UPDATE public.referrals
    SET converted_at = COALESCE(converted_at, now()),
        reward_granted_at = now()
    WHERE id = ref.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_paid_grant_referral ON public.payments;
CREATE TRIGGER on_payment_paid_grant_referral
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.grant_referral_reward();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_bonus_days integer NOT NULL DEFAULT 10;

-- Set your custom code and bonus
UPDATE public.profiles
  SET referral_code = 'VICTOR', signup_bonus_days = 30
  WHERE email = 'victorsampaio133@gmail.com';

-- Update handle_new_user to use the referrer's signup_bonus_days
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  bonus int := 0;
  trial_days int := 30;
  my_code text;
BEGIN
  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT id, signup_bonus_days INTO referrer, bonus
      FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
    IF referrer IS NOT NULL AND referrer <> new.id THEN
      trial_days := 30 + COALESCE(bonus, 10);
    ELSE
      referrer := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (new.id, 'trial', 'trial', now(), now() + (trial_days || ' days')::interval)
  ON CONFLICT (user_id) DO NOTHING;

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stability_ranking(_limit int DEFAULT 20)
RETURNS TABLE (
  name text,
  avg_latency_ms numeric,
  max_latency_ms int,
  down_count bigint,
  total_checks bigint,
  instability_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.name,
    ROUND(AVG(c.latency_ms)::numeric, 0) AS avg_latency_ms,
    COALESCE(MAX(c.latency_ms), 0)::int AS max_latency_ms,
    COUNT(*) FILTER (WHERE c.status <> 'up') AS down_count,
    COUNT(*) AS total_checks,
    ROUND(
      (COUNT(*) FILTER (WHERE c.status <> 'up')::numeric / NULLIF(COUNT(*),0)) * 100
      + (COALESCE(AVG(c.latency_ms), 0) / 100),
      2
    ) AS instability_score
  FROM public.checks c
  JOIN public.servers s ON s.id = c.server_id
  WHERE c.checked_at > now() - interval '24 hours'
  GROUP BY s.id, s.name
  HAVING COUNT(*) >= 3
  ORDER BY instability_score DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;

REVOKE ALL ON FUNCTION public.get_stability_ranking(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stability_ranking(int) TO authenticated;
GRANT SELECT ON public.check_regions TO anon, authenticated;
GRANT ALL ON public.check_regions TO service_role;

GRANT SELECT ON public.region_checks TO anon, authenticated;
GRANT ALL ON public.region_checks TO service_role;-- Fix: enum uses 'approved', not 'paid'
CREATE OR REPLACE FUNCTION public.grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ref record;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT * INTO ref FROM public.referrals
    WHERE referred_id = NEW.user_id AND reward_granted_at IS NULL
    LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.subscriptions
    SET expires_at = GREATEST(expires_at, now()) + interval '30 days',
        status = CASE WHEN status IN ('expired','cancelled') THEN 'active' ELSE status END
    WHERE user_id = ref.referrer_id;

  UPDATE public.referrals
    SET converted_at = COALESCE(converted_at, now()),
        reward_granted_at = now()
    WHERE id = ref.id;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on payments
DROP TRIGGER IF EXISTS trg_grant_referral_reward ON public.payments;
CREATE TRIGGER trg_grant_referral_reward
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.grant_referral_reward();

-- Admin aggregated stats (safe, no PII)
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'new_users_7d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    'trial_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'trial' AND expires_at > now()),
    'paid_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active' AND expires_at > now()),
    'expired', (SELECT COUNT(*) FROM public.subscriptions WHERE expires_at <= now()),
    'cancelled', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'cancelled'),
    'expiring_7d', (SELECT COUNT(*) FROM public.subscriptions WHERE expires_at > now() AND expires_at < now() + interval '7 days'),
    'monthly_subs', (SELECT COUNT(*) FROM public.subscriptions WHERE plan = 'monthly' AND expires_at > now()),
    'yearly_subs', (SELECT COUNT(*) FROM public.subscriptions WHERE plan = 'yearly' AND expires_at > now()),
    'payments_pending', (SELECT COUNT(*) FROM public.payments WHERE status = 'pending'),
    'payments_approved_total', (SELECT COUNT(*) FROM public.payments WHERE status = 'approved'),
    'revenue_cents_total', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved'),
    'revenue_cents_30d', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved' AND paid_at > now() - interval '30 days'),
    'revenue_cents_7d', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved' AND paid_at > now() - interval '7 days'),
    'total_servers', (SELECT COUNT(*) FROM public.servers),
    'total_referrals', (SELECT COUNT(*) FROM public.referrals),
    'converted_referrals', (SELECT COUNT(*) FROM public.referrals WHERE reward_granted_at IS NOT NULL),
    'signups_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', c) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS c
        FROM public.profiles
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Admin user list with joined subscription state
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  is_admin boolean,
  plan plan_type,
  status subscription_status,
  expires_at timestamptz,
  days_remaining int,
  total_paid_cents bigint,
  last_payment_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.created_at,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin') AS is_admin,
    s.plan,
    s.status,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::int) AS days_remaining,
    COALESCE((SELECT SUM(amount_cents) FROM public.payments WHERE user_id = p.id AND status = 'approved'), 0)::bigint AS total_paid_cents,
    (SELECT MAX(paid_at) FROM public.payments WHERE user_id = p.id AND status = 'approved') AS last_payment_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
CREATE OR REPLACE FUNCTION public.prevent_duplicate_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_host text;
  conflict_owner uuid;
BEGIN
  normalized_host := lower(trim(NEW.host));
  NEW.host := normalized_host;

  -- Admins podem cadastrar qualquer host
  IF public.has_role(NEW.owner_id, 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO conflict_owner
  FROM public.servers
  WHERE lower(trim(host)) = normalized_host
    AND owner_id <> NEW.owner_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF conflict_owner IS NOT NULL THEN
    RAISE EXCEPTION 'Este host/DNS já está sendo monitorado por outro usuário. Apenas administradores podem cadastrar hosts duplicados.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS servers_prevent_duplicate_host_ins ON public.servers;
CREATE TRIGGER servers_prevent_duplicate_host_ins
BEFORE INSERT ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_host();

DROP TRIGGER IF EXISTS servers_prevent_duplicate_host_upd ON public.servers;
CREATE TRIGGER servers_prevent_duplicate_host_upd
BEFORE UPDATE OF host ON public.servers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_host();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_host text;
  conflict_exists boolean;
BEGIN
  normalized_host := lower(trim(NEW.host));
  NEW.host := normalized_host;

  -- Admins podem cadastrar qualquer host
  IF public.has_role(NEW.owner_id, 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.servers
    WHERE lower(trim(host)) = normalized_host
      AND owner_id <> NEW.owner_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO conflict_exists;

  IF conflict_exists THEN
    RAISE EXCEPTION 'Este host não está disponível para monitoramento. Contate o suporte se acredita que isso é um engano.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamp with time zone,
  is_admin boolean,
  plan public.plan_type,
  status public.subscription_status,
  expires_at timestamp with time zone,
  days_remaining integer,
  total_paid_cents bigint,
  last_payment_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.created_at,
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role = 'admin'::public.app_role
    ) AS is_admin,
    s.plan,
    s.status,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::int) AS days_remaining,
    COALESCE((
      SELECT SUM(pay.amount_cents)
      FROM public.payments pay
      WHERE pay.user_id = p.id
        AND pay.status = 'approved'::public.payment_status
    ), 0)::bigint AS total_paid_cents,
    (
      SELECT MAX(pay.paid_at)
      FROM public.payments pay
      WHERE pay.user_id = p.id
        AND pay.status = 'approved'::public.payment_status
    ) AS last_payment_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$function$;REVOKE EXECUTE ON FUNCTION public.get_admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated, service_role;CREATE OR REPLACE FUNCTION public.finalize_approved_payment(
  _payment_id uuid,
  _provider_payment_id text,
  _raw_payload jsonb,
  _paid_at timestamptz DEFAULT now()
)
RETURNS TABLE(applied boolean, user_id uuid, plan public.plan_type, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  new_expires timestamptz;
  duration interval;
BEGIN
  UPDATE public.payments
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE id = _payment_id
    AND status <> 'approved'::public.payment_status
  RETURNING * INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO user_id, plan, expires_at
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    applied := false;
    RETURN NEXT;
    RETURN;
  END IF;

  duration := CASE pay.plan
    WHEN 'yearly'::public.plan_type THEN interval '365 days'
    ELSE interval '30 days'
  END;

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at, cancelled_at)
  VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration, null)
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      status = 'active'::public.subscription_status,
      expires_at = GREATEST(public.subscriptions.expires_at, _paid_at) + duration,
      cancelled_at = null
  RETURNING public.subscriptions.expires_at INTO new_expires;

  applied := true;
  user_id := pay.user_id;
  plan := pay.plan;
  expires_at := new_expires;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) TO service_role;
-- Remove public access to servers table (leaked host to anyone)
DROP POLICY IF EXISTS "servers: public read" ON public.servers;
DROP POLICY IF EXISTS "servers: public read auth" ON public.servers;

-- Secure RPC for the public status page (no host exposed)
CREATE OR REPLACE FUNCTION public.get_public_status(_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  current_status server_status,
  last_latency_ms integer,
  last_checked_at timestamptz,
  ssl_days_remaining integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, description, current_status, last_latency_ms, last_checked_at, ssl_days_remaining
  FROM public.servers
  WHERE public_slug = _slug AND is_public = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;

-- Secure RPC for last N checks of a public server
CREATE OR REPLACE FUNCTION public.get_public_checks(_slug text, _limit integer DEFAULT 60)
RETURNS TABLE (
  status server_status,
  checked_at timestamptz,
  latency_ms integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.status, c.checked_at, c.latency_ms
  FROM public.checks c
  JOIN public.servers s ON s.id = c.server_id
  WHERE s.public_slug = _slug AND s.is_public = true
  ORDER BY c.checked_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.get_public_checks(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;

-- Revoke EXECUTE from PUBLIC on all security-definer functions and re-grant narrowly.

-- Public status functions (used by anon on /status/:slug)
REVOKE ALL ON FUNCTION public.get_public_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_checks(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;

-- Ranking: only authenticated users
REVOKE ALL ON FUNCTION public.get_stability_ranking(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stability_ranking(integer) TO authenticated;

-- has_role: used by RLS policies and by app; keep for authenticated only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- subscription_is_active: only server / authenticated
REVOKE ALL ON FUNCTION public.subscription_is_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated, service_role;

-- generate_referral_code: internal only (used by trigger); no client access
REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO service_role;

-- Admin-only functions: revoke from anon/authenticated (server calls use service_role or the SECURITY DEFINER internal check)
-- Keep authenticated access because the functions internally verify has_role(admin) and raise 'forbidden'.
REVOKE ALL ON FUNCTION public.get_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated, service_role;

-- finalize_approved_payment: only server (webhook uses service_role)
REVOKE ALL ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) TO service_role;

-- Trigger functions: internal only
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_referral_reward() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_duplicate_host() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Enable realtime
ALTER TABLE public.region_checks REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'region_checks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.region_checks;
  END IF;
END $$;

-- Index for fast per-server per-region lookups
CREATE INDEX IF NOT EXISTS region_checks_server_region_time_idx
  ON public.region_checks (server_id, region_code, checked_at DESC);

CREATE INDEX IF NOT EXISTS region_checks_region_time_idx
  ON public.region_checks (region_code, checked_at DESC);

-- RPC: worker heartbeat (last reported per region across whole system)
CREATE OR REPLACE FUNCTION public.get_workers_health()
RETURNS TABLE(region_code text, last_report_at timestamptz, checks_60s bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.code AS region_code,
         MAX(rc.checked_at) AS last_report_at,
         COUNT(rc.*) FILTER (WHERE rc.checked_at > now() - interval '60 seconds') AS checks_60s
  FROM public.check_regions r
  LEFT JOIN public.region_checks rc ON rc.region_code = r.code
    AND rc.checked_at > now() - interval '10 minutes'
  WHERE r.enabled = true AND r.code <> 'origin'
  GROUP BY r.code
  ORDER BY r.code;
$$;

GRANT EXECUTE ON FUNCTION public.get_workers_health() TO anon, authenticated;

-- RPC: per-region latency stats for a given server (last N minutes)
CREATE OR REPLACE FUNCTION public.get_region_stats(_server_id uuid, _minutes int DEFAULT 60)
RETURNS TABLE(
  region_code text,
  total bigint,
  ups bigint,
  downs bigint,
  min_ms int,
  max_ms int,
  avg_ms numeric,
  p95_ms numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rc.region_code,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE rc.status = 'up') AS ups,
    COUNT(*) FILTER (WHERE rc.status = 'down') AS downs,
    MIN(rc.latency_ms) AS min_ms,
    MAX(rc.latency_ms) AS max_ms,
    ROUND(AVG(rc.latency_ms)::numeric, 0) AS avg_ms,
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY rc.latency_ms)::numeric, 0) AS p95_ms
  FROM public.region_checks rc
  JOIN public.servers s ON s.id = rc.server_id
  WHERE rc.server_id = _server_id
    AND rc.checked_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
    AND (s.owner_id = auth.uid() OR s.is_public = true OR public.has_role(auth.uid(),'admin'))
  GROUP BY rc.region_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_region_stats(uuid, int) TO anon, authenticated;

-- 1. Alter referrals table
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS reward_cents integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_request_id uuid;

-- Backfill status based on existing data
UPDATE public.referrals SET status = 'subscribed', subscribed_at = COALESCE(reward_granted_at, converted_at, created_at)
  WHERE reward_granted_at IS NOT NULL AND status = 'pending';
UPDATE public.referrals SET status = 'trial_active' WHERE converted_at IS NULL AND reward_granted_at IS NULL AND status = 'pending';

-- 2. Adjust default signup bonus days from 10 to 2
ALTER TABLE public.profiles ALTER COLUMN signup_bonus_days SET DEFAULT 2;
UPDATE public.profiles SET signup_bonus_days = 2 WHERE signup_bonus_days = 10;

-- 3. Create payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  pix_type text NOT NULL CHECK (pix_type IN ('cpf','phone','email','random')),
  pix_key text NOT NULL,
  pix_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','paid','rejected')),
  admin_note text,
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout: user reads own" ON public.payout_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "payout: user inserts own" ON public.payout_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "payout: admin reads all" ON public.payout_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "payout: admin updates" ON public.payout_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER payout_requests_touch BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- FK from referrals to payout_requests
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_payout_request_fk FOREIGN KEY (payout_request_id) REFERENCES public.payout_requests(id) ON DELETE SET NULL;

-- 4. Replace grant_referral_reward: mark referral as subscribed, do NOT extend indicator's plan
CREATE OR REPLACE FUNCTION public.grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref record;
  is_first_payment boolean;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT * INTO ref FROM public.referrals
    WHERE referred_id = NEW.user_id AND status IN ('pending','trial_active')
    LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Only the FIRST approved payment triggers reward
  SELECT NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE user_id = NEW.user_id AND status = 'approved' AND id <> NEW.id
  ) INTO is_first_payment;
  IF NOT is_first_payment THEN RETURN NEW; END IF;

  UPDATE public.referrals
    SET status = 'subscribed',
        subscribed_at = now(),
        converted_at = COALESCE(converted_at, now()),
        reward_granted_at = now(),
        reward_cents = COALESCE(reward_cents, 1000)
    WHERE id = ref.id;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_grant_referral_reward ON public.payments;
CREATE TRIGGER trg_grant_referral_reward
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.grant_referral_reward();

-- 5. RPC: referral balance summary for a user
CREATE OR REPLACE FUNCTION public.get_referral_summary(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'total_referrals', COUNT(*),
    'in_trial', COUNT(*) FILTER (WHERE status IN ('pending','trial_active')),
    'subscribed_count', COUNT(*) FILTER (WHERE status IN ('subscribed','requested','approved','paid')),
    'available_cents', COALESCE(SUM(reward_cents) FILTER (WHERE status = 'subscribed'), 0),
    'pending_cents', COALESCE(SUM(reward_cents) FILTER (WHERE status IN ('requested','approved')), 0),
    'paid_cents', COALESCE(SUM(reward_cents) FILTER (WHERE status = 'paid'), 0)
  ) INTO result
  FROM public.referrals WHERE referrer_id = _user_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_summary(uuid) TO authenticated;

-- 6. RPC: create payout request
CREATE OR REPLACE FUNCTION public.request_payout(_pix_type text, _pix_key text, _pix_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  total_cents integer;
  new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _pix_type NOT IN ('cpf','phone','email','random') THEN RAISE EXCEPTION 'invalid pix type'; END IF;
  IF length(trim(_pix_key)) < 3 THEN RAISE EXCEPTION 'invalid pix key'; END IF;
  IF length(trim(_pix_name)) < 2 THEN RAISE EXCEPTION 'invalid pix name'; END IF;

  SELECT COALESCE(SUM(reward_cents),0) INTO total_cents
    FROM public.referrals WHERE referrer_id = uid AND status = 'subscribed';
  IF total_cents < 1000 THEN RAISE EXCEPTION 'saldo insuficiente'; END IF;

  INSERT INTO public.payout_requests (user_id, amount_cents, pix_type, pix_key, pix_name)
  VALUES (uid, total_cents, _pix_type, trim(_pix_key), trim(_pix_name))
  RETURNING id INTO new_id;

  UPDATE public.referrals
    SET status = 'requested', requested_at = now(), payout_request_id = new_id
    WHERE referrer_id = uid AND status = 'subscribed';

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(text,text,text) TO authenticated;

-- 7. Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_approve_payout(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payout_requests SET status = 'approved', approved_at = now(), approved_by = auth.uid()
    WHERE id = _id AND status = 'requested';
  UPDATE public.referrals SET status = 'approved', approved_at = now()
    WHERE payout_request_id = _id AND status = 'requested';
END; $$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payout_requests SET status = 'paid', paid_at = now()
    WHERE id = _id AND status IN ('approved','requested');
  UPDATE public.referrals SET status = 'paid', paid_at = now()
    WHERE payout_request_id = _id AND status IN ('requested','approved');
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reject_payout(_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payout_requests SET status = 'rejected', rejected_at = now(), admin_note = _note, approved_by = auth.uid()
    WHERE id = _id AND status IN ('requested','approved');
  -- Release referrals back to 'subscribed' so user can re-request
  UPDATE public.referrals SET status = 'subscribed', requested_at = NULL, approved_at = NULL, payout_request_id = NULL
    WHERE payout_request_id = _id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_approve_payout(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_payout(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid,text) TO authenticated;

-- 8. Admin list of payout requests with user info
CREATE OR REPLACE FUNCTION public.admin_list_payout_requests()
RETURNS TABLE(
  id uuid, user_id uuid, user_email text, user_name text, user_phone text,
  amount_cents integer, pix_type text, pix_key text, pix_name text,
  status text, admin_note text, requested_at timestamptz, approved_at timestamptz,
  paid_at timestamptz, rejected_at timestamptz,
  referral_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT pr.id, pr.user_id, p.email, p.full_name, p.phone,
         pr.amount_cents, pr.pix_type, pr.pix_key, pr.pix_name,
         pr.status, pr.admin_note, pr.requested_at, pr.approved_at,
         pr.paid_at, pr.rejected_at,
         (SELECT COUNT(*) FROM public.referrals r WHERE r.payout_request_id = pr.id)
  FROM public.payout_requests pr
  LEFT JOIN public.profiles p ON p.id = pr.user_id
  ORDER BY pr.requested_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.admin_list_payout_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;

-- 1) server_analysis
CREATE TABLE public.server_analysis (
  server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  is_cloudflare boolean,
  cdn_provider text,
  ipv4 text[],
  ipv6 text[],
  nameservers text[],
  ttl_seconds integer,
  ssl_issuer text,
  ssl_expires_at timestamptz,
  ssl_algorithm text,
  country text,
  city text,
  asn text,
  org text,
  response_ms integer,
  cert_history jsonb,
  raw jsonb,
  analyzed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.server_analysis TO authenticated;
GRANT ALL ON public.server_analysis TO service_role;
ALTER TABLE public.server_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analysis: owner or admin reads" ON public.server_analysis
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "analysis: owner writes" ON public.server_analysis
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

-- 2) achievements catalog
CREATE TABLE public.achievements (
  code text PRIMARY KEY,
  emoji text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements: public read" ON public.achievements FOR SELECT USING (true);

INSERT INTO public.achievements (code, emoji, title, description) VALUES
  ('no_incidents_30d', '🏆', '30 dias sem incidentes', 'Um servidor seu ficou 30 dias sem nenhum incidente registrado.'),
  ('monitoring_100d', '🥇', '100 dias monitorando', 'Você monitora um servidor há 100 dias ou mais.'),
  ('low_latency', '⚡', 'Baixa latência', 'Um servidor seu manteve latência média abaixo de 100 ms nas últimas 24h.'),
  ('ssl_always_valid', '🛡', 'SSL sempre válido', 'Um servidor seu manteve SSL válido nos últimos 60 dias.');

-- 3) user_achievements
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_code text NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_code, server_id)
);
GRANT SELECT ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ua: user reads own" ON public.user_achievements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ua: admin reads all" ON public.user_achievements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4) evaluate_achievements function
CREATE OR REPLACE FUNCTION public.evaluate_achievements(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  granted int := 0;
  s record;
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid() THEN
    -- allow admins too
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  FOR s IN SELECT id, created_at, ssl_days_remaining FROM public.servers WHERE owner_id = _user_id LOOP
    -- 30 dias sem incidentes
    IF s.created_at < now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.incidents i
         WHERE i.server_id = s.id AND i.started_at > now() - interval '30 days'
       )
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'no_incidents_30d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    -- 100 dias monitorando
    IF s.created_at < now() - interval '100 days' THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'monitoring_100d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    -- Baixa latência
    IF (SELECT AVG(latency_ms) FROM public.checks
        WHERE server_id = s.id AND checked_at > now() - interval '24 hours' AND latency_ms IS NOT NULL) < 100
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'low_latency', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    -- SSL sempre válido últimos 60 dias
    IF s.created_at < now() - interval '60 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.checks c
         WHERE c.server_id = s.id
           AND c.checked_at > now() - interval '60 days'
           AND c.ssl_days_remaining IS NOT NULL
           AND c.ssl_days_remaining <= 0
       )
       AND s.ssl_days_remaining IS NOT NULL AND s.ssl_days_remaining > 0
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'ssl_always_valid', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;
  END LOOP;

  RETURN granted;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;

-- 5) public DNS list
CREATE OR REPLACE FUNCTION public.get_public_dns_list()
RETURNS TABLE(name text, current_status server_status, last_checked_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, current_status, last_checked_at
  FROM public.servers
  WHERE is_public = true
  ORDER BY name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_dns_list() TO anon, authenticated;

-- 6) trial padrão de 2 dias
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  bonus int := 0;
  trial_days int := 2;
  my_code text;
BEGIN
  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT id, signup_bonus_days INTO referrer, bonus
      FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
    IF referrer IS NOT NULL AND referrer <> new.id THEN
      trial_days := 2 + COALESCE(bonus, 2);
    ELSE
      referrer := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (new.id, 'trial', 'trial', now(), now() + (trial_days || ' days')::interval)
  ON CONFLICT (user_id) DO NOTHING;

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;
CREATE TABLE public.mcp_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  tool TEXT NOT NULL,
  args JSONB,
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','error')),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_activity_log TO authenticated;
GRANT ALL ON public.mcp_activity_log TO service_role;
ALTER TABLE public.mcp_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own mcp activity" ON public.mcp_activity_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX mcp_activity_log_user_created_idx ON public.mcp_activity_log (user_id, created_at DESC);-- ============ ENUMS ============
CREATE TYPE public.listing_kind AS ENUM ('offer','demand');
CREATE TYPE public.listing_category AS ENUM (
  'credits','panel','dedicated','vps','hosting','cdn','proxy','domain','cloudflare',
  'service_setup','service_install','service_migration','service_dns','service_dev',
  'service_bot','service_site','service_landing','service_app',
  'partnership','help','other'
);
CREATE TYPE public.listing_status AS ENUM ('active','paused','closed','removed');
CREATE TYPE public.hub_verification_status AS ENUM ('none','pending','approved','rejected');
CREATE TYPE public.hub_report_reason AS ENUM ('spam','scam','contact_leak','offensive','other');
CREATE TYPE public.hub_report_target AS ENUM ('listing','user','message');

-- ============ hub_profiles ============
CREATE TABLE public.hub_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text UNIQUE,
  bio text,
  location text,
  verification_status public.hub_verification_status NOT NULL DEFAULT 'none',
  verified_at timestamptz,
  verification_doc_path text,
  business_count integer NOT NULL DEFAULT 0,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.hub_profiles TO authenticated;
GRANT ALL ON public.hub_profiles TO service_role;
ALTER TABLE public.hub_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hub_profiles: authenticated read all"
  ON public.hub_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "hub_profiles: insert self"
  ON public.hub_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "hub_profiles: update self"
  ON public.hub_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "hub_profiles: admin manages"
  ON public.hub_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ listings ============
CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.listing_kind NOT NULL,
  category public.listing_category NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  price_cents integer,
  currency text NOT NULL DEFAULT 'BRL',
  location text,
  status public.listing_status NOT NULL DEFAULT 'active',
  flagged boolean NOT NULL DEFAULT false,
  highlight boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_status_category_created_idx
  ON public.listings(status, category, created_at DESC);
CREATE INDEX listings_author_idx ON public.listings(author_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings: authenticated read active"
  ON public.listings FOR SELECT TO authenticated
  USING (status <> 'removed' OR author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "listings: owner insert (active sub)"
  ON public.listings FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.subscription_is_active(auth.uid()));
CREATE POLICY "listings: owner update"
  ON public.listings FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "listings: owner delete"
  ON public.listings FOR DELETE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "listings: admin manages"
  ON public.listings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ conversations ============
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  buyer_read_at timestamptz,
  seller_read_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_distinct_participants CHECK (buyer_id <> seller_id)
);
CREATE UNIQUE INDEX conversations_listing_pair_uniq
  ON public.conversations(listing_id, buyer_id, seller_id) NULLS NOT DISTINCT;
CREATE INDEX conversations_buyer_idx ON public.conversations(buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON public.conversations(seller_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations: participants read"
  ON public.conversations FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "conversations: buyer insert"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND public.subscription_is_active(auth.uid()));
CREATE POLICY "conversations: participants update"
  ON public.conversations FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());
CREATE POLICY "conversations: admin manages"
  ON public.conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ messages ============
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  attachments jsonb,
  flagged boolean NOT NULL DEFAULT false,
  contact_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_created_idx ON public.messages(conversation_id, created_at);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages: participants read"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ));
CREATE POLICY "messages: participants insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.subscription_is_active(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );
CREATE POLICY "messages: admin manages"
  ON public.messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ ratings ============
CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, rater_id),
  CONSTRAINT ratings_stars_range CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT ratings_distinct CHECK (rater_id <> ratee_id)
);
CREATE INDEX ratings_ratee_idx ON public.ratings(ratee_id);

GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ratings: authenticated read"
  ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ratings: participants insert"
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (
    rater_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = ratings.conversation_id
        AND ((c.buyer_id = auth.uid() AND c.seller_id = ratings.ratee_id)
          OR (c.seller_id = auth.uid() AND c.buyer_id = ratings.ratee_id))
    )
  );
CREATE POLICY "ratings: admin manages"
  ON public.ratings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ reports ============
CREATE TABLE public.hub_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind public.hub_report_target NOT NULL,
  target_id uuid NOT NULL,
  reason public.hub_report_reason NOT NULL,
  detail text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_reports_open_idx ON public.hub_reports(created_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT ON public.hub_reports TO authenticated;
GRANT ALL ON public.hub_reports TO service_role;
ALTER TABLE public.hub_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hub_reports: reporter reads own"
  ON public.hub_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "hub_reports: authenticated insert"
  ON public.hub_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "hub_reports: admin manages"
  ON public.hub_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ updated_at triggers ============
CREATE TRIGGER hub_profiles_touch BEFORE UPDATE ON public.hub_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER listings_touch BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;-- ============ 1) Recompute rating ============
CREATE OR REPLACE FUNCTION public.hub_recompute_rating(_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hub_profiles hp
  SET rating_avg = COALESCE((SELECT ROUND(AVG(stars)::numeric,2) FROM public.ratings WHERE ratee_id = _user), 0),
      rating_count = COALESCE((SELECT COUNT(*) FROM public.ratings WHERE ratee_id = _user), 0),
      updated_at = now()
  WHERE hp.id = _user;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ratings_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.hub_recompute_rating(NEW.ratee_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER ratings_after_insert
  AFTER INSERT ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ratings_recompute();

-- ============ 2) Business count on conversation close ============
CREATE OR REPLACE FUNCTION public.tg_conversations_business_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND (OLD.closed_at IS NULL) THEN
    UPDATE public.hub_profiles SET business_count = business_count + 1, updated_at = now()
      WHERE id IN (NEW.buyer_id, NEW.seller_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER conversations_business_count
  AFTER UPDATE OF closed_at ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversations_business_count();

-- ============ 3) Detect contact leaks in messages ============
CREATE OR REPLACE FUNCTION public.tg_messages_flag_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_phone boolean;
  has_url boolean;
  body_norm text;
BEGIN
  body_norm := lower(coalesce(NEW.body,''));
  has_phone := body_norm ~ '(\+?\d[\d\s().-]{7,}\d)';
  has_url := body_norm ~ '(https?://|www\.|\.com|\.net|\.br|@[a-z0-9._-]+|t\.me/|wa\.me/|whatsapp|telegram|instagram)';
  IF NOT NEW.contact_shared AND (has_phone OR has_url) THEN
    NEW.flagged := true;
  END IF;
  -- Update conversation last_message_at
  UPDATE public.conversations SET last_message_at = now(), updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER messages_before_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_messages_flag_contact();

-- ============ 4) Start/get conversation ============
CREATE OR REPLACE FUNCTION public.hub_start_conversation(_listing_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  seller uuid;
  conv_id uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.subscription_is_active(me) THEN
    RAISE EXCEPTION 'subscription required';
  END IF;
  SELECT author_id INTO seller FROM public.listings WHERE id = _listing_id AND status = 'active';
  IF seller IS NULL THEN RAISE EXCEPTION 'listing not found'; END IF;
  IF seller = me THEN RAISE EXCEPTION 'cannot open conversation with yourself'; END IF;

  SELECT id INTO conv_id FROM public.conversations
    WHERE listing_id = _listing_id AND buyer_id = me AND seller_id = seller;
  IF conv_id IS NOT NULL THEN RETURN conv_id; END IF;

  INSERT INTO public.conversations (listing_id, buyer_id, seller_id, last_message_at)
  VALUES (_listing_id, me, seller, now())
  RETURNING id INTO conv_id;
  RETURN conv_id;
END; $$;

REVOKE ALL ON FUNCTION public.hub_start_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hub_start_conversation(uuid) TO authenticated;

-- ============ 5) Ranking ============
CREATE OR REPLACE FUNCTION public.hub_get_ranking(_period_days integer DEFAULT 30, _limit integer DEFAULT 20)
RETURNS TABLE(
  user_id uuid,
  handle text,
  rating_avg numeric,
  rating_count integer,
  business_count integer,
  verified boolean,
  premium boolean,
  score numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    hp.id,
    COALESCE(hp.handle, split_part(p.email,'@',1)),
    hp.rating_avg,
    hp.rating_count,
    hp.business_count,
    (hp.verification_status = 'approved') AS verified,
    public.subscription_is_active(hp.id) AS premium,
    ROUND(
      (hp.rating_avg * hp.rating_count) + (hp.business_count * 2)
      + CASE WHEN hp.verification_status='approved' THEN 5 ELSE 0 END, 2
    ) AS score
  FROM public.hub_profiles hp
  JOIN public.profiles p ON p.id = hp.id
  WHERE hp.banned = false
  ORDER BY score DESC, hp.rating_avg DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;
REVOKE ALL ON FUNCTION public.hub_get_ranking(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hub_get_ranking(integer, integer) TO authenticated;

-- ============ 6) Rate-limit listing creation (5/day) ============
CREATE OR REPLACE FUNCTION public.tg_listings_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cnt int;
BEGIN
  IF public.has_role(NEW.author_id,'admin') THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO cnt FROM public.listings
    WHERE author_id = NEW.author_id AND created_at > now() - interval '24 hours';
  IF cnt >= 5 THEN
    RAISE EXCEPTION 'Limite diário atingido (5 anúncios por dia). Tente novamente amanhã.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER listings_rate_limit
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.tg_listings_rate_limit();

-- ============ 7) Auto-provision hub_profile on new profile ============
CREATE OR REPLACE FUNCTION public.tg_profiles_create_hub_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(NEW.full_name, split_part(NEW.email,'@',1)), '[^a-z0-9]+', '', 'g'));
  IF length(base) < 3 THEN base := 'user' || substr(NEW.id::text, 1, 6); END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.hub_profiles WHERE handle = candidate) LOOP
    n := n + 1; candidate := base || n::text;
  END LOOP;
  INSERT INTO public.hub_profiles (id, handle) VALUES (NEW.id, candidate)
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_after_insert_hub
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_create_hub_profile();

-- Backfill hub_profiles for existing users
INSERT INTO public.hub_profiles (id, handle)
SELECT p.id,
  COALESCE(
    lower(regexp_replace(coalesce(p.full_name, split_part(p.email,'@',1)), '[^a-z0-9]+', '', 'g')),
    'user' || substr(p.id::text,1,6)
  ) || CASE WHEN row_number() OVER (PARTITION BY lower(regexp_replace(coalesce(p.full_name, split_part(p.email,'@',1)), '[^a-z0-9]+', '', 'g')) ORDER BY p.created_at) > 1
    THEN row_number() OVER (PARTITION BY lower(regexp_replace(coalesce(p.full_name, split_part(p.email,'@',1)), '[^a-z0-9]+', '', 'g')) ORDER BY p.created_at)::text
    ELSE '' END
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.hub_profiles hp WHERE hp.id = p.id)
ON CONFLICT (id) DO NOTHING;-- RLS on storage.objects for hub-docs bucket
CREATE POLICY "hub-docs: owner reads own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hub-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "hub-docs: owner uploads own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hub-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "hub-docs: owner deletes own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hub-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "hub-docs: admin manages"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'hub-docs' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'hub-docs' AND public.has_role(auth.uid(),'admin'));REVOKE SELECT ON public.hub_profiles FROM authenticated;
GRANT SELECT (
  id, handle, bio, location, verification_status, verified_at,
  business_count, rating_avg, rating_count, created_at, updated_at
) ON public.hub_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hub_profiles TO authenticated;
GRANT ALL ON public.hub_profiles TO service_role;
CREATE TYPE public.iptv_mode AS ENUM ('basic','smart','full');
CREATE TYPE public.iptv_kind AS ENUM ('none','xtream','m3u','both');
CREATE TYPE public.iptv_stream_kind AS ENUM ('live','vod','series');

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS iptv_mode public.iptv_mode NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS iptv_interval_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS iptv_username text,
  ADD COLUMN IF NOT EXISTS iptv_password text,
  ADD COLUMN IF NOT EXISTS iptv_detected public.iptv_kind NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS iptv_sample_size integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS iptv_stream_tests boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS last_iptv_sync_at timestamptz;

CREATE TABLE public.iptv_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  mode public.iptv_mode NOT NULL DEFAULT 'smart',
  synced_at timestamptz NOT NULL DEFAULT now(),
  api_ms integer,
  login_ok boolean,
  json_valid boolean,
  channels integer,
  movies integer,
  series integer,
  categories integer,
  m3u_channels integer,
  m3u_groups integer,
  m3u_bytes integer,
  playlist_ok boolean,
  latency_ms integer,
  health_score integer,
  fastest_region text,
  slowest_region text,
  avg_region_ms integer,
  ip text,
  asn text,
  datacenter text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_syncs_server_time ON public.iptv_syncs(server_id, synced_at DESC);
GRANT SELECT ON public.iptv_syncs TO authenticated;
GRANT ALL ON public.iptv_syncs TO service_role;
ALTER TABLE public.iptv_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads iptv syncs" ON public.iptv_syncs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.iptv_stream_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  sync_id uuid REFERENCES public.iptv_syncs(id) ON DELETE CASCADE,
  kind public.iptv_stream_kind NOT NULL,
  label text,
  ok boolean NOT NULL DEFAULT false,
  start_ms integer,
  total_ms integer,
  bitrate_kbps integer,
  resolution text,
  codec text,
  buffer_ms integer,
  error text,
  tested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_stream_tests_server_time ON public.iptv_stream_tests(server_id, tested_at DESC);
GRANT SELECT ON public.iptv_stream_tests TO authenticated;
GRANT ALL ON public.iptv_stream_tests TO service_role;
ALTER TABLE public.iptv_stream_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads iptv stream tests" ON public.iptv_stream_tests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.iptv_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  detail text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_alerts_server_time ON public.iptv_alerts(server_id, created_at DESC);
GRANT SELECT, UPDATE ON public.iptv_alerts TO authenticated;
GRANT ALL ON public.iptv_alerts TO service_role;
ALTER TABLE public.iptv_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads iptv alerts" ON public.iptv_alerts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "owner acks iptv alerts" ON public.iptv_alerts FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE TABLE public.iptv_ip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  old_ip text,
  new_ip text,
  old_asn text,
  new_asn text,
  datacenter text,
  country text,
  city text,
  isp text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_ip_history_server_time ON public.iptv_ip_history(server_id, changed_at DESC);
GRANT SELECT ON public.iptv_ip_history TO authenticated;
GRANT ALL ON public.iptv_ip_history TO service_role;
ALTER TABLE public.iptv_ip_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads ip history" ON public.iptv_ip_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS kuma_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kuma_http_id integer,
  ADD COLUMN IF NOT EXISTS kuma_ping_id integer,
  ADD COLUMN IF NOT EXISTS kuma_dns_id integer,
  ADD COLUMN IF NOT EXISTS kuma_tcp_id integer,
  ADD COLUMN IF NOT EXISTS kuma_api_id integer,
  ADD COLUMN IF NOT EXISTS kuma_ssl_id integer,
  ADD COLUMN IF NOT EXISTS kuma_tcp_port integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS kuma_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS kuma_error text;

CREATE TABLE IF NOT EXISTS public.kuma_monitor_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  monitor_id integer,
  status text NOT NULL DEFAULT 'pending',
  active boolean NOT NULL DEFAULT true,
  uptime_24h numeric,
  uptime_7d numeric,
  uptime_30d numeric,
  latency_ms integer,
  avg_latency_ms integer,
  last_check_at timestamptz,
  last_down_started_at timestamptz,
  last_down_duration_s integer,
  resolved_ip text,
  cert_days_remaining integer,
  cert_expires_at timestamptz,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, kind)
);

GRANT SELECT ON public.kuma_monitor_status TO authenticated;
GRANT ALL ON public.kuma_monitor_status TO service_role;
ALTER TABLE public.kuma_monitor_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read kuma status" ON public.kuma_monitor_status FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TRIGGER trg_kuma_status_touch BEFORE UPDATE ON public.kuma_monitor_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.kuma_heartbeats (
  id bigserial PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ok boolean NOT NULL,
  latency_ms integer,
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kuma_hb_server_time ON public.kuma_heartbeats (server_id, kind, checked_at DESC);
GRANT SELECT ON public.kuma_heartbeats TO authenticated;
GRANT ALL ON public.kuma_heartbeats TO service_role;
ALTER TABLE public.kuma_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read kuma heartbeats" ON public.kuma_heartbeats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.kuma_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_s integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kuma_inc_server ON public.kuma_incidents (server_id, started_at DESC);
GRANT SELECT ON public.kuma_incidents TO authenticated;
GRANT ALL ON public.kuma_incidents TO service_role;
ALTER TABLE public.kuma_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read kuma incidents" ON public.kuma_incidents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));-- Config columns on servers
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS dns_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dns_interval_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_dns_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS dns_health_score integer;

-- Snapshots
CREATE TABLE public.dns_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  health_score integer,
  resolvers jsonb NOT NULL DEFAULT '[]'::jsonb,
  consistent boolean,
  resolved_ok integer NOT NULL DEFAULT 0,
  resolver_count integer NOT NULL DEFAULT 0,
  avg_response_ms integer,
  min_response_ms integer,
  max_response_ms integer,
  propagation_pct integer,
  propagation jsonb NOT NULL DEFAULT '[]'::jsonb,
  records jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_ip text,
  ipv4 text[],
  ipv6 text[],
  nameservers text[],
  ttl_seconds integer,
  dnssec boolean,
  cloudflare_proxy boolean,
  asn text,
  org text,
  country text,
  city text,
  datacenter text,
  domain_expires_at timestamptz,
  registrar text,
  status text NOT NULL DEFAULT 'ok',
  diagnosis text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dns_snapshots_server_time ON public.dns_snapshots(server_id, checked_at DESC);

GRANT SELECT ON public.dns_snapshots TO authenticated;
GRANT ALL ON public.dns_snapshots TO service_role;
ALTER TABLE public.dns_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dns_snapshots_owner_select" ON public.dns_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- IP history
CREATE TABLE public.dns_ip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  old_ip text,
  new_ip text,
  old_asn text,
  new_asn text,
  record_type text NOT NULL DEFAULT 'A',
  seconds_since_previous integer,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dns_ip_history_server_time ON public.dns_ip_history(server_id, changed_at DESC);

GRANT SELECT ON public.dns_ip_history TO authenticated;
GRANT ALL ON public.dns_ip_history TO service_role;
ALTER TABLE public.dns_ip_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dns_ip_history_owner_select" ON public.dns_ip_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- Alerts
CREATE TABLE public.dns_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  detail text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dns_alerts_server_time ON public.dns_alerts(server_id, created_at DESC);

GRANT SELECT, UPDATE ON public.dns_alerts TO authenticated;
GRANT ALL ON public.dns_alerts TO service_role;
ALTER TABLE public.dns_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dns_alerts_owner_select" ON public.dns_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "dns_alerts_owner_ack" ON public.dns_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;

-- Marca como usado quem já possui assinatura (evita reativar teste)
UPDATE public.profiles p SET trial_used = true
WHERE EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id);

CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE referral_code = upper(trim(_code))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_referral_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.activate_free_trial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  used boolean;
  exp timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT trial_used INTO used FROM public.profiles WHERE id = uid;
  IF used IS NULL THEN RAISE EXCEPTION 'perfil não encontrado'; END IF;
  IF used THEN RAISE EXCEPTION 'O teste gratuito já foi utilizado nesta conta.'; END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = uid) THEN
    UPDATE public.profiles SET trial_used = true WHERE id = uid;
    RAISE EXCEPTION 'O teste gratuito já foi utilizado nesta conta.';
  END IF;

  exp := now() + interval '1 day';

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (uid, 'trial', 'trial', now(), exp);

  UPDATE public.profiles SET trial_used = true WHERE id = uid;

  UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = uid AND status = 'pending';

  RETURN jsonb_build_object('expires_at', exp);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_free_trial() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  my_code text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT id INTO referrer FROM public.profiles
      WHERE referral_code = upper(ref_code) LIMIT 1;
    IF referrer = new.id THEN referrer := NULL; END IF;
  END IF;

  -- Código de indicação válido é obrigatório (exceto para o primeiro usuário / admin inicial)
  IF referrer IS NULL AND NOT is_first THEN
    RAISE EXCEPTION 'Código de indicação inválido ou ausente.';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.referral_code = upper(trim(_code))
      AND public.subscription_is_active(p.id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  my_code text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT p.id INTO referrer
    FROM public.profiles p
    WHERE p.referral_code = upper(ref_code)
      AND public.subscription_is_active(p.id)
    LIMIT 1;
    IF referrer = new.id THEN referrer := NULL; END IF;
  END IF;

  -- Código válido e painel ativo do indicador são obrigatórios,
  -- exceto para o primeiro usuário / admin inicial.
  IF referrer IS NULL AND NOT is_first THEN
    RAISE EXCEPTION 'Código de indicação inválido ou indicador sem painel ativo.';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;ALTER TABLE public.iptv_syncs
  ADD COLUMN IF NOT EXISTS login_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS diagnostics jsonb;CREATE OR REPLACE FUNCTION public.finalize_approved_payment(_payment_id uuid, _provider_payment_id text, _raw_payload jsonb, _paid_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
BEGIN
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    applied := false; user_id := v_user_id; plan := v_plan; expires_at := v_expires;
    RETURN NEXT;
    RETURN;
  END IF;

  duration := CASE pay.plan
    WHEN 'yearly'::public.plan_type THEN interval '365 days'
    ELSE interval '31 days'
  END;

  INSERT INTO public.subscriptions AS s (user_id, plan, status, started_at, expires_at, cancelled_at)
  VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration, null)
  ON CONFLICT (user_id) DO UPDATE
  SET plan = EXCLUDED.plan,
      status = 'active'::public.subscription_status,
      expires_at = GREATEST(s.expires_at, _paid_at) + duration,
      cancelled_at = null
  RETURNING s.expires_at INTO v_expires;

  applied := true;
  user_id := pay.user_id;
  plan := pay.plan;
  expires_at := v_expires;
  RETURN NEXT;
END;
$function$;CREATE OR REPLACE FUNCTION public.finalize_approved_payment(_payment_id uuid, _provider_payment_id text, _raw_payload jsonb, _paid_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
BEGIN
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

  duration := CASE pay.plan
    WHEN 'yearly'::public.plan_type THEN interval '365 days'
    ELSE interval '31 days'
  END;

  UPDATE public.subscriptions s
  SET plan = pay.plan,
      status = 'active'::public.subscription_status,
      expires_at = GREATEST(s.expires_at, _paid_at) + duration,
      cancelled_at = null
  WHERE s.user_id = pay.user_id
  RETURNING s.expires_at INTO v_expires;

  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
    VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration)
    RETURNING public.subscriptions.expires_at INTO v_expires;
  END IF;

  RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
END;
$function$;CREATE TABLE public.iptv_login_attempts (
  server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  failures integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_failure_at timestamptz,
  blocked_until timestamptz,
  last_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iptv_login_attempts TO authenticated;
GRANT ALL ON public.iptv_login_attempts TO service_role;

ALTER TABLE public.iptv_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view login attempts of their servers"
ON public.iptv_login_attempts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE TRIGGER iptv_login_attempts_touch
BEFORE UPDATE ON public.iptv_login_attempts
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE OR REPLACE FUNCTION public.get_iptv_ranking(_limit int DEFAULT 100)
RETURNS TABLE(
  server_id uuid, name text, health_score int, channels int, movies int, series int,
  categories int, latency_ms int, api_ms int, synced_at timestamptz, is_mine boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (s.id)
      s.id AS sid, s.name AS sname, s.owner_id AS sowner,
      y.health_score AS hs, y.channels AS ch, y.movies AS mv, y.series AS se,
      y.categories AS ca, y.latency_ms AS lat, y.api_ms AS api, y.synced_at AS sa,
      y.login_ok AS lok, y.json_valid AS jok, y.error AS err
    FROM public.servers s
    JOIN public.iptv_syncs y ON y.server_id = s.id
    WHERE y.synced_at > now() - interval '48 hours'
    ORDER BY s.id, y.synced_at DESC
  )
  SELECT sid, sname, hs, ch, mv, se, ca, lat, api, sa, (sowner = auth.uid())
  FROM latest
  WHERE lok IS TRUE AND jok IS TRUE AND err IS NULL AND hs IS NOT NULL
  ORDER BY hs DESC NULLS LAST, ch DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

CREATE OR REPLACE FUNCTION public.get_iptv_server_rank(_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = _server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH r AS (SELECT * FROM public.get_iptv_ranking(200)),
  ranked AS (SELECT *, row_number() OVER (ORDER BY health_score DESC, channels DESC NULLS LAST) AS pos FROM r),
  agg AS (
    SELECT COUNT(*)::int AS total,
           AVG(COALESCE(channels,0)) AS avg_ch, AVG(COALESCE(movies,0)) AS avg_mv,
           AVG(COALESCE(series,0)) AS avg_se, AVG(NULLIF(latency_ms,0)) AS avg_lat,
           AVG(health_score) AS avg_hs
    FROM r
  )
  SELECT jsonb_build_object(
    'position', k.pos,
    'total', a.total,
    'health_score', k.health_score,
    'channels', k.channels, 'movies', k.movies, 'series', k.series, 'categories', k.categories,
    'latency_ms', k.latency_ms, 'api_ms', k.api_ms,
    'avg_channels', ROUND(COALESCE(a.avg_ch,0)), 'avg_movies', ROUND(COALESCE(a.avg_mv,0)),
    'avg_series', ROUND(COALESCE(a.avg_se,0)), 'avg_latency_ms', ROUND(COALESCE(a.avg_lat,0)),
    'avg_health', ROUND(COALESCE(a.avg_hs,0)),
    'content_vs_avg_pct', CASE
      WHEN COALESCE(a.avg_ch,0) + COALESCE(a.avg_mv,0) + COALESCE(a.avg_se,0) = 0 THEN NULL
      ELSE ROUND(((COALESCE(k.channels,0)+COALESCE(k.movies,0)+COALESCE(k.series,0))
        / NULLIF(a.avg_ch + a.avg_mv + a.avg_se,0) - 1) * 100)
    END
  ) INTO res
  FROM ranked k CROSS JOIN agg a
  WHERE k.server_id = _server_id;

  IF res IS NULL THEN
    RETURN jsonb_build_object('position', NULL, 'total', (SELECT COUNT(*) FROM public.get_iptv_ranking(200)));
  END IF;
  RETURN res;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_iptv_ranking(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_iptv_server_rank(uuid) TO authenticated;
-- ============ Catálogo IPTV ============
CREATE TABLE public.iptv_catalog_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind iptv_stream_kind NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  title_key text NOT NULL,
  category text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, kind, external_id)
);
GRANT SELECT ON public.iptv_catalog_items TO authenticated;
GRANT ALL ON public.iptv_catalog_items TO service_role;
ALTER TABLE public.iptv_catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own catalog" ON public.iptv_catalog_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE INDEX idx_catalog_items_server_kind ON public.iptv_catalog_items(server_id, kind);
CREATE INDEX idx_catalog_items_titlekey ON public.iptv_catalog_items(kind, title_key);
CREATE INDEX idx_catalog_items_first_seen ON public.iptv_catalog_items(first_seen_at DESC);

CREATE TRIGGER trg_catalog_items_touch BEFORE UPDATE ON public.iptv_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Mudanças do catálogo ============
CREATE TABLE public.iptv_catalog_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind iptv_stream_kind NOT NULL,
  action text NOT NULL CHECK (action IN ('added','removed')),
  external_id text,
  name text NOT NULL,
  category text,
  detected_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.iptv_catalog_changes TO authenticated;
GRANT ALL ON public.iptv_catalog_changes TO service_role;
ALTER TABLE public.iptv_catalog_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own catalog changes" ON public.iptv_catalog_changes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE INDEX idx_catalog_changes_server_time ON public.iptv_catalog_changes(server_id, detected_at DESC);
CREATE INDEX idx_catalog_changes_time ON public.iptv_catalog_changes(detected_at DESC);

-- ============ Histórico diário ============
CREATE TABLE public.iptv_catalog_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  day date NOT NULL,
  channels integer NOT NULL DEFAULT 0,
  movies integer NOT NULL DEFAULT 0,
  series integer NOT NULL DEFAULT 0,
  added_channels integer NOT NULL DEFAULT 0,
  added_movies integer NOT NULL DEFAULT 0,
  added_series integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  sync_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, day)
);
GRANT SELECT ON public.iptv_catalog_daily TO authenticated;
GRANT ALL ON public.iptv_catalog_daily TO service_role;
ALTER TABLE public.iptv_catalog_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own catalog history" ON public.iptv_catalog_daily
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE TRIGGER trg_catalog_daily_touch BEFORE UPDATE ON public.iptv_catalog_daily
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Estado do catálogo no servidor ============
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS catalog_hash text,
  ADD COLUMN IF NOT EXISTS catalog_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_sync_ms integer;

-- ============ RPCs ============

-- Novidades do usuário logado
CREATE OR REPLACE FUNCTION public.iptv_novelties(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH mine AS (SELECT id, name FROM servers WHERE owner_id = auth.uid()),
  ch AS (
    SELECT c.*, m.name AS server_name FROM iptv_catalog_changes c
    JOIN mine m ON m.id = c.server_id
    WHERE c.detected_at >= now() - make_interval(hours => GREATEST(_hours,1))
  )
  SELECT jsonb_build_object(
    'added_movies',   (SELECT count(*) FROM ch WHERE action='added' AND kind='vod'),
    'added_series',   (SELECT count(*) FROM ch WHERE action='added' AND kind='series'),
    'added_channels', (SELECT count(*) FROM ch WHERE action='added' AND kind='live'),
    'removed',        (SELECT count(*) FROM ch WHERE action='removed'),
    'items', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT server_name, kind::text AS kind, action, name, category, detected_at
        FROM ch ORDER BY detected_at DESC LIMIT 200
      ) x), '[]'::jsonb)
  );
$$;

-- Ranking de atualização (todos os servidores monitorados, apenas nome)
CREATE OR REPLACE FUNCTION public.iptv_update_ranking(_days integer DEFAULT 7, _limit integer DEFAULT 20)
RETURNS TABLE(server_id uuid, name text, added_movies bigint, added_series bigint, added_channels bigint, added_total bigint, is_mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.name,
    count(*) FILTER (WHERE c.kind='vod'),
    count(*) FILTER (WHERE c.kind='series'),
    count(*) FILTER (WHERE c.kind='live'),
    count(*),
    s.owner_id = auth.uid()
  FROM iptv_catalog_changes c
  JOIN servers s ON s.id = c.server_id
  WHERE c.action='added' AND c.detected_at >= now() - make_interval(days => GREATEST(_days,1))
  GROUP BY s.id, s.name, s.owner_id
  ORDER BY count(*) DESC
  LIMIT GREATEST(_limit,1);
$$;

-- Quem adicionou primeiro (entre servidores monitorados)
CREATE OR REPLACE FUNCTION public.iptv_first_detected(_kind text DEFAULT 'vod', _days integer DEFAULT 14, _limit integer DEFAULT 20)
RETURNS TABLE(title_key text, title text, kind text, servers jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH recent AS (
    SELECT i.title_key, i.kind, min(i.name) AS title, i.server_id, min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE i.kind::text = _kind
      AND i.first_seen_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY i.title_key, i.kind, i.server_id
  ), multi AS (
    SELECT title_key FROM recent GROUP BY title_key HAVING count(DISTINCT server_id) > 1
  )
  SELECT r.title_key, min(r.title), _kind,
    jsonb_agg(jsonb_build_object('server_name', s.name, 'seen_at', r.seen_at) ORDER BY r.seen_at)
  FROM recent r
  JOIN multi m ON m.title_key = r.title_key
  JOIN servers s ON s.id = r.server_id
  GROUP BY r.title_key
  ORDER BY min(r.seen_at) DESC
  LIMIT GREATEST(_limit,1);
$$;

-- Comparativo entre servidores
CREATE OR REPLACE FUNCTION public.iptv_server_comparison(_limit integer DEFAULT 100)
RETURNS TABLE(
  server_id uuid, name text, channels integer, movies integer, series integer,
  health_score integer, latency_ms integer, synced_at timestamptz,
  growth_7d bigint, removed_7d bigint, is_mine boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH last_sync AS (
    SELECT DISTINCT ON (server_id) server_id, channels, movies, series, health_score, latency_ms, synced_at
    FROM iptv_syncs
    WHERE synced_at >= now() - interval '48 hours' AND login_ok
    ORDER BY server_id, synced_at DESC
  ), growth AS (
    SELECT server_id,
      count(*) FILTER (WHERE action='added') AS added,
      count(*) FILTER (WHERE action='removed') AS removed
    FROM iptv_catalog_changes
    WHERE detected_at >= now() - interval '7 days'
    GROUP BY server_id
  )
  SELECT s.id, s.name, l.channels, l.movies, l.series, l.health_score, l.latency_ms, l.synced_at,
         COALESCE(g.added,0), COALESCE(g.removed,0), s.owner_id = auth.uid()
  FROM last_sync l
  JOIN servers s ON s.id = l.server_id
  LEFT JOIN growth g ON g.server_id = s.id
  ORDER BY COALESCE(l.health_score,0) DESC
  LIMIT GREATEST(_limit,1);
$$;

GRANT EXECUTE ON FUNCTION public.iptv_novelties(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_server_comparison(integer) TO authenticated;REVOKE EXECUTE ON FUNCTION public.iptv_novelties(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.iptv_server_comparison(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iptv_novelties(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_server_comparison(integer) TO authenticated;-- Índices para acelerar buscas de catálogo
CREATE INDEX IF NOT EXISTS idx_iptv_catalog_items_title_key
  ON public.iptv_catalog_items (title_key) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_iptv_catalog_items_server_kind
  ON public.iptv_catalog_items (server_id, kind, removed_at);

-- Detector de Filmes: busca um título entre todos os servidores monitorados
-- e mostra quem tem, quem não tem, e quem detectou primeiro.
CREATE OR REPLACE FUNCTION public.iptv_find_title(_query text, _kind text DEFAULT 'vod', _limit integer DEFAULT 20)
RETURNS TABLE(
  title_key text,
  title text,
  kind text,
  server_count bigint,
  first_server text,
  first_seen_at timestamptz,
  mine_has boolean,
  servers jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT lower(regexp_replace(trim(coalesce(_query,'')), '[^a-zA-Z0-9]+', ' ', 'g')) AS term
  ),
  hits AS (
    SELECT i.title_key,
           min(i.name) AS title,
           i.server_id,
           min(i.first_seen_at) AS seen_at
    FROM public.iptv_catalog_items i, q
    WHERE i.removed_at IS NULL
      AND i.kind::text = _kind
      AND length(q.term) >= 2
      AND i.title_key LIKE '%' || q.term || '%'
    GROUP BY i.title_key, i.server_id
  ),
  joined AS (
    SELECT h.*, s.name AS server_name, (s.owner_id = auth.uid()) AS is_mine
    FROM hits h JOIN public.servers s ON s.id = h.server_id
  )
  SELECT j.title_key,
         min(j.title),
         _kind,
         count(DISTINCT j.server_id),
         (array_agg(j.server_name ORDER BY j.seen_at))[1],
         min(j.seen_at),
         bool_or(j.is_mine),
         jsonb_agg(jsonb_build_object(
           'server_name', j.server_name,
           'seen_at', j.seen_at,
           'is_mine', j.is_mine
         ) ORDER BY j.seen_at)
  FROM joined j
  GROUP BY j.title_key
  ORDER BY min(j.seen_at) DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) TO authenticated;REVOKE EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) TO authenticated, service_role;CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  my_code text;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  my_code := public.generate_referral_code();
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    SELECT p.id INTO referrer
    FROM public.profiles p
    WHERE p.referral_code = upper(ref_code)
      AND public.subscription_is_active(p.id)
    LIMIT 1;
    IF referrer = new.id THEN referrer := NULL; END IF;

    -- Código informado precisa ser válido; sem código a conta é criada
    -- normalmente, porém sem direito ao teste gratuito.
    IF referrer IS NULL AND NOT is_first THEN
      RAISE EXCEPTION 'Código de indicação inválido ou indicador sem painel ativo.';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_free_trial()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  used boolean;
  ref uuid;
  exp timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT trial_used, referred_by INTO used, ref FROM public.profiles WHERE id = uid;
  IF used IS NULL THEN RAISE EXCEPTION 'perfil não encontrado'; END IF;
  IF ref IS NULL THEN
    RAISE EXCEPTION 'O teste gratuito está disponível apenas para contas criadas com um código de indicação. Assine um plano para liberar o acesso.';
  END IF;
  IF used THEN RAISE EXCEPTION 'O teste gratuito já foi utilizado nesta conta.'; END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = uid) THEN
    UPDATE public.profiles SET trial_used = true WHERE id = uid;
    RAISE EXCEPTION 'O teste gratuito já foi utilizado nesta conta.';
  END IF;

  exp := now() + interval '1 day';

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (uid, 'trial', 'trial', now(), exp);

  UPDATE public.profiles SET trial_used = true WHERE id = uid;

  UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = uid AND status = 'pending';

  RETURN jsonb_build_object('expires_at', exp);
END;
$function$;-- servers: split owner ALL into read/update/delete + gated insert
DROP POLICY IF EXISTS "servers: owner all" ON public.servers;
CREATE POLICY "servers: owner select" ON public.servers FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "servers: owner update" ON public.servers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "servers: owner delete" ON public.servers FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "servers: owner insert active sub" ON public.servers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (public.subscription_is_active(auth.uid()) OR public.has_role(auth.uid(), 'admin')));

-- alert_channels: same treatment
DROP POLICY IF EXISTS "alerts: owner all" ON public.alert_channels;
CREATE POLICY "alerts: owner select" ON public.alert_channels FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "alerts: owner update" ON public.alert_channels FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "alerts: owner delete" ON public.alert_channels FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "alerts: owner insert active sub" ON public.alert_channels FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (public.subscription_is_active(auth.uid()) OR public.has_role(auth.uid(), 'admin')));
CREATE OR REPLACE FUNCTION public.delete_server(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE _owner uuid;
BEGIN
  SELECT owner_id INTO _owner FROM public.servers WHERE id = _id;
  IF _owner IS NULL THEN RETURN false; END IF;
  IF _owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.iptv_catalog_items WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_changes WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_daily WHERE server_id = _id;
  DELETE FROM public.iptv_stream_tests WHERE server_id = _id;
  DELETE FROM public.iptv_syncs WHERE server_id = _id;
  DELETE FROM public.iptv_alerts WHERE server_id = _id;
  DELETE FROM public.iptv_ip_history WHERE server_id = _id;
  DELETE FROM public.iptv_login_attempts WHERE server_id = _id;
  DELETE FROM public.dns_snapshots WHERE server_id = _id;
  DELETE FROM public.dns_ip_history WHERE server_id = _id;
  DELETE FROM public.dns_alerts WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats WHERE server_id = _id;
  DELETE FROM public.kuma_incidents WHERE server_id = _id;
  DELETE FROM public.kuma_monitor_status WHERE server_id = _id;
  DELETE FROM public.region_checks WHERE server_id = _id;
  DELETE FROM public.checks WHERE server_id = _id;
  DELETE FROM public.notifications_log WHERE server_id = _id;
  DELETE FROM public.incidents WHERE server_id = _id;
  DELETE FROM public.user_achievements WHERE server_id = _id;
  DELETE FROM public.server_analysis WHERE server_id = _id;
  DELETE FROM public.servers WHERE id = _id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_server(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_server(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_subscription(_user_id uuid, _plan plan_type, _days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _base timestamptz; _new timestamptz; _sub public.subscriptions;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _days IS NULL OR _days = 0 THEN RAISE EXCEPTION 'invalid days'; END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE user_id = _user_id ORDER BY expires_at DESC LIMIT 1;

  _base := GREATEST(COALESCE(_sub.expires_at, now()), now());
  _new := _base + (_days || ' days')::interval;

  IF _sub.id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
    VALUES (_user_id, _plan, 'active', now(), _new);
  ELSE
    UPDATE public.subscriptions
      SET plan = _plan,
          status = CASE WHEN _new > now() THEN 'active'::subscription_status ELSE 'expired'::subscription_status END,
          expires_at = _new,
          cancelled_at = NULL,
          updated_at = now()
      WHERE id = _sub.id;
  END IF;

  RETURN jsonb_build_object('expires_at', _new, 'plan', _plan);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_subscription(uuid, plan_type, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, plan_type, integer) TO authenticated;
CREATE TABLE public.reseller_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  tagline text NOT NULL DEFAULT '🚀 Seu entretenimento completo em um só lugar',
  intro text,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#22c55e',
  accent_color text NOT NULL DEFAULT '#0ea5e9',
  whatsapp text,
  telegram text,
  show_servers boolean NOT NULL DEFAULT true,
  show_dns boolean NOT NULL DEFAULT true,
  show_novidades boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_pages_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_pages TO authenticated;
GRANT ALL ON public.reseller_pages TO service_role;

ALTER TABLE public.reseller_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own page" ON public.reseller_pages
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owner creates own page" ON public.reseller_pages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner updates own page" ON public.reseller_pages
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner deletes own page" ON public.reseller_pages
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER reseller_pages_touch BEFORE UPDATE ON public.reseller_pages
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS show_on_reseller_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_dns_label text,
  ADD COLUMN IF NOT EXISTS public_display_name text;

CREATE OR REPLACE FUNCTION public.get_reseller_page(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pg public.reseller_pages%ROWTYPE;
  srv jsonb;
  news jsonb;
BEGIN
  SELECT * INTO pg FROM public.reseller_pages WHERE slug = lower(_slug) AND published = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO srv
  FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'name', COALESCE(s.public_display_name, s.name),
      'status', s.current_status,
      'health', COALESCE(s.health_score, s.dns_health_score),
      'latency_ms', s.last_latency_ms,
      'last_checked_at', s.last_checked_at,
      'dns', s.public_dns_label
    ) AS x
    FROM public.servers s
    WHERE s.owner_id = pg.owner_id AND s.show_on_reseller_page = true
  ) q;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'detected_at' DESC), '[]'::jsonb) INTO news
  FROM (
    SELECT jsonb_build_object(
      'kind', c.kind,
      'name', c.name,
      'category', c.category,
      'detected_at', c.detected_at
    ) AS y
    FROM public.iptv_catalog_changes c
    JOIN public.servers s ON s.id = c.server_id
    WHERE s.owner_id = pg.owner_id
      AND s.show_on_reseller_page = true
      AND c.action = 'added'
      AND c.detected_at > now() - interval '7 days'
    ORDER BY c.detected_at DESC
    LIMIT 60
  ) q2;

  RETURN jsonb_build_object(
    'page', jsonb_build_object(
      'slug', pg.slug,
      'display_name', pg.display_name,
      'tagline', pg.tagline,
      'intro', pg.intro,
      'logo_url', pg.logo_url,
      'primary_color', pg.primary_color,
      'accent_color', pg.accent_color,
      'whatsapp', pg.whatsapp,
      'telegram', pg.telegram,
      'show_servers', pg.show_servers,
      'show_dns', pg.show_dns,
      'show_novidades', pg.show_novidades
    ),
    'servers', COALESCE(srv, '[]'::jsonb),
    'news', COALESCE(news, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reseller_page(text) TO anon, authenticated;CREATE TABLE public.art_generations (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid not null,
  server_name text not null,
  total_new integer not null default 0,
  movies jsonb not null default '[]'::jsonb,
  series jsonb not null default '[]'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  period_hours integer not null default 24,
  created_at timestamptz not null default now()
);
CREATE INDEX art_generations_server_idx ON public.art_generations(server_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.art_generations TO authenticated;
GRANT ALL ON public.art_generations TO service_role;
ALTER TABLE public.art_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage art generations" ON public.art_generations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));INSERT INTO public.achievements (code, emoji, title, description)
VALUES ('yearly_subscriber', '👑', 'Assinante Anual', 'Assinou o plano anual do Stream Monitor')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  granted int := 0;
  s record;
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid() THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Assinante anual
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND plan = 'yearly'::public.plan_type
      AND status IN ('active','trial') AND expires_at > now()
  ) THEN
    INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
    VALUES (_user_id, 'yearly_subscriber', NULL)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN granted := granted + 1; END IF;
  END IF;

  FOR s IN SELECT id, created_at, ssl_days_remaining FROM public.servers WHERE owner_id = _user_id LOOP
    IF s.created_at < now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.incidents i
         WHERE i.server_id = s.id AND i.started_at > now() - interval '30 days'
       )
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'no_incidents_30d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    IF s.created_at < now() - interval '100 days' THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'monitoring_100d', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    IF (SELECT AVG(latency_ms) FROM public.checks
        WHERE server_id = s.id AND checked_at > now() - interval '24 hours' AND latency_ms IS NOT NULL) < 100
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'low_latency', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;

    IF s.created_at < now() - interval '60 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.checks c
         WHERE c.server_id = s.id
           AND c.checked_at > now() - interval '60 days'
           AND c.ssl_days_remaining IS NOT NULL
           AND c.ssl_days_remaining <= 0
       )
       AND s.ssl_days_remaining IS NOT NULL AND s.ssl_days_remaining > 0
    THEN
      INSERT INTO public.user_achievements (user_id, achievement_code, server_id)
      VALUES (_user_id, 'ssl_always_valid', s.id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN granted := granted + 1; END IF;
    END IF;
  END LOOP;

  RETURN granted;
END;
$function$;-- 1) DUPLICATE / REDUNDANT INDEX CLEANUP -------------------------------------
DROP INDEX IF EXISTS public.idx_region_checks_server_region_time;
DROP INDEX IF EXISTS public.region_checks_server_region_time_idx;
DROP INDEX IF EXISTS public.idx_iptv_catalog_items_server_kind;
DROP INDEX IF EXISTS public.idx_iptv_catalog_items_title_key;

-- 2) SETTINGS -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage settings" ON public.app_settings;
CREATE POLICY "admins manage settings" ON public.app_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_settings(key, value) VALUES
  ('retention', '{"detail_days":30,"hourly_days":90,"daily_days":730}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) ROLLUP TABLES ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checks_hourly (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  hour timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  degraded integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  min_latency_ms integer,
  ssl_days_remaining integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, hour)
);
GRANT SELECT ON public.checks_hourly TO authenticated;
GRANT ALL ON public.checks_hourly TO service_role;
ALTER TABLE public.checks_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads checks_hourly" ON public.checks_hourly;
CREATE POLICY "owner reads checks_hourly" ON public.checks_hourly FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.checks_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  day date NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  degraded integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  uptime_pct numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, day)
);
GRANT SELECT ON public.checks_daily TO authenticated;
GRANT ALL ON public.checks_daily TO service_role;
ALTER TABLE public.checks_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads checks_daily" ON public.checks_daily;
CREATE POLICY "owner reads checks_daily" ON public.checks_daily FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.region_checks_hourly (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  region_code text NOT NULL,
  hour timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, region_code, hour)
);
GRANT SELECT ON public.region_checks_hourly TO authenticated;
GRANT ALL ON public.region_checks_hourly TO service_role;
ALTER TABLE public.region_checks_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads region_checks_hourly" ON public.region_checks_hourly;
CREATE POLICY "owner reads region_checks_hourly" ON public.region_checks_hourly FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.kuma_heartbeats_hourly (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  hour timestamptz NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, kind, hour)
);
GRANT SELECT ON public.kuma_heartbeats_hourly TO authenticated;
GRANT ALL ON public.kuma_heartbeats_hourly TO service_role;
ALTER TABLE public.kuma_heartbeats_hourly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads kuma_hourly" ON public.kuma_heartbeats_hourly;
CREATE POLICY "owner reads kuma_hourly" ON public.kuma_heartbeats_hourly FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.kuma_heartbeats_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  day date NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ok_count integer NOT NULL DEFAULT 0,
  uptime_pct numeric(5,2),
  avg_latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, kind, day)
);
GRANT SELECT ON public.kuma_heartbeats_daily TO authenticated;
GRANT ALL ON public.kuma_heartbeats_daily TO service_role;
ALTER TABLE public.kuma_heartbeats_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner reads kuma_daily" ON public.kuma_heartbeats_daily;
CREATE POLICY "owner reads kuma_daily" ON public.kuma_heartbeats_daily FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- 4) ROLLUP FUNCTION ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollup_metrics(_hours integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  since timestamptz := date_trunc('hour', now()) - make_interval(hours => GREATEST(_hours,1));
  a int; b int; c int; d int; e int;
BEGIN
  INSERT INTO public.checks_hourly (server_id, hour, total, ups, degraded, downs, avg_latency_ms, max_latency_ms, min_latency_ms, ssl_days_remaining)
  SELECT server_id, date_trunc('hour', checked_at), count(*),
         count(*) FILTER (WHERE status='up'), count(*) FILTER (WHERE status='degraded'), count(*) FILTER (WHERE status='down'),
         round(avg(latency_ms))::int, max(latency_ms), min(latency_ms), max(ssl_days_remaining)
  FROM public.checks WHERE checked_at >= since
  GROUP BY 1,2
  ON CONFLICT (server_id, hour) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, degraded=EXCLUDED.degraded, downs=EXCLUDED.downs,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms,
    min_latency_ms=EXCLUDED.min_latency_ms, ssl_days_remaining=EXCLUDED.ssl_days_remaining;
  GET DIAGNOSTICS a = ROW_COUNT;

  INSERT INTO public.checks_daily (server_id, day, total, ups, degraded, downs, avg_latency_ms, max_latency_ms, uptime_pct)
  SELECT server_id, hour::date, sum(total), sum(ups), sum(degraded), sum(downs),
         round(avg(avg_latency_ms))::int, max(max_latency_ms),
         round((sum(ups)::numeric / NULLIF(sum(total),0)) * 100, 2)
  FROM public.checks_hourly WHERE hour >= since - interval '1 day'
  GROUP BY 1,2
  ON CONFLICT (server_id, day) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, degraded=EXCLUDED.degraded, downs=EXCLUDED.downs,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms, uptime_pct=EXCLUDED.uptime_pct;
  GET DIAGNOSTICS b = ROW_COUNT;

  INSERT INTO public.region_checks_hourly (server_id, region_code, hour, total, ups, downs, avg_latency_ms, max_latency_ms)
  SELECT server_id, region_code, date_trunc('hour', checked_at), count(*),
         count(*) FILTER (WHERE status='up'), count(*) FILTER (WHERE status<>'up'),
         round(avg(latency_ms))::int, max(latency_ms)
  FROM public.region_checks WHERE checked_at >= since
  GROUP BY 1,2,3
  ON CONFLICT (server_id, region_code, hour) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, downs=EXCLUDED.downs,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms;
  GET DIAGNOSTICS c = ROW_COUNT;

  INSERT INTO public.kuma_heartbeats_hourly (server_id, kind, hour, total, ok_count, avg_latency_ms, max_latency_ms)
  SELECT server_id, kind, date_trunc('hour', checked_at), count(*), count(*) FILTER (WHERE ok),
         round(avg(latency_ms))::int, max(latency_ms)
  FROM public.kuma_heartbeats WHERE checked_at >= since
  GROUP BY 1,2,3
  ON CONFLICT (server_id, kind, hour) DO UPDATE SET
    total=EXCLUDED.total, ok_count=EXCLUDED.ok_count,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms;
  GET DIAGNOSTICS d = ROW_COUNT;

  INSERT INTO public.kuma_heartbeats_daily (server_id, kind, day, total, ok_count, uptime_pct, avg_latency_ms)
  SELECT server_id, kind, hour::date, sum(total), sum(ok_count),
         round((sum(ok_count)::numeric / NULLIF(sum(total),0)) * 100, 2), round(avg(avg_latency_ms))::int
  FROM public.kuma_heartbeats_hourly WHERE hour >= since - interval '1 day'
  GROUP BY 1,2,3
  ON CONFLICT (server_id, kind, day) DO UPDATE SET
    total=EXCLUDED.total, ok_count=EXCLUDED.ok_count, uptime_pct=EXCLUDED.uptime_pct, avg_latency_ms=EXCLUDED.avg_latency_ms;
  GET DIAGNOSTICS e = ROW_COUNT;

  RETURN jsonb_build_object('checks_hourly',a,'checks_daily',b,'region_hourly',c,'kuma_hourly',d,'kuma_daily',e);
END; $$;

-- 5) RETENTION (dry-run capable, never touches incidents/alerts/catalog) ------
CREATE OR REPLACE FUNCTION public.purge_old_metrics(_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg jsonb;
  detail_days int; hourly_days int; daily_days int;
  cut_detail timestamptz; cut_hourly timestamptz; cut_daily date;
  n_checks bigint; n_region bigint; n_kuma bigint; n_dns bigint;
  n_h1 bigint; n_h2 bigint; n_h3 bigint; n_d1 bigint; n_d2 bigint;
BEGIN
  SELECT value INTO cfg FROM public.app_settings WHERE key='retention';
  detail_days := COALESCE((cfg->>'detail_days')::int, 30);
  hourly_days := COALESCE((cfg->>'hourly_days')::int, 90);
  daily_days  := COALESCE((cfg->>'daily_days')::int, 730);
  cut_detail := now() - make_interval(days => detail_days);
  cut_hourly := now() - make_interval(days => hourly_days);
  cut_daily  := (now() - make_interval(days => daily_days))::date;

  -- safety: only purge detail that has already been rolled up
  PERFORM public.rollup_metrics(GREATEST(detail_days * 24, 24));

  SELECT count(*) INTO n_checks FROM public.checks WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_region FROM public.region_checks WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_kuma   FROM public.kuma_heartbeats WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_dns    FROM public.dns_snapshots WHERE checked_at < cut_detail;
  SELECT count(*) INTO n_h1 FROM public.checks_hourly WHERE hour < cut_hourly;
  SELECT count(*) INTO n_h2 FROM public.region_checks_hourly WHERE hour < cut_hourly;
  SELECT count(*) INTO n_h3 FROM public.kuma_heartbeats_hourly WHERE hour < cut_hourly;
  SELECT count(*) INTO n_d1 FROM public.checks_daily WHERE day < cut_daily;
  SELECT count(*) INTO n_d2 FROM public.kuma_heartbeats_daily WHERE day < cut_daily;

  IF NOT _dry_run THEN
    DELETE FROM public.checks WHERE checked_at < cut_detail;
    DELETE FROM public.region_checks WHERE checked_at < cut_detail;
    DELETE FROM public.kuma_heartbeats WHERE checked_at < cut_detail;
    DELETE FROM public.dns_snapshots WHERE checked_at < cut_detail;
    DELETE FROM public.checks_hourly WHERE hour < cut_hourly;
    DELETE FROM public.region_checks_hourly WHERE hour < cut_hourly;
    DELETE FROM public.kuma_heartbeats_hourly WHERE hour < cut_hourly;
    DELETE FROM public.checks_daily WHERE day < cut_daily;
    DELETE FROM public.kuma_heartbeats_daily WHERE day < cut_daily;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', _dry_run,
    'cutoff_detail', cut_detail, 'cutoff_hourly', cut_hourly, 'cutoff_daily', cut_daily,
    'checks', n_checks, 'region_checks', n_region, 'kuma_heartbeats', n_kuma, 'dns_snapshots', n_dns,
    'checks_hourly', n_h1, 'region_checks_hourly', n_h2, 'kuma_heartbeats_hourly', n_h3,
    'checks_daily', n_d1, 'kuma_heartbeats_daily', n_d2
  );
END; $$;

-- 6) STORAGE MONITORING -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_storage_report()
RETURNS TABLE(table_name text, rows bigint, total_bytes bigint, total_pretty text, index_pretty text, inserts bigint, updates bigint, deletes bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.relname::text, s.n_live_tup, pg_total_relation_size(c.oid),
         pg_size_pretty(pg_total_relation_size(c.oid)), pg_size_pretty(pg_indexes_size(c.oid)),
         s.n_tup_ins, s.n_tup_upd, s.n_tup_del
  FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid
  WHERE s.schemaname = 'public'
  ORDER BY pg_total_relation_size(c.oid) DESC;
END; $$;

-- 7) SCHEDULES ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('rollup-metrics-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='rollup-metrics-hourly');
SELECT cron.unschedule('purge-old-metrics-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='purge-old-metrics-daily');
SELECT cron.schedule('rollup-metrics-hourly', '5 * * * *', $$ SELECT public.rollup_metrics(3); $$);
SELECT cron.schedule('purge-old-metrics-daily', '0 4 * * *', $$ SELECT public.purge_old_metrics(false); $$);REVOKE ALL ON FUNCTION public.rollup_metrics(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_metrics(boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_storage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollup_metrics(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_metrics(boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_report() TO authenticated, service_role;CREATE TABLE IF NOT EXISTS public.telegram_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL DEFAULT now(),
  had_news boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_digests_user_sent ON public.telegram_digests (user_id, sent_at DESC);

GRANT SELECT ON public.telegram_digests TO authenticated;
GRANT ALL ON public.telegram_digests TO service_role;

ALTER TABLE public.telegram_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own digests" ON public.telegram_digests
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
-- ============ monitored_contents ============
CREATE TYPE public.content_status AS ENUM ('unknown','online','slow','unstable','offline','blocked','removed');
CREATE TYPE public.content_kind AS ENUM ('live','movie','series','episode');

CREATE TABLE public.monitored_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  reseller_id uuid NOT NULL,
  external_content_id text NOT NULL,
  content_type public.content_kind NOT NULL,
  name text NOT NULL,
  category_name text,
  cover_url text,
  container_ext text,
  parent_external_id text,
  season_number integer,
  episode_number integer,
  stream_url_encrypted text,
  current_status public.content_status NOT NULL DEFAULT 'unknown',
  is_favorite boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 5,
  consecutive_failures integer NOT NULL DEFAULT 0,
  response_time_ms integer,
  http_status integer,
  last_error text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_online_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, content_type, external_content_id)
);
CREATE INDEX idx_mc_server_status ON public.monitored_contents(server_id, current_status);
CREATE INDEX idx_mc_queue ON public.monitored_contents(server_id, last_checked_at NULLS FIRST);
CREATE INDEX idx_mc_reseller ON public.monitored_contents(reseller_id);

GRANT SELECT, UPDATE ON public.monitored_contents TO authenticated;
GRANT ALL ON public.monitored_contents TO service_role;
ALTER TABLE public.monitored_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own contents select" ON public.monitored_contents FOR SELECT TO authenticated
  USING (reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own contents update" ON public.monitored_contents FOR UPDATE TO authenticated
  USING (reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ============ content_checks ============
CREATE TABLE public.content_checks (
  id bigserial PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES public.monitored_contents(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  status public.content_status NOT NULL,
  http_status integer,
  response_time_ms integer,
  first_byte_time_ms integer,
  bytes_received integer,
  detected_format text,
  region text NOT NULL DEFAULT 'origin',
  error_message text,
  manual boolean NOT NULL DEFAULT false,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_content_time ON public.content_checks(content_id, checked_at DESC);
CREATE INDEX idx_cc_server_time ON public.content_checks(server_id, checked_at DESC);

GRANT SELECT ON public.content_checks TO authenticated;
GRANT ALL ON public.content_checks TO service_role;
ALTER TABLE public.content_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own checks select" ON public.content_checks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = content_checks.server_id
    AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- ============ content_alert_settings ============
CREATE TABLE public.content_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  notify_movies boolean NOT NULL DEFAULT true,
  notify_series boolean NOT NULL DEFAULT true,
  notify_channels boolean NOT NULL DEFAULT true,
  notify_recovery boolean NOT NULL DEFAULT true,
  notify_only_favorites boolean NOT NULL DEFAULT false,
  minimum_failures integer NOT NULL DEFAULT 3,
  telegram_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, server_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_alert_settings TO authenticated;
GRANT ALL ON public.content_alert_settings TO service_role;
ALTER TABLE public.content_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alert settings" ON public.content_alert_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());

-- ============ content_daily_summary ============
CREATE TABLE public.content_daily_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  summary_date date NOT NULL,
  total_contents integer NOT NULL DEFAULT 0,
  online_count integer NOT NULL DEFAULT 0,
  offline_count integer NOT NULL DEFAULT 0,
  unstable_count integer NOT NULL DEFAULT 0,
  slow_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  removed_count integer NOT NULL DEFAULT 0,
  recovered_count integer NOT NULL DEFAULT 0,
  average_response_time integer,
  health_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, summary_date)
);
GRANT SELECT ON public.content_daily_summary TO authenticated;
GRANT ALL ON public.content_daily_summary TO service_role;
ALTER TABLE public.content_daily_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own summary select" ON public.content_daily_summary FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = content_daily_summary.server_id
    AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- ============ content_scan_runs (auditoria / falha geral) ============
CREATE TABLE public.content_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  tested integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  recovered integer NOT NULL DEFAULT 0,
  general_failure boolean NOT NULL DEFAULT false,
  triggered_by uuid,
  note text
);
CREATE INDEX idx_csr_server_time ON public.content_scan_runs(server_id, started_at DESC);
GRANT SELECT ON public.content_scan_runs TO authenticated;
GRANT ALL ON public.content_scan_runs TO service_role;
ALTER TABLE public.content_scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs select" ON public.content_scan_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = content_scan_runs.server_id
    AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- updated_at triggers
CREATE TRIGGER trg_mc_touch BEFORE UPDATE ON public.monitored_contents
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_cas_touch BEFORE UPDATE ON public.content_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_cds_touch BEFORE UPDATE ON public.content_daily_summary
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ dashboard RPC ============
CREATE OR REPLACE FUNCTION public.content_health_overview(_server_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'online', COUNT(*) FILTER (WHERE current_status='online'),
    'slow', COUNT(*) FILTER (WHERE current_status='slow'),
    'unstable', COUNT(*) FILTER (WHERE current_status='unstable'),
    'offline', COUNT(*) FILTER (WHERE current_status='offline'),
    'blocked', COUNT(*) FILTER (WHERE current_status='blocked'),
    'removed', COUNT(*) FILTER (WHERE current_status='removed'),
    'unknown', COUNT(*) FILTER (WHERE current_status='unknown'),
    'avg_ms', ROUND(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL)),
    'last_checked_at', MAX(last_checked_at)
  ) INTO res
  FROM public.monitored_contents mc
  WHERE (mc.reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    AND (_server_id IS NULL OR mc.server_id = _server_id);
  RETURN COALESCE(res, '{}'::jsonb);
END; $$;

-- ============ retenção ============
CREATE OR REPLACE FUNCTION public.purge_content_checks(_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.content_checks WHERE checked_at < now() - make_interval(days => GREATEST(_days,7));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
ALTER TYPE public.content_status ADD VALUE IF NOT EXISTS 'suspect';CREATE OR REPLACE FUNCTION public.content_health_overview(_server_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'online', COUNT(*) FILTER (WHERE current_status='online'),
    'slow', COUNT(*) FILTER (WHERE current_status='slow'),
    'suspect', COUNT(*) FILTER (WHERE current_status='suspect'),
    'unstable', COUNT(*) FILTER (WHERE current_status='unstable'),
    'offline', COUNT(*) FILTER (WHERE current_status='offline'),
    'blocked', COUNT(*) FILTER (WHERE current_status='blocked'),
    'removed', COUNT(*) FILTER (WHERE current_status='removed'),
    'unknown', COUNT(*) FILTER (WHERE current_status='unknown'),
    'avg_ms', ROUND(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL)),
    'last_checked_at', MAX(last_checked_at)
  ) INTO res
  FROM public.monitored_contents mc
  WHERE (mc.reseller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    AND (_server_id IS NULL OR mc.server_id = _server_id);
  RETURN COALESCE(res, '{}'::jsonb);
END; $$;CREATE OR REPLACE FUNCTION public.iptv_recent_titles(_kind text DEFAULT 'all', _limit integer DEFAULT 40, _offset integer DEFAULT 0, _order text DEFAULT 'new')
RETURNS TABLE(title_key text, title text, kind text, first_seen_at timestamptz, server_count integer, first_server text, mine_has boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH base AS (
    SELECT i.title_key, i.kind::text AS kind, min(i.name) AS title, i.server_id,
           min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE (_kind = 'all' OR i.kind::text = _kind)
      AND i.removed_at IS NULL
    GROUP BY i.title_key, i.kind, i.server_id
  ), agg AS (
    SELECT b.title_key, min(b.title) AS title, min(b.kind) AS kind,
           min(b.seen_at) AS first_seen_at,
           count(DISTINCT b.server_id)::int AS server_count,
           bool_or(s.owner_id = auth.uid()) AS mine_has,
           (array_agg(s.name ORDER BY b.seen_at))[1] AS first_server
    FROM base b JOIN servers s ON s.id = b.server_id
    GROUP BY b.title_key
  )
  SELECT title_key, title, kind, first_seen_at, server_count, first_server, mine_has
  FROM agg
  ORDER BY CASE WHEN _order = 'old' THEN first_seen_at END ASC,
           CASE WHEN _order <> 'old' THEN first_seen_at END DESC
  LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0);
$$;

CREATE OR REPLACE FUNCTION public.iptv_title_servers(_title_key text)
RETURNS TABLE(server_name text, seen_at timestamptz, is_mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.name, min(i.first_seen_at) AS seen_at, bool_or(s.owner_id = auth.uid())
  FROM iptv_catalog_items i JOIN servers s ON s.id = i.server_id
  WHERE i.title_key = _title_key AND i.removed_at IS NULL
  GROUP BY s.id, s.name
  ORDER BY 2 ASC;
$$;

GRANT EXECUTE ON FUNCTION public.iptv_recent_titles(text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_title_servers(text) TO authenticated;REVOKE EXECUTE ON FUNCTION public.iptv_recent_titles(text,integer,integer,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.iptv_title_servers(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.iptv_recent_titles(text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_title_servers(text) TO authenticated;CREATE TABLE public.tmdb_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('movie','tv')),
  tmdb_id integer NOT NULL,
  title text NOT NULL,
  poster_path text,
  release_date date,
  title_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_type, tmdb_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tmdb_follows TO authenticated;
GRANT ALL ON public.tmdb_follows TO service_role;

ALTER TABLE public.tmdb_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tmdb follows" ON public.tmdb_follows
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_tmdb_follows_touch
  BEFORE UPDATE ON public.tmdb_follows
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE INDEX idx_tmdb_follows_user ON public.tmdb_follows (user_id, created_at DESC);-- Helpers de mascaramento (não expõem dados de outros usuários ao navegador)
CREATE OR REPLACE FUNCTION public.mask_server_id(_id uuid, _owner uuid)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _owner = auth.uid() THEN _id
              ELSE md5(_id::text || 'sm-mask-v1')::uuid END;
$$;

CREATE OR REPLACE FUNCTION public.mask_server_name(_id uuid, _owner uuid, _name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _owner = auth.uid() THEN _name
              ELSE 'Servidor ' || upper(substr(md5(_id::text || 'sm-mask-v1'), 1, 5)) END;
$$;

GRANT EXECUTE ON FUNCTION public.mask_server_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_name(uuid, uuid, text) TO authenticated;

-- Ranking IPTV
CREATE OR REPLACE FUNCTION public.get_iptv_ranking(_limit integer DEFAULT 100)
 RETURNS TABLE(server_id uuid, name text, health_score integer, channels integer, movies integer, series integer, categories integer, latency_ms integer, api_ms integer, synced_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH latest AS (
    SELECT DISTINCT ON (s.id)
      s.id AS sid, s.name AS sname, s.owner_id AS sowner,
      y.health_score AS hs, y.channels AS ch, y.movies AS mv, y.series AS se,
      y.categories AS ca, y.latency_ms AS lat, y.api_ms AS api, y.synced_at AS sa,
      y.login_ok AS lok, y.json_valid AS jok, y.error AS err
    FROM public.servers s
    JOIN public.iptv_syncs y ON y.server_id = s.id
    WHERE y.synced_at > now() - interval '48 hours'
    ORDER BY s.id, y.synced_at DESC
  )
  SELECT public.mask_server_id(sid, sowner),
         public.mask_server_name(sid, sowner, sname),
         hs, ch, mv, se, ca, lat, api, sa, (sowner = auth.uid())
  FROM latest
  WHERE lok IS TRUE AND jok IS TRUE AND err IS NULL AND hs IS NOT NULL
  ORDER BY hs DESC NULLS LAST, ch DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$function$;

-- Ranking de instabilidade (só nome mascarado + métricas agregadas)
CREATE OR REPLACE FUNCTION public.get_stability_ranking(_limit integer DEFAULT 20)
 RETURNS TABLE(name text, avg_latency_ms numeric, max_latency_ms integer, down_count bigint, total_checks bigint, instability_score numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.mask_server_name(s.id, s.owner_id, s.name),
    ROUND(AVG(c.latency_ms)::numeric, 0),
    COALESCE(MAX(c.latency_ms), 0)::int,
    COUNT(*) FILTER (WHERE c.status <> 'up'),
    COUNT(*),
    ROUND(
      (COUNT(*) FILTER (WHERE c.status <> 'up')::numeric / NULLIF(COUNT(*),0)) * 100
      + (COALESCE(AVG(c.latency_ms), 0) / 100), 2)
  FROM public.checks c
  JOIN public.servers s ON s.id = c.server_id
  WHERE c.checked_at > now() - interval '24 hours'
  GROUP BY s.id, s.name, s.owner_id
  HAVING COUNT(*) >= 3
  ORDER BY 6 DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 100));
$function$;

-- Comparativo de servidores
CREATE OR REPLACE FUNCTION public.iptv_server_comparison(_limit integer DEFAULT 100)
 RETURNS TABLE(server_id uuid, name text, channels integer, movies integer, series integer, health_score integer, latency_ms integer, synced_at timestamp with time zone, growth_7d bigint, removed_7d bigint, is_mine boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH last_sync AS (
    SELECT DISTINCT ON (server_id) server_id, channels, movies, series, health_score, latency_ms, synced_at
    FROM iptv_syncs
    WHERE synced_at >= now() - interval '48 hours' AND login_ok
    ORDER BY server_id, synced_at DESC
  ), growth AS (
    SELECT server_id,
      count(*) FILTER (WHERE action='added') AS added,
      count(*) FILTER (WHERE action='removed') AS removed
    FROM iptv_catalog_changes
    WHERE detected_at >= now() - interval '7 days'
    GROUP BY server_id
  )
  SELECT public.mask_server_id(s.id, s.owner_id),
         public.mask_server_name(s.id, s.owner_id, s.name),
         l.channels, l.movies, l.series, l.health_score, l.latency_ms, l.synced_at,
         COALESCE(g.added,0), COALESCE(g.removed,0), s.owner_id = auth.uid()
  FROM last_sync l
  JOIN servers s ON s.id = l.server_id
  LEFT JOIN growth g ON g.server_id = s.id
  ORDER BY COALESCE(l.health_score,0) DESC
  LIMIT GREATEST(_limit,1);
$function$;

-- Conteúdos recentes
CREATE OR REPLACE FUNCTION public.iptv_recent_titles(_kind text DEFAULT 'all'::text, _limit integer DEFAULT 40, _offset integer DEFAULT 0, _order text DEFAULT 'new'::text)
 RETURNS TABLE(title_key text, title text, kind text, first_seen_at timestamp with time zone, server_count integer, first_server text, mine_has boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT i.title_key, i.kind::text AS kind, min(i.name) AS title, i.server_id,
           min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE (_kind = 'all' OR i.kind::text = _kind) AND i.removed_at IS NULL
    GROUP BY i.title_key, i.kind, i.server_id
  ), agg AS (
    SELECT b.title_key, min(b.title) AS title, min(b.kind) AS kind,
           min(b.seen_at) AS first_seen_at,
           count(DISTINCT b.server_id)::int AS server_count,
           bool_or(s.owner_id = auth.uid()) AS mine_has,
           (array_agg(public.mask_server_name(s.id, s.owner_id, s.name) ORDER BY b.seen_at))[1] AS first_server
    FROM base b JOIN servers s ON s.id = b.server_id
    GROUP BY b.title_key
  )
  SELECT title_key, title, kind, first_seen_at, server_count, first_server, mine_has
  FROM agg
  ORDER BY CASE WHEN _order = 'old' THEN first_seen_at END ASC,
           CASE WHEN _order <> 'old' THEN first_seen_at END DESC
  LIMIT GREATEST(_limit,1) OFFSET GREATEST(_offset,0);
$function$;

-- Servidores que possuem um título
CREATE OR REPLACE FUNCTION public.iptv_title_servers(_title_key text)
 RETURNS TABLE(server_name text, seen_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.mask_server_name(s.id, s.owner_id, s.name), min(i.first_seen_at), bool_or(s.owner_id = auth.uid())
  FROM iptv_catalog_items i JOIN servers s ON s.id = i.server_id
  WHERE i.title_key = _title_key AND i.removed_at IS NULL
  GROUP BY s.id, s.name, s.owner_id
  ORDER BY 2 ASC;
$function$;

-- Busca de títulos
CREATE OR REPLACE FUNCTION public.iptv_find_title(_query text, _kind text DEFAULT 'vod'::text, _limit integer DEFAULT 20)
 RETURNS TABLE(title_key text, title text, kind text, server_count bigint, first_server text, first_seen_at timestamp with time zone, mine_has boolean, servers jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT lower(regexp_replace(trim(coalesce(_query,'')), '[^a-zA-Z0-9]+', ' ', 'g')) AS term
  ),
  hits AS (
    SELECT i.title_key, min(i.name) AS title, i.server_id, min(i.first_seen_at) AS seen_at
    FROM public.iptv_catalog_items i, q
    WHERE i.removed_at IS NULL AND i.kind::text = _kind
      AND length(q.term) >= 2 AND i.title_key LIKE '%' || q.term || '%'
    GROUP BY i.title_key, i.server_id
  ),
  joined AS (
    SELECT h.*, public.mask_server_name(s.id, s.owner_id, s.name) AS server_name,
           (s.owner_id = auth.uid()) AS is_mine
    FROM hits h JOIN public.servers s ON s.id = h.server_id
  )
  SELECT j.title_key, min(j.title), _kind, count(DISTINCT j.server_id),
         (array_agg(j.server_name ORDER BY j.seen_at))[1], min(j.seen_at), bool_or(j.is_mine),
         jsonb_agg(jsonb_build_object('server_name', j.server_name, 'seen_at', j.seen_at, 'is_mine', j.is_mine) ORDER BY j.seen_at)
  FROM joined j
  GROUP BY j.title_key
  ORDER BY min(j.seen_at) DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$function$;

-- Quem detectou primeiro
CREATE OR REPLACE FUNCTION public.iptv_first_detected(_kind text DEFAULT 'vod'::text, _days integer DEFAULT 14, _limit integer DEFAULT 20)
 RETURNS TABLE(title_key text, title text, kind text, servers jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH recent AS (
    SELECT i.title_key, i.kind, min(i.name) AS title, i.server_id, min(i.first_seen_at) AS seen_at
    FROM iptv_catalog_items i
    WHERE i.kind::text = _kind
      AND i.first_seen_at >= now() - make_interval(days => GREATEST(_days,1))
    GROUP BY i.title_key, i.kind, i.server_id
  ), multi AS (
    SELECT title_key FROM recent GROUP BY title_key HAVING count(DISTINCT server_id) > 1
  )
  SELECT r.title_key, min(r.title), _kind,
    jsonb_agg(jsonb_build_object(
      'server_name', public.mask_server_name(s.id, s.owner_id, s.name),
      'seen_at', r.seen_at) ORDER BY r.seen_at)
  FROM recent r
  JOIN multi m ON m.title_key = r.title_key
  JOIN servers s ON s.id = r.server_id
  GROUP BY r.title_key
  ORDER BY min(r.seen_at) DESC
  LIMIT GREATEST(_limit,1);
$function$;CREATE OR REPLACE FUNCTION public.get_iptv_ranking(_limit integer DEFAULT 100)
 RETURNS TABLE(server_id uuid, name text, health_score integer, channels integer, movies integer, series integer, categories integer, latency_ms integer, api_ms integer, synced_at timestamp with time zone, is_mine boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH latest AS (
    SELECT DISTINCT ON (s.id)
      s.id AS sid, s.name AS sname, s.owner_id AS sowner,
      y.health_score AS hs, y.channels AS ch, y.movies AS mv, y.series AS se,
      y.categories AS ca, y.latency_ms AS lat, y.api_ms AS api, y.synced_at AS sa,
      y.login_ok AS lok, y.json_valid AS jok, y.error AS err
    FROM public.servers s
    JOIN public.iptv_syncs y ON y.server_id = s.id
    WHERE y.synced_at > now() - interval '48 hours'
    ORDER BY s.id, y.synced_at DESC
  )
  SELECT public.mask_server_id(sid, sowner),
         sname,
         hs, ch, mv, se, ca, lat, api, sa, (sowner = auth.uid())
  FROM latest
  WHERE lok IS TRUE AND jok IS TRUE AND err IS NULL AND hs IS NOT NULL
  ORDER BY hs DESC NULLS LAST, ch DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 200));
$function$;CREATE OR REPLACE FUNCTION public.delete_server(_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE _owner uuid;
BEGIN
  SELECT owner_id INTO _owner FROM public.servers WHERE id = _id;
  IF _owner IS NULL THEN RETURN false; END IF;
  IF _owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.content_checks WHERE server_id = _id;
  DELETE FROM public.monitored_contents WHERE server_id = _id;
  DELETE FROM public.content_scan_runs WHERE server_id = _id;
  DELETE FROM public.content_daily_summary WHERE server_id = _id;
  DELETE FROM public.content_alert_settings WHERE server_id = _id;
  DELETE FROM public.art_generations WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_items WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_changes WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_daily WHERE server_id = _id;
  DELETE FROM public.iptv_stream_tests WHERE server_id = _id;
  DELETE FROM public.iptv_syncs WHERE server_id = _id;
  DELETE FROM public.iptv_alerts WHERE server_id = _id;
  DELETE FROM public.iptv_ip_history WHERE server_id = _id;
  DELETE FROM public.iptv_login_attempts WHERE server_id = _id;
  DELETE FROM public.dns_snapshots WHERE server_id = _id;
  DELETE FROM public.dns_ip_history WHERE server_id = _id;
  DELETE FROM public.dns_alerts WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats_hourly WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats_daily WHERE server_id = _id;
  DELETE FROM public.kuma_incidents WHERE server_id = _id;
  DELETE FROM public.kuma_monitor_status WHERE server_id = _id;
  DELETE FROM public.region_checks WHERE server_id = _id;
  DELETE FROM public.region_checks_hourly WHERE server_id = _id;
  DELETE FROM public.checks WHERE server_id = _id;
  DELETE FROM public.checks_hourly WHERE server_id = _id;
  DELETE FROM public.checks_daily WHERE server_id = _id;
  DELETE FROM public.notifications_log WHERE server_id = _id;
  DELETE FROM public.incidents WHERE server_id = _id;
  DELETE FROM public.user_achievements WHERE server_id = _id;
  DELETE FROM public.server_analysis WHERE server_id = _id;
  DELETE FROM public.servers WHERE id = _id;
  RETURN true;
END;
$function$;-- 1) Revoke anon EXECUTE on non-public SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.activate_free_trial() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, public.plan_type, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.content_health_overview(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_server(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_iptv_ranking(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_iptv_server_rank(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_region_stats(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workers_health() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hub_recompute_rating(uuid) FROM anon;

-- 2) Maintenance functions: system/admin only
REVOKE EXECUTE ON FUNCTION public.purge_content_checks(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_metrics(boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollup_metrics(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hub_recompute_rating(uuid) FROM authenticated;

-- 3) Trigger functions must not be directly callable
REVOKE EXECUTE ON FUNCTION public.tg_conversations_business_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_listings_rate_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_messages_flag_contact() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_profiles_create_hub_profile() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ratings_recompute() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_referral_reward() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_host() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_touch_updated_at() FROM anon, authenticated;

-- 4) Payment finalization is webhook/service only
REVOKE EXECUTE ON FUNCTION public.finalize_approved_payment(uuid, text, jsonb, timestamptz) FROM anon, authenticated;DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Funções do painel: apenas usuários autenticados
GRANT EXECUTE ON FUNCTION public.activate_free_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, public.plan_type, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_health_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_server(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_achievements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_iptv_ranking(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_iptv_server_rank(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_region_stats(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workers_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stability_ranking(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hub_get_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hub_start_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_find_title(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_first_detected(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_novelties(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_recent_titles(text, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_server_comparison(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_title_servers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iptv_update_ranking(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_name(uuid, uuid, text) TO authenticated;

-- Funções realmente públicas
GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_dns_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reseller_page(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_referral_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mask_server_id(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mask_server_name(uuid, uuid, text) TO anon;-- 1) Remove a possibilidade de o próprio usuário criar sua assinatura (auto-liberação de acesso pago)
DROP POLICY IF EXISTS "subs: user inserts own" ON public.subscriptions;

-- 2) Cobranças criadas pelo usuário devem sempre nascer pendentes
DROP POLICY IF EXISTS "pay: user inserts own" ON public.payments;
CREATE POLICY "pay: user inserts own pending"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'::public.payment_status
  AND paid_at IS NULL
  AND amount_cents > 0
);CREATE OR REPLACE FUNCTION public.activate_free_trial()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  used boolean;
  ref uuid;
  my_phone text;
  dup boolean;
  exp timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT trial_used, referred_by, nullif(regexp_replace(coalesce(phone,''), '\D', '', 'g'), '')
    INTO used, ref, my_phone
    FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'perfil não encontrado'; END IF;

  IF used THEN
    RAISE EXCEPTION 'Você já ativou o teste gratuito nesta conta. Não é possível ativar novamente — o acesso só é liberado com o pagamento de um plano.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = uid) THEN
    UPDATE public.profiles SET trial_used = true WHERE id = uid;
    RAISE EXCEPTION 'Você já ativou o teste gratuito nesta conta. Não é possível ativar novamente — o acesso só é liberado com o pagamento de um plano.';
  END IF;

  IF my_phone IS NOT NULL AND length(my_phone) >= 10 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> uid
        AND nullif(regexp_replace(coalesce(p.phone,''), '\D', '', 'g'), '') = my_phone
        AND (p.trial_used OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id))
    ) INTO dup;
    IF dup THEN
      UPDATE public.profiles SET trial_used = true WHERE id = uid;
      RAISE EXCEPTION 'Este telefone já utilizou o teste gratuito em outra conta. O teste é permitido apenas uma vez por pessoa — para continuar, assine um plano.';
    END IF;
  END IF;

  IF ref IS NULL THEN
    RAISE EXCEPTION 'O teste gratuito está disponível apenas para contas criadas com um código de indicação válido. Assine um plano para liberar o acesso.';
  END IF;

  exp := now() + interval '1 day';

  INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
  VALUES (uid, 'trial', 'trial', now(), exp);

  UPDATE public.profiles SET trial_used = true WHERE id = uid;

  UPDATE public.referrals SET status = 'trial_active'
    WHERE referred_id = uid AND status = 'pending';

  RETURN jsonb_build_object('expires_at', exp);
END;
$function$;CREATE TABLE public.iptv_alert_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  pending_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, kind)
);

GRANT SELECT ON public.iptv_alert_state TO authenticated;
GRANT ALL ON public.iptv_alert_state TO service_role;

ALTER TABLE public.iptv_alert_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their alert state"
ON public.iptv_alert_state FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = iptv_alert_state.server_id AND s.owner_id = auth.uid()));

CREATE TRIGGER trg_iptv_alert_state_touch
BEFORE UPDATE ON public.iptv_alert_state
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();-- 1) Daily per-region rollup
CREATE TABLE IF NOT EXISTS public.region_checks_daily (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  region_code text NOT NULL,
  day date NOT NULL,
  total integer NOT NULL DEFAULT 0,
  ups integer NOT NULL DEFAULT 0,
  downs integer NOT NULL DEFAULT 0,
  uptime_pct numeric,
  avg_latency_ms integer,
  max_latency_ms integer,
  downtime_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, region_code, day)
);

GRANT SELECT ON public.region_checks_daily TO authenticated;
GRANT ALL ON public.region_checks_daily TO service_role;

ALTER TABLE public.region_checks_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own region daily"
ON public.region_checks_daily FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- 2) Extra summary columns
ALTER TABLE public.checks_hourly ADD COLUMN IF NOT EXISTS first_detector_region text;
ALTER TABLE public.checks_daily ADD COLUMN IF NOT EXISTS incidents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_region_checks_server_time ON public.region_checks (server_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_checks_server_time ON public.checks (server_id, checked_at DESC);

-- 3) Shorter raw retention
UPDATE public.app_settings
SET value = jsonb_build_object('detail_days', 5, 'hourly_days', 90, 'daily_days', 730),
    updated_at = now()
WHERE key = 'retention';

-- 4) Extend rollups: region daily, first detector, incidents
CREATE OR REPLACE FUNCTION public.rollup_regional(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  since timestamptz := date_trunc('hour', now()) - make_interval(hours => GREATEST(_hours,1));
  a int; b int; c int;
BEGIN
  INSERT INTO public.region_checks_daily
    (server_id, region_code, day, total, ups, downs, uptime_pct, avg_latency_ms, max_latency_ms, downtime_minutes)
  SELECT server_id, region_code, hour::date, sum(total), sum(ups), sum(downs),
         round((sum(ups)::numeric / NULLIF(sum(total),0)) * 100, 2),
         round(avg(avg_latency_ms))::int, max(max_latency_ms),
         round((sum(downs)::numeric / NULLIF(sum(total),0)) * 1440)::int
  FROM public.region_checks_hourly
  WHERE hour >= since - interval '1 day'
  GROUP BY 1,2,3
  ON CONFLICT (server_id, region_code, day) DO UPDATE SET
    total=EXCLUDED.total, ups=EXCLUDED.ups, downs=EXCLUDED.downs, uptime_pct=EXCLUDED.uptime_pct,
    avg_latency_ms=EXCLUDED.avg_latency_ms, max_latency_ms=EXCLUDED.max_latency_ms,
    downtime_minutes=EXCLUDED.downtime_minutes;
  GET DIAGNOSTICS a = ROW_COUNT;

  UPDATE public.checks_hourly ch
  SET first_detector_region = f.region_code
  FROM (
    SELECT DISTINCT ON (rc.server_id, date_trunc('hour', rc.checked_at))
      rc.server_id, date_trunc('hour', rc.checked_at) AS hour, rc.region_code
    FROM public.region_checks rc
    WHERE rc.checked_at >= since AND rc.status = 'down'
    ORDER BY rc.server_id, date_trunc('hour', rc.checked_at), rc.checked_at ASC
  ) f
  WHERE ch.server_id = f.server_id AND ch.hour = f.hour
    AND ch.first_detector_region IS DISTINCT FROM f.region_code;
  GET DIAGNOSTICS b = ROW_COUNT;

  UPDATE public.checks_daily cd
  SET incidents = i.n
  FROM (
    SELECT server_id, started_at::date AS day, count(*)::int AS n
    FROM public.incidents
    WHERE started_at >= since - interval '1 day'
    GROUP BY 1,2
  ) i
  WHERE cd.server_id = i.server_id AND cd.day = i.day AND cd.incidents IS DISTINCT FROM i.n;
  GET DIAGNOSTICS c = ROW_COUNT;

  RETURN jsonb_build_object('region_daily', a, 'first_detector', b, 'incidents', c);
END; $$;

REVOKE ALL ON FUNCTION public.rollup_regional(integer) FROM PUBLIC, anon, authenticated;

-- 5) Consensus verdict with escalation rules
CREATE OR REPLACE FUNCTION public.region_consensus(_server_id uuid, _window_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total int := 0; downs int := 0; ups int := 0; degraded int := 0;
  verdict text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status='down'),
         count(*) FILTER (WHERE status='up'), count(*) FILTER (WHERE status='degraded')
    INTO total, downs, ups, degraded
  FROM (
    SELECT DISTINCT ON (rc.region_code) rc.region_code, rc.status::text AS status
    FROM public.region_checks rc
    WHERE rc.server_id = _server_id
      AND rc.status IN ('up','down','degraded')
      AND rc.checked_at > now() - make_interval(mins => GREATEST(_window_minutes, 1))
    ORDER BY rc.region_code, rc.checked_at DESC
  ) t;

  IF total = 0 THEN verdict := 'nodata';
  ELSIF downs = 0 AND degraded = 0 THEN verdict := 'up';
  ELSIF downs = 0 THEN verdict := 'investigating';
  -- Nunca confirmar offline com apenas 1 região reportando falha.
  ELSIF downs >= 2 AND downs * 2 > total THEN verdict := 'down';
  ELSIF downs >= 2 THEN verdict := 'possible_down';
  ELSE verdict := 'investigating';
  END IF;

  RETURN jsonb_build_object('total', total, 'down', downs, 'up', ups,
    'degraded', degraded, 'verdict', verdict);
END; $$;

-- 6) Full verdict + per-region detail for the dashboard
CREATE OR REPLACE FUNCTION public.get_region_verdict(_server_id uuid, _window_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cons jsonb;
  regs jsonb;
  avg_ms numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = _server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  cons := public.region_consensus(_server_id, _window_minutes);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', r.code, 'name', r.name, 'city', r.city, 'flag', r.flag,
    'status', COALESCE(c.status, 'nodata'), 'latency_ms', c.latency_ms,
    'http_status', c.http_status, 'error', c.error,
    'details', COALESCE(c.details, '{}'::jsonb),
    'source', c.source, 'checked_at', c.checked_at
  ) ORDER BY r.longitude), '[]'::jsonb),
  AVG(c.latency_ms)
  INTO regs, avg_ms
  FROM public.check_regions r
  LEFT JOIN LATERAL (
    SELECT rc.status::text AS status, rc.latency_ms, rc.http_status, rc.error,
           rc.details, rc.source, rc.checked_at
    FROM public.region_checks rc
    WHERE rc.server_id = _server_id AND rc.region_code = r.code
      AND rc.checked_at > now() - make_interval(mins => GREATEST(_window_minutes,1))
    ORDER BY rc.checked_at DESC LIMIT 1
  ) c ON true
  WHERE r.enabled;

  RETURN cons
    || jsonb_build_object('regions', regs, 'avg_latency_ms', round(COALESCE(avg_ms,0)));
END; $$;

REVOKE ALL ON FUNCTION public.get_region_verdict(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_region_verdict(uuid, integer) TO authenticated;

-- 7) Scheduled aggregation + purge
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('sm-rollup-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sm-purge-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('sm-rollup-hourly', '7 * * * *',
  $$ SELECT public.rollup_metrics(3); SELECT public.rollup_regional(3); $$);

SELECT cron.schedule('sm-purge-daily', '25 4 * * *',
  $$ SELECT public.purge_old_metrics(false); $$);SELECT public.rollup_metrics(48);

CREATE OR REPLACE FUNCTION public.get_region_series(_server_id uuid, _minutes integer DEFAULT 180, _limit integer DEFAULT 600)
RETURNS TABLE(region_code text, status text, latency_ms integer, http_status integer, error text, checked_at timestamptz, details jsonb, source text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rc.region_code, rc.status::text, rc.latency_ms, rc.http_status, rc.error, rc.checked_at,
         COALESCE(rc.details,'{}'::jsonb), COALESCE(rc.source,'worker')
  FROM public.region_checks rc
  JOIN public.servers s ON s.id = rc.server_id
  WHERE rc.server_id = _server_id
    AND rc.checked_at > now() - make_interval(mins => GREATEST(1, LEAST(_minutes, 1440)))
    AND (s.owner_id = auth.uid() OR s.is_public = true OR public.has_role(auth.uid(),'admin'))
  ORDER BY rc.checked_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
$$;

REVOKE ALL ON FUNCTION public.get_region_series(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_region_series(uuid, integer, integer) TO authenticated;ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS server_group text;

CREATE TABLE public.dns_correlation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  group_key text NOT NULL,
  failed_host text,
  verdict text NOT NULL,
  confidence integer NOT NULL DEFAULT 0,
  online_count integer NOT NULL DEFAULT 0,
  offline_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  related jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  recovery_seconds integer
);

GRANT SELECT ON public.dns_correlation_events TO authenticated;
GRANT ALL ON public.dns_correlation_events TO service_role;

ALTER TABLE public.dns_correlation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own correlation events"
ON public.dns_correlation_events FOR SELECT TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_dns_corr_server ON public.dns_correlation_events (server_id, created_at DESC);
CREATE INDEX idx_dns_corr_group_open ON public.dns_correlation_events (group_key, recovered_at);

CREATE OR REPLACE FUNCTION public.get_correlation_overview(_server_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _group text;
  _rows jsonb;
  _total int;
  _online int;
  _offline int;
  _degraded int;
  _verdict text;
BEGIN
  SELECT owner_id, coalesce(nullif(btrim(server_group), ''), name)
    INTO _owner, _group
  FROM servers WHERE id = _server_id;

  IF _owner IS NULL THEN RETURN NULL; END IF;
  IF _owner <> auth.uid() AND NOT has_role(auth.uid(), 'admin') THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'name', s.name,
           'status', s.current_status,
           'latency_ms', s.last_latency_ms,
           'checked_at', s.last_checked_at,
           'is_current', s.id = _server_id
         ) ORDER BY s.name), '[]'::jsonb),
         count(*)::int,
         count(*) FILTER (WHERE s.current_status = 'up')::int,
         count(*) FILTER (WHERE s.current_status = 'down')::int,
         count(*) FILTER (WHERE s.current_status = 'degraded')::int
    INTO _rows, _total, _online, _offline, _degraded
  FROM servers s
  WHERE s.owner_id = _owner
    AND coalesce(nullif(btrim(s.server_group), ''), s.name) = _group;

  _verdict := CASE
    WHEN _offline = 0 THEN 'healthy'
    WHEN _offline >= _total THEN 'server_down'
    WHEN _offline = 1 AND _total > 1 THEN 'isolated'
    ELSE 'partial'
  END;

  RETURN jsonb_build_object(
    'group', _group,
    'total', _total,
    'online', _online,
    'offline', _offline,
    'degraded', _degraded,
    'verdict', _verdict,
    'dns', _rows
  );
END;
$$;-- Add columns to profiles for credit system and hierarchy
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.profiles(id);

-- Tabela para planos personalizados de revendedores
CREATE TABLE IF NOT EXISTS public.reseller_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_plans TO authenticated;
GRANT ALL ON public.reseller_plans TO service_role;

ALTER TABLE public.reseller_plans ENABLE ROW LEVEL SECURITY;

-- Resellers can manage their own plans
CREATE POLICY "Resellers can manage their own plans"
ON public.reseller_plans
FOR ALL
TO authenticated
USING (reseller_id = auth.uid());

-- Users can see plans from their parent reseller
CREATE POLICY "Users can see plans from their reseller"
ON public.reseller_plans
FOR SELECT
TO authenticated
USING (reseller_id = (SELECT parent_id FROM public.profiles WHERE id = auth.uid()));

-- Tabela para histórico de créditos
CREATE TABLE IF NOT EXISTS public.credit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'purchase', 'use', 'admin_add'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.credit_history TO authenticated;
GRANT ALL ON public.credit_history TO service_role;

ALTER TABLE public.credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit history"
ON public.credit_history
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Function to process credit purchase (called by webhook)
CREATE OR REPLACE FUNCTION public.process_credit_purchase(p_user_id UUID, p_credits INTEGER, p_payment_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Add credits
    UPDATE public.profiles
    SET credits = credits + p_credits
    WHERE id = p_user_id;

    -- Log history
    INSERT INTO public.credit_history (user_id, amount, type, description)
    VALUES (p_user_id, p_credits, 'purchase', 'Compra de ' || p_credits || ' créditos (Pagamento: ' || p_payment_id || ')');
END;
$$;
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'credits_10';
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'credits_30';
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'credits_50';
-- Table to link payment plans to credit amounts
CREATE TABLE IF NOT EXISTS public.credit_pack_definitions (
    plan_id public.plan_type PRIMARY KEY,
    credits_amount INTEGER NOT NULL,
    price_cents INTEGER NOT NULL
);

INSERT INTO public.credit_pack_definitions (plan_id, credits_amount, price_cents)
VALUES 
    ('credits_10', 10, 12000),
    ('credits_30', 30, 30000),
    ('credits_50', 50, 40000)
ON CONFLICT (plan_id) DO UPDATE SET 
    credits_amount = EXCLUDED.credits_amount,
    price_cents = EXCLUDED.price_cents;

GRANT SELECT ON public.credit_pack_definitions TO authenticated;

-- Ensure triggers exist to handle credit pack approval
CREATE OR REPLACE FUNCTION public.handle_payment_approval()
RETURNS TRIGGER AS $$
DECLARE
    v_credits INTEGER;
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        -- Check if it's a credit pack
        SELECT credits_amount INTO v_credits
        FROM public.credit_pack_definitions
        WHERE plan_id = NEW.plan;

        IF FOUND THEN
            -- Add credits to user
            UPDATE public.profiles
            SET credits = COALESCE(credits, 0) + v_credits
            WHERE id = NEW.user_id;

            -- Log to history
            INSERT INTO public.credit_history (user_id, amount, type, description)
            VALUES (NEW.user_id, v_credits, 'purchase', 'Compra de ' || v_credits || ' créditos');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_approved_credits ON public.payments;
CREATE TRIGGER on_payment_approved_credits
    AFTER UPDATE ON public.payments
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
    EXECUTE FUNCTION public.handle_payment_approval();
-- Sub-reseller creation credit cost adjustment (1 -> 10)
-- No direct DB constraint change needed as logic is in server functions.

-- Add credit transfer function
CREATE OR REPLACE FUNCTION public.transfer_credits(
    _sender_id UUID,
    _recipient_id UUID,
    _amount INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_sender_credits INTEGER;
    v_recipient_parent_id UUID;
    v_sender_active BOOLEAN;
    v_sender_email TEXT;
    v_recipient_email TEXT;
    v_recipient_name TEXT;
    v_sender_name TEXT;
BEGIN
    -- 1. Validate amount
    IF _amount <= 0 THEN
        RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
    END IF;

    -- 2. Validate sender activity
    SELECT public.subscription_is_active(_sender_id) INTO v_sender_active;
    IF NOT v_sender_active THEN
        RAISE EXCEPTION 'Sua conta precisa estar ativa para transferir créditos.';
    END IF;

    -- 3. Check sender credits
    SELECT credits, email, full_name INTO v_sender_credits, v_sender_email, v_sender_name FROM public.profiles WHERE id = _sender_id;
    IF v_sender_credits < _amount THEN
        RAISE EXCEPTION 'Saldo insuficiente para a transferência.';
    END IF;

    -- 4. Verify recipient belongs to sender's network
    SELECT parent_id, email, full_name INTO v_recipient_parent_id, v_recipient_email, v_recipient_name FROM public.profiles WHERE id = _recipient_id;
    IF v_recipient_parent_id IS NULL OR v_recipient_parent_id != _sender_id THEN
        RAISE EXCEPTION 'Você só pode transferir créditos para revendedores da sua própria rede.';
    END IF;

    -- 5. Perform transfer
    UPDATE public.profiles SET credits = credits - _amount WHERE id = _sender_id;
    UPDATE public.profiles SET credits = credits + _amount WHERE id = _recipient_id;

    -- 6. Log history
    INSERT INTO public.credit_history (user_id, amount, type, description)
    VALUES 
        (_sender_id, -_amount, 'transfer_out', 'Envio para: ' || COALESCE(v_recipient_name, v_recipient_email)),
        (_recipient_id, _amount, 'transfer_in', 'Origem: ' || COALESCE(v_sender_name, v_sender_email));

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.transfer_credits(UUID, UUID, INTEGER) TO authenticated;
-- Add reseller_client_type if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_reseller') THEN
        ALTER TABLE public.profiles ADD COLUMN is_reseller BOOLEAN DEFAULT false;
    END IF;
END $$;
ALTER TYPE public.plan_type ADD VALUE 'credits_40';-- Fix: Parents need to see children's profiles
DROP POLICY IF EXISTS "profiles: parent reads children" ON public.profiles;
CREATE POLICY "profiles: parent reads children" ON public.profiles
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

-- Fix: ensure parents can update credits for children (needed for transfers)
DROP POLICY IF EXISTS "profiles: parent updates children credits" ON public.profiles;
CREATE POLICY "profiles: parent updates children credits" ON public.profiles
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Grant execute on has_role to authenticated role just in case
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

-- Ensure the admin functions are correctly granted
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp text;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Grant EXECUTE on all critical admin functions to ensure the 'authenticated' role can call them
-- The functions themselves have internal "IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden';" checks.

-- 1. Core Admin Functions
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_report() TO authenticated;

-- 2. Payout Management
GRANT EXECUTE ON FUNCTION public.admin_list_payout_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(uuid, text) TO authenticated;

-- 3. Subscription Management
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, public.plan_type, integer) TO authenticated;

-- 4. Ensure Role Check is accessible
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 5. Fix potential RLS issue for admin browsing profiles
DROP POLICY IF EXISTS "profiles: admin reads all" ON public.profiles;
CREATE POLICY "profiles: admin reads all" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. Ensure admin can see all subscriptions
DROP POLICY IF EXISTS "subs: admin reads all" ON public.subscriptions;
CREATE POLICY "subs: admin reads all" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  is_first boolean;
  ref_code text;
  referrer uuid;
  my_code text;
  is_ref_admin boolean;
BEGIN
  -- Check if this is the first user
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  -- Generate referral code for the new user
  my_code := public.generate_referral_code();
  
  -- Check if a referral code was provided in metadata
  ref_code := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');

  IF ref_code IS NOT NULL THEN
    -- Find the referrer profile
    SELECT p.id INTO referrer
    FROM public.profiles p
    WHERE p.referral_code = upper(ref_code)
    LIMIT 1;

    IF referrer IS NOT NULL THEN
      -- Check if referrer is an admin
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = referrer AND role = 'admin'
      ) INTO is_ref_admin;

      -- If not admin, check if subscription is active
      IF NOT is_ref_admin AND NOT public.subscription_is_active(referrer) THEN
        referrer := NULL;
      END IF;
    END IF;

    -- Avoid self-referral
    IF referrer = new.id THEN referrer := NULL; END IF;

    -- If code was provided but no valid referrer found, and it's not the first user, throw error
    IF referrer IS NULL AND NOT is_first THEN
      RAISE EXCEPTION 'Código de indicação inválido ou indicador sem painel ativo.';
    END IF;
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, phone, referral_code, referred_by)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'phone',
    my_code,
    referrer
  );

  -- Assign role (admin for first user, user for others)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);

  -- Register the referral if valid
  IF referrer IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id, code_used)
    VALUES (referrer, new.id, upper(ref_code))
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

-- Garantir permissão de execução nas funções administrativas
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated;

-- Garantir acesso às tabelas de revenda e créditos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_requests TO authenticated;

-- Garantir que o service_role tenha tudo
GRANT ALL ON public.credit_history TO service_role;
GRANT ALL ON public.reseller_plans TO service_role;
GRANT ALL ON public.referrals TO service_role;
GRANT ALL ON public.payout_requests TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.subscriptions TO service_role;

-- Corrigir possíveis falhas de RLS nas tabelas de revenda
ALTER TABLE public.credit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own credit history" ON public.credit_history;
CREATE POLICY "Users can view their own credit history" ON public.credit_history 
FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.reseller_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Resellers can manage their own plans" ON public.reseller_plans;
CREATE POLICY "Resellers can manage their own plans" ON public.reseller_plans 
FOR ALL TO authenticated USING (auth.uid() = reseller_id);
-- Function to list all resellers with their stats for admin
CREATE OR REPLACE FUNCTION public.get_admin_resellers()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  credits int,
  sub_reseller_count int,
  client_count int,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.created_at,
    p.credits,
    (SELECT COUNT(*)::int FROM public.profiles p2 WHERE p2.parent_id = p.id AND p2.is_reseller = true) AS sub_reseller_count,
    (SELECT COUNT(*)::int FROM public.profiles p2 WHERE p2.parent_id = p.id AND p2.is_reseller = false) AS client_count,
    COALESCE(
      (SELECT MAX(pa.paid_at) FROM public.payments pa WHERE pa.user_id = p.id),
      p.created_at
    ) AS last_activity_at
  FROM public.profiles p
  WHERE p.is_reseller = true
  ORDER BY p.created_at DESC;
END;
$$;

-- Function for admin to add credits manually
CREATE OR REPLACE FUNCTION public.admin_add_credits(
  _user_id uuid,
  _amount int,
  _description text DEFAULT 'Créditos adicionados pelo administrador'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Update user profile
  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + _amount
  WHERE id = _user_id;

  -- Insert into history
  INSERT INTO public.credit_history (user_id, amount, type, description)
  VALUES (_user_id, _amount, 'purchase', _description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_resellers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, int, text) TO authenticated;

-- Function to list all resellers with their stats for admin
CREATE OR REPLACE FUNCTION public.get_admin_resellers()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  credits int,
  sub_reseller_count int,
  client_count int,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.created_at,
    p.credits,
    (SELECT COUNT(*)::int FROM public.profiles p2 WHERE p2.parent_id = p.id AND p2.is_reseller = true) AS sub_reseller_count,
    (SELECT COUNT(*)::int FROM public.profiles p2 WHERE p2.parent_id = p.id AND p2.is_reseller = false) AS client_count,
    COALESCE(
      (SELECT MAX(pa.paid_at) FROM public.payments pa WHERE pa.user_id = p.id),
      p.created_at
    ) AS last_activity_at
  FROM public.profiles p
  WHERE p.is_reseller = true
  ORDER BY p.created_at DESC;
END;
$$;

-- Function for admin to add credits manually
CREATE OR REPLACE FUNCTION public.admin_add_credits(
  _user_id uuid,
  _amount int,
  _description text DEFAULT 'Créditos adicionados pelo administrador'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Update user profile
  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + _amount
  WHERE id = _user_id;

  -- Insert into history
  INSERT INTO public.credit_history (user_id, amount, type, description)
  VALUES (_user_id, _amount, 'purchase', _description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_resellers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(uuid, int, text) TO authenticated;
-- Remove referral-related columns if they exist
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_code') THEN
        ALTER TABLE public.profiles DROP COLUMN referral_code;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referred_by') THEN
        ALTER TABLE public.profiles DROP COLUMN referred_by;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'signup_bonus_days') THEN
        ALTER TABLE public.profiles DROP COLUMN signup_bonus_days;
    END IF;
END $$;

-- Drop referral-related functions
DROP FUNCTION IF EXISTS public.is_valid_referral_code(text);
DROP FUNCTION IF EXISTS public.get_referral_summary(uuid);

-- Payouts and referral tables are kept in DB for history but UI is removed.
-- To completely remove them (if desired):
-- DROP TABLE IF EXISTS public.payout_requests;
-- DROP TABLE IF EXISTS public.referrals;
-- Create a clean migration for the new Reseller structure
-- 1. Create specialized tables for the new reseller system (keeping them in public for the data api)

-- 2. History of credit movements
CREATE TABLE IF NOT EXISTS public.reseller_credit_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    type text NOT NULL, -- 'purchase', 'use', 'admin_adjustment', 'transfer'
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT ON public.reseller_credit_history TO authenticated;
GRANT ALL ON public.reseller_credit_history TO service_role;

-- RLS
ALTER TABLE public.reseller_credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own credit history"
ON public.reseller_credit_history FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Ensure profile fields are correct
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_reseller') THEN
        ALTER TABLE public.profiles ADD COLUMN is_reseller boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'credits') THEN
        ALTER TABLE public.profiles ADD COLUMN credits integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'parent_id') THEN
        ALTER TABLE public.profiles ADD COLUMN parent_id uuid REFERENCES auth.users(id);
    END IF;
END $$;
UPDATE public.subscriptions 
SET status = 'active', 
    expires_at = (now() + interval '31 days') 
WHERE user_id = 'cb9607f2-1358-422e-9b3a-f14af89d8096';CREATE OR REPLACE FUNCTION public.finalize_approved_payment(_payment_id uuid, _provider_payment_id text, _raw_payload jsonb, _paid_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
  v_credits_to_add int := 0;
BEGIN
  -- 1. Lock and update payment status
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  -- 2. If already approved or not found, just return current state
  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

  -- 3. Determine if this is a Credit Purchase or a Subscription Renewal
  IF pay.plan::text LIKE 'credits_%' THEN
    -- CREDIT PURCHASE FLOW
    v_credits_to_add := CASE pay.plan::text
      WHEN 'credits_10' THEN 10
      WHEN 'credits_30' THEN 30
      WHEN 'credits_40' THEN 40
      ELSE 0
    END;

    IF v_credits_to_add > 0 THEN
      -- Add credits to profile
      UPDATE public.profiles
      SET credits = COALESCE(credits, 0) + v_credits_to_add
      WHERE id = pay.user_id;

      -- Log history
      INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
      VALUES (pay.user_id, v_credits_to_add, 'purchase', 'Compra de pacote de créditos via PIX (' || v_credits_to_add || ' unidades)');
    END IF;

    -- For credits, we don't change the subscription. Just return current expiry.
    SELECT s.expires_at INTO v_expires 
    FROM public.subscriptions s 
    WHERE s.user_id = pay.user_id;
    
    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  ELSE
    -- SUBSCRIPTION RENEWAL FLOW
    duration := CASE pay.plan
      WHEN 'yearly'::public.plan_type THEN interval '365 days'
      ELSE interval '31 days'
    END;

    UPDATE public.subscriptions s
    SET plan = pay.plan,
        status = 'active'::public.subscription_status,
        expires_at = GREATEST(COALESCE(s.expires_at, _paid_at), _paid_at) + duration,
        cancelled_at = null
    WHERE s.user_id = pay.user_id
    RETURNING s.expires_at INTO v_expires;

    IF NOT FOUND THEN
      INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
      VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration)
      RETURNING public.subscriptions.expires_at INTO v_expires;
    END IF;

    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  END IF;
END;
$function$;UPDATE public.servers
SET server_group = name
WHERE server_group IS NULL OR server_group = '';
-- Trigger function to automatically convert Client to Reseller when receiving credits
CREATE OR REPLACE FUNCTION public.handle_reseller_conversion_on_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is being given credits and is not already a reseller
  IF (NEW.credits > COALESCE(OLD.credits, 0)) AND NEW.is_reseller = false THEN
    NEW.is_reseller := true;
    
    -- Update the subscription to reflect the reseller status for UI consistency
    UPDATE public.subscriptions 
    SET plan = 'reseller'::public.plan_type,
        status = 'active'::public.subscription_status,
        expires_at = now() + interval '10 years'
    WHERE user_id = NEW.id;
    
    -- Log the conversion event
    INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
    VALUES (NEW.id, 0, 'adjustment', 'Conversão automática para Revendedor (créditos recebidos)');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_convert_to_reseller_on_credits ON public.profiles;
CREATE TRIGGER tr_convert_to_reseller_on_credits
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.credits IS DISTINCT FROM OLD.credits)
  EXECUTE FUNCTION public.handle_reseller_conversion_on_credits();

-- Update transfer_credits function to allow admins to transfer even if "expired"
CREATE OR REPLACE FUNCTION public.transfer_credits(
    _sender_id UUID,
    _recipient_id UUID,
    _amount INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_sender_credits INTEGER;
    v_recipient_parent_id UUID;
    v_sender_active BOOLEAN;
    v_sender_email TEXT;
    v_recipient_email TEXT;
    v_recipient_name TEXT;
    v_sender_name TEXT;
BEGIN
    -- 1. Validate amount
    IF _amount <= 0 THEN
        RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
    END IF;

    -- 2. Validate sender activity
    -- Admin is always active, others check credits/subscription
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin'
    ) INTO v_sender_active;

    IF NOT v_sender_active THEN
        SELECT public.subscription_is_active(_sender_id) INTO v_sender_active;
    END IF;

    IF NOT v_sender_active THEN
        RAISE EXCEPTION 'Sua conta precisa estar ativa para transferir créditos.';
    END IF;

    -- 3. Check sender credits
    SELECT credits, email, full_name INTO v_sender_credits, v_sender_email, v_sender_name FROM public.profiles WHERE id = _sender_id;
    
    -- Admin bypass check
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin') THEN
        IF v_sender_credits < _amount THEN
            RAISE EXCEPTION 'Saldo insuficiente para a transferência.';
        END IF;
    END IF;

    -- 4. Verify recipient belongs to sender's network
    -- Admin can transfer to ANYONE
    SELECT parent_id, email, full_name INTO v_recipient_parent_id, v_recipient_email, v_recipient_name FROM public.profiles WHERE id = _recipient_id;
    
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin') THEN
        IF v_recipient_parent_id IS NULL OR v_recipient_parent_id != _sender_id THEN
            RAISE EXCEPTION 'Você só pode transferir créditos para revendedores da sua própria rede.';
        END IF;
    END IF;

    -- 5. Perform transfer
    -- Sender side: only if not admin
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin') THEN
        UPDATE public.profiles SET credits = credits - _amount WHERE id = _sender_id;
    END IF;
    
    -- Recipient side: conversion is handled by the trigger
    UPDATE public.profiles SET credits = credits + _amount WHERE id = _recipient_id;

    -- 6. Log history (Log in both reseller_credit_history and credit_history for broad compatibility)
    INSERT INTO public.credit_history (user_id, amount, type, description)
    VALUES 
        (_sender_id, -_amount, 'transfer_out', 'Envio para: ' || COALESCE(v_recipient_name, v_recipient_email)),
        (_recipient_id, _amount, 'transfer_in', 'Origem: ' || COALESCE(v_sender_name, v_sender_email));

    INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
    VALUES 
        (_sender_id, -_amount, 'use', 'Envio para: ' || COALESCE(v_recipient_name, v_recipient_email)),
        (_recipient_id, _amount, 'purchase', 'Origem: ' || COALESCE(v_sender_name, v_sender_email));

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Function to clean up user roles and types based on credits
-- Rule: credits > 0 -> Reseller, credits = 0 -> Client

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, credits, is_reseller FROM public.profiles LOOP
        IF r.credits > 0 THEN
            -- Should be Reseller
            UPDATE public.profiles 
            SET is_reseller = true 
            WHERE id = r.id;
            
            -- Ensure subscription is extended to avoid "expired" banners for resellers
            INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
            VALUES (r.id, 'yearly', 'active', now(), now() + interval '10 years')
            ON CONFLICT (user_id) DO UPDATE 
            SET status = 'active', expires_at = now() + interval '10 years';
            
        ELSE
            -- Should be Client
            UPDATE public.profiles 
            SET is_reseller = false 
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'reseller';
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'basic';

ALTER TABLE public.reseller_plans
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'plan',
  ADD COLUMN IF NOT EXISTS credits_amount integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reseller_plans_kind_check'
  ) THEN
    ALTER TABLE public.reseller_plans
      ADD CONSTRAINT reseller_plans_kind_check CHECK (kind IN ('plan','credits'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_plans'
      AND policyname='Children can view their parent reseller plans'
  ) THEN
    CREATE POLICY "Children can view their parent reseller plans"
      ON public.reseller_plans FOR SELECT TO authenticated
      USING (
        reseller_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.parent_id = public.reseller_plans.reseller_id
        )
      );
  END IF;
END $$;
-- Allow users to read their parent's profile (specifically for WhatsApp/Phone contact)
CREATE POLICY "profiles: children can read parent" ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles AS self
    WHERE self.id = auth.uid() AND self.parent_id = public.profiles.id
  )
);

GRANT SELECT ON public.profiles TO authenticated;-- Create the hierarchy tree table
CREATE TABLE IF NOT EXISTS public.reseller_tree (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    parent_reseller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    owner_id uuid REFERENCES public.profiles(id) NOT NULL, -- The "Root" admin or highest level reseller
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_tree TO authenticated;
GRANT ALL ON public.reseller_tree TO service_role;

ALTER TABLE public.reseller_tree ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tree entry" ON public.reseller_tree
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Parents can view their subtree" ON public.reseller_tree
    FOR SELECT TO authenticated USING (parent_reseller_id = auth.uid() OR owner_id = auth.uid());

-- Reseller Settings table (independent pricing and PIX)
CREATE TABLE IF NOT EXISTS public.reseller_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    pix_key text,
    pix_name text,
    monthly_price_cents integer DEFAULT 3500,
    quarterly_price_cents integer DEFAULT 9000,
    annual_price_cents integer DEFAULT 29900,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (reseller_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_settings TO authenticated;
GRANT ALL ON public.reseller_settings TO service_role;

ALTER TABLE public.reseller_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers manage their own settings" ON public.reseller_settings
    FOR ALL TO authenticated USING (reseller_id = auth.uid());

CREATE POLICY "Customers can view their reseller settings" ON public.reseller_settings
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.reseller_tree t 
            WHERE t.user_id = auth.uid() AND t.parent_reseller_id = reseller_settings.reseller_id
        )
    );

-- Reseller Wallet table
CREATE TABLE IF NOT EXISTS public.reseller_wallet (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE (reseller_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_wallet TO authenticated;
GRANT ALL ON public.reseller_wallet TO service_role;

ALTER TABLE public.reseller_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers view own wallet" ON public.reseller_wallet
    FOR SELECT TO authenticated USING (reseller_id = auth.uid());

-- Migration Logic
DO $$
DECLARE
    admin_id uuid;
BEGIN
    -- Find a real admin user ID from public.user_roles
    SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin' LIMIT 1;
    
    -- If no admin role assigned yet, use the first created profile (emergency fallback)
    IF admin_id IS NULL THEN
        SELECT id INTO admin_id FROM public.profiles ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- Migrate all existing profiles into the tree
    INSERT INTO public.reseller_tree (user_id, parent_reseller_id, owner_id)
    SELECT 
        p.id, 
        p.parent_id,
        COALESCE(p.parent_id, admin_id)
    FROM public.profiles p
    ON CONFLICT (user_id) DO UPDATE 
    SET parent_reseller_id = EXCLUDED.parent_reseller_id,
        owner_id = EXCLUDED.owner_id;

    -- Initialize settings for existing resellers
    INSERT INTO public.reseller_settings (reseller_id)
    SELECT id FROM public.profiles WHERE is_reseller = true
    ON CONFLICT (reseller_id) DO NOTHING;

    -- Initialize wallet with current credits from profiles
    INSERT INTO public.reseller_wallet (reseller_id, credits)
    SELECT id, COALESCE(credits, 0) FROM public.profiles WHERE is_reseller = true OR credits > 0
    ON CONFLICT (reseller_id) DO UPDATE SET credits = EXCLUDED.credits;
END $$;
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reseller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_reseller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';
-- 2. Identify resellers
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'reseller'::app_role FROM public.profiles 
WHERE is_reseller = true AND parent_id IS NULL
ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

-- 3. Identify sub_resellers (is_reseller = true and has a parent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'sub_reseller'::app_role FROM public.profiles 
WHERE is_reseller = true AND parent_id IS NOT NULL
ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

-- 4. Identify customers (not a reseller)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'customer'::app_role FROM public.profiles 
WHERE is_reseller = false
ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;
CREATE OR REPLACE FUNCTION public.transfer_credits_v2(_sender_id uuid, _recipient_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_credits INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    IF _amount <= 0 THEN
        RAISE EXCEPTION 'Valor inválido';
    END IF;

    -- Check if sender is admin
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = _sender_id AND role = 'admin'
    ) INTO v_is_admin;

    -- Get sender wallet
    SELECT credits INTO v_sender_credits FROM public.reseller_wallet WHERE reseller_id = _sender_id;

    -- Admin bypasses credit check and deduction
    IF NOT v_is_admin THEN
        IF v_sender_credits IS NULL OR v_sender_credits < _amount THEN
            RAISE EXCEPTION 'Saldo insuficiente';
        END IF;

        -- Deduct from sender
        UPDATE public.reseller_wallet 
        SET credits = credits - _amount, updated_at = now()
        WHERE reseller_id = _sender_id;

        -- Log history for sender
        INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
        VALUES (_sender_id, -_amount, 'transfer_sent', 'Transferência enviada');
    END IF;

    -- Add to recipient
    INSERT INTO public.reseller_wallet (reseller_id, credits)
    VALUES (_recipient_id, _amount)
    ON CONFLICT (reseller_id) DO UPDATE 
    SET credits = public.reseller_wallet.credits + _amount, updated_at = now();

    -- Log history for recipient
    INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
    VALUES (_recipient_id, _amount, 'transfer_received', 'Transferência recebida');

    -- Auto-convert recipient to reseller/sub-reseller if they are not yet
    UPDATE public.profiles SET is_reseller = true WHERE id = _recipient_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_admin_users_v2()
RETURNS TABLE(
    id uuid, 
    email text, 
    full_name text, 
    phone text, 
    created_at timestamp with time zone, 
    is_admin boolean, 
    is_reseller boolean,
    credits integer,
    parent_id uuid,
    owner_id uuid,
    plan plan_type, 
    status subscription_status, 
    expires_at timestamp with time zone, 
    days_remaining integer, 
    total_paid_cents bigint, 
    last_payment_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.phone,
    p.created_at,
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
    ) AS is_admin,
    p.is_reseller,
    COALESCE(w.credits, 0) AS credits,
    t.parent_reseller_id AS parent_id,
    t.owner_id,
    s.plan,
    s.status,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::int) AS days_remaining,
    COALESCE((
      SELECT SUM(pay.amount_cents)
      FROM public.payments pay
      WHERE pay.user_id = p.id AND pay.status = 'approved'
    ), 0) AS total_paid_cents,
    (
      SELECT MAX(pay.created_at)
      FROM public.payments pay
      WHERE pay.user_id = p.id AND pay.status = 'approved'
    ) AS last_payment_at
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN public.reseller_tree t ON t.user_id = p.id
  LEFT JOIN public.reseller_wallet w ON w.reseller_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_admin_resellers_v2()
RETURNS TABLE(
    id uuid,
    email text,
    full_name text,
    created_at timestamp with time zone,
    credits integer,
    parent_id uuid,
    owner_id uuid,
    sub_reseller_count bigint,
    client_count bigint,
    last_activity_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    COALESCE(w.credits, 0) AS credits,
    t.parent_reseller_id AS parent_id,
    t.owner_id,
    (SELECT count(*) FROM public.reseller_tree st JOIN public.profiles sp ON st.user_id = sp.id WHERE st.parent_reseller_id = p.id AND sp.is_reseller = true) AS sub_reseller_count,
    (SELECT count(*) FROM public.reseller_tree st JOIN public.profiles sp ON st.user_id = sp.id WHERE st.parent_reseller_id = p.id AND sp.is_reseller = false) AS client_count,
    (SELECT max(created_at) FROM public.credit_history WHERE user_id = p.id) AS last_activity_at
  FROM public.profiles p
  LEFT JOIN public.reseller_tree t ON t.user_id = p.id
  LEFT JOIN public.reseller_wallet w ON w.reseller_id = p.id
  WHERE p.is_reseller = true
  ORDER BY p.created_at DESC;
END;
$$;
-- 1) Novo plano trimestral
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'quarterly';

-- 2) Mantém profiles.credits espelhando a carteira (fonte de verdade)
CREATE OR REPLACE FUNCTION public.sync_profile_credits_from_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = NEW.credits
  WHERE id = NEW.reseller_id
    AND COALESCE(credits, 0) <> NEW.credits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_credits ON public.reseller_wallet;
CREATE TRIGGER trg_sync_profile_credits
AFTER INSERT OR UPDATE OF credits ON public.reseller_wallet
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_credits_from_wallet();

-- 3) Pagamento aprovado: créditos vão para a carteira; assinatura ganha trimestral
CREATE OR REPLACE FUNCTION public.finalize_approved_payment(
  _payment_id uuid,
  _provider_payment_id text,
  _raw_payload jsonb,
  _paid_at timestamp with time zone DEFAULT now()
)
RETURNS TABLE(applied boolean, user_id uuid, plan plan_type, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  pay public.payments%ROWTYPE;
  v_user_id uuid;
  v_plan public.plan_type;
  v_expires timestamptz;
  duration interval;
  v_credits_to_add int := 0;
BEGIN
  UPDATE public.payments p
  SET status = 'approved'::public.payment_status,
      provider_payment_id = _provider_payment_id,
      paid_at = COALESCE(p.paid_at, _paid_at),
      raw_payload = _raw_payload
  WHERE p.id = _payment_id
    AND p.status <> 'approved'::public.payment_status
  RETURNING p.* INTO pay;

  IF NOT FOUND THEN
    SELECT p.user_id, p.plan, s.expires_at
      INTO v_user_id, v_plan, v_expires
    FROM public.payments p
    LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    WHERE p.id = _payment_id;
    RETURN QUERY SELECT false, v_user_id, v_plan, v_expires;
    RETURN;
  END IF;

  IF pay.plan::text LIKE 'credits_%' THEN
    v_credits_to_add := CASE pay.plan::text
      WHEN 'credits_10' THEN 10
      WHEN 'credits_30' THEN 30
      WHEN 'credits_40' THEN 40
      WHEN 'credits_50' THEN 50
      ELSE 0
    END;

    IF v_credits_to_add > 0 THEN
      INSERT INTO public.reseller_wallet (reseller_id, credits)
      VALUES (pay.user_id, v_credits_to_add)
      ON CONFLICT (reseller_id) DO UPDATE
        SET credits = public.reseller_wallet.credits + v_credits_to_add,
            updated_at = now();

      UPDATE public.profiles SET is_reseller = true WHERE id = pay.user_id;

      INSERT INTO public.reseller_credit_history (user_id, amount, type, description)
      VALUES (pay.user_id, v_credits_to_add, 'purchase',
              'Compra de pacote de créditos via PIX (' || v_credits_to_add || ' unidades)');
    END IF;

    SELECT s.expires_at INTO v_expires
    FROM public.subscriptions s
    WHERE s.user_id = pay.user_id;

    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  ELSE
    duration := CASE pay.plan::text
      WHEN 'yearly' THEN interval '365 days'
      WHEN 'quarterly' THEN interval '92 days'
      ELSE interval '31 days'
    END;

    UPDATE public.subscriptions s
    SET plan = pay.plan,
        status = 'active'::public.subscription_status,
        expires_at = GREATEST(COALESCE(s.expires_at, _paid_at), _paid_at) + duration,
        cancelled_at = null
    WHERE s.user_id = pay.user_id
    RETURNING s.expires_at INTO v_expires;

    IF NOT FOUND THEN
      INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
      VALUES (pay.user_id, pay.plan, 'active'::public.subscription_status, _paid_at, _paid_at + duration)
      RETURNING public.subscriptions.expires_at INTO v_expires;
    END IF;

    RETURN QUERY SELECT true, pay.user_id, pay.plan, v_expires;
  END IF;
END;
$function$;CREATE OR REPLACE FUNCTION public.get_my_parent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_parent_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_parent_id() TO authenticated;

DROP POLICY IF EXISTS "profiles: children can read parent" ON public.profiles;
CREATE POLICY "profiles: children can read parent"
ON public.profiles FOR SELECT TO authenticated
USING (id = public.get_my_parent_id());ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'semiannual';-- 1. search_path
ALTER FUNCTION public.transfer_credits(uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.handle_payment_approval() SET search_path = public;
ALTER FUNCTION public.handle_reseller_conversion_on_credits() SET search_path = public;

-- 2. credit_pack_definitions RLS
GRANT SELECT ON public.credit_pack_definitions TO anon, authenticated;
GRANT ALL ON public.credit_pack_definitions TO service_role;
ALTER TABLE public.credit_pack_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit packs readable by all"
  ON public.credit_pack_definitions FOR SELECT USING (true);
CREATE POLICY "admins manage credit packs"
  ON public.credit_pack_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Remove unrestricted parent full-row update on profiles
DROP POLICY IF EXISTS "profiles: parent updates children credits" ON public.profiles;

-- 4. reseller_settings: stop exposing pix data to customers
DROP POLICY IF EXISTS "Customers can view their reseller settings" ON public.reseller_settings;

CREATE OR REPLACE FUNCTION public.get_parent_reseller_pricing(_reseller_id uuid)
RETURNS TABLE(reseller_id uuid, monthly_price_cents integer, quarterly_price_cents integer, annual_price_cents integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.reseller_id, s.monthly_price_cents, s.quarterly_price_cents, s.annual_price_cents
  FROM public.reseller_settings s
  WHERE s.reseller_id = _reseller_id
    AND (
      s.reseller_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.reseller_tree t
        WHERE t.user_id = auth.uid() AND t.parent_reseller_id = s.reseller_id
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_reseller_pricing(uuid) TO authenticated;ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_account_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_owner_account_id ON public.profiles(owner_account_id);

-- Link every admin account to the main admin account
UPDATE public.profiles p
SET owner_account_id = (SELECT id FROM public.profiles WHERE email = 'victorsampaio133@gmail.com' LIMIT 1)
WHERE (SELECT id FROM public.profiles WHERE email = 'victorsampaio133@gmail.com' LIMIT 1) IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin');

CREATE OR REPLACE FUNCTION public.get_owner_account_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.id
       FROM public.profiles p
       JOIN public.profiles o ON o.id = p.owner_account_id
      WHERE p.id = _user_id),
    _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_account_id(uuid) TO authenticated, service_role;

CREATE POLICY "Admins can link accounts to an owner"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS monitoring_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_servers_monitoring_paused
  ON public.servers (monitoring_paused) WHERE monitoring_paused;CREATE TABLE public.expiry_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'expired_access',
  sent_at timestamptz not null default now(),
  unique (user_id, kind)
);
GRANT SELECT ON public.expiry_notices TO authenticated;
GRANT ALL ON public.expiry_notices TO service_role;
ALTER TABLE public.expiry_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expiry_notices: admin read" ON public.expiry_notices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "expiry_notices: owner read" ON public.expiry_notices FOR SELECT TO authenticated USING (user_id = auth.uid());CREATE OR REPLACE FUNCTION public.get_admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'new_users_7d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'new_users_30d', (SELECT COUNT(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    'trial_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'trial' AND expires_at > now()),
    'paid_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active' AND expires_at > now()),
    'expired', (SELECT COUNT(*) FROM public.subscriptions WHERE expires_at <= now()),
    'cancelled', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'cancelled'),
    'expiring_7d', (SELECT COUNT(*) FROM public.subscriptions WHERE expires_at > now() AND expires_at < now() + interval '7 days'),
    'monthly_subs', (SELECT COUNT(*) FROM public.subscriptions WHERE plan = 'monthly' AND expires_at > now()),
    'yearly_subs', (SELECT COUNT(*) FROM public.subscriptions WHERE plan = 'yearly' AND expires_at > now()),
    'payments_pending', (SELECT COUNT(*) FROM public.payments WHERE status = 'pending'),
    'payments_approved_total', (SELECT COUNT(*) FROM public.payments WHERE status = 'approved'),
    'revenue_cents_total', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved'),
    'revenue_cents_30d', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved' AND paid_at > now() - interval '30 days'),
    'revenue_cents_7d', (SELECT COALESCE(SUM(amount_cents),0) FROM public.payments WHERE status = 'approved' AND paid_at > now() - interval '7 days'),
    'total_servers', (SELECT COUNT(*) FROM public.servers),
    'servers_paused', (SELECT COUNT(*) FROM public.servers WHERE monitoring_paused IS TRUE),
    'servers_online', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'up'),
    'servers_warning', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status IN ('degraded','unknown')),
    'servers_offline', (SELECT COUNT(*) FROM public.servers WHERE COALESCE(monitoring_paused,false) = false AND current_status = 'down'),
    'paused_owners', (SELECT COUNT(DISTINCT owner_id) FROM public.servers WHERE monitoring_paused IS TRUE),
    'total_referrals', (SELECT COUNT(*) FROM public.referrals),
    'converted_referrals', (SELECT COUNT(*) FROM public.referrals WHERE reward_granted_at IS NOT NULL),
    'signups_by_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', c) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS c
        FROM public.profiles
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_paused_owners()
 RETURNS TABLE (
   owner_id uuid,
   full_name text,
   email text,
   account_type text,
   credits integer,
   subscription_status text,
   expires_at timestamptz,
   paused_reason text,
   paused_servers integer,
   total_servers integer,
   last_paused_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    CASE
      WHEN public.has_role(p.id, 'admin') THEN 'admin'
      WHEN public.has_role(p.id, 'sub_reseller') THEN 'sub_reseller'
      WHEN public.has_role(p.id, 'reseller') OR COALESCE(p.is_reseller,false) THEN 'reseller'
      ELSE 'client'
    END::text,
    GREATEST(COALESCE(p.credits,0), COALESCE(w.credits,0))::int,
    s.status::text,
    s.expires_at,
    MIN(sv.paused_reason)::text,
    COUNT(*) FILTER (WHERE sv.monitoring_paused IS TRUE)::int,
    (SELECT COUNT(*) FROM public.servers x WHERE x.owner_id = p.id)::int,
    MAX(sv.paused_at)
  FROM public.servers sv
  JOIN public.profiles p ON p.id = sv.owner_id
  LEFT JOIN public.reseller_wallet w ON w.reseller_id = p.id
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  WHERE sv.monitoring_paused IS TRUE
  GROUP BY p.id, p.full_name, p.email, p.is_reseller, p.credits, w.credits, s.status, s.expires_at
  ORDER BY COUNT(*) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_paused_owners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_paused_owners() TO authenticated;
-- Helper: profiles privileged columns unchanged (or actor is admin)
CREATE OR REPLACE FUNCTION public.profiles_privileged_unchanged(
  _id uuid, _credits integer, _is_reseller boolean, _trial_used boolean,
  _signup_bonus_days integer, _parent_id uuid, _owner_account_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _id
          AND p.credits IS NOT DISTINCT FROM _credits
          AND p.is_reseller IS NOT DISTINCT FROM _is_reseller
          AND p.trial_used IS NOT DISTINCT FROM _trial_used
          AND p.signup_bonus_days IS NOT DISTINCT FROM _signup_bonus_days
          AND p.parent_id IS NOT DISTINCT FROM _parent_id
          AND p.owner_account_id IS NOT DISTINCT FROM _owner_account_id
      );
$$;

DROP POLICY IF EXISTS "profiles: user updates own" ON public.profiles;
CREATE POLICY "profiles: user updates own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND public.profiles_privileged_unchanged(
    id, credits, is_reseller, trial_used, signup_bonus_days, parent_id, owner_account_id
  )
);

-- Helper: hub_profiles moderation columns unchanged
CREATE OR REPLACE FUNCTION public.hub_profiles_moderation_unchanged(
  _id uuid, _verification_status hub_verification_status, _verified_at timestamptz, _banned boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.hub_profiles h
        WHERE h.id = _id
          AND h.verification_status IS NOT DISTINCT FROM _verification_status
          AND h.verified_at IS NOT DISTINCT FROM _verified_at
          AND h.banned IS NOT DISTINCT FROM _banned
      );
$$;

DROP POLICY IF EXISTS "hub_profiles: update self" ON public.hub_profiles;
CREATE POLICY "hub_profiles: update self"
ON public.hub_profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() AND banned = false)
WITH CHECK (
  id = auth.uid()
  AND public.hub_profiles_moderation_unchanged(id, verification_status, verified_at, banned)
);

-- Helper: listings moderation columns unchanged
CREATE OR REPLACE FUNCTION public.listings_moderation_unchanged(
  _id uuid, _flagged boolean, _highlight boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id = _id
          AND l.flagged IS NOT DISTINCT FROM _flagged
          AND l.highlight IS NOT DISTINCT FROM _highlight
      );
$$;

DROP POLICY IF EXISTS "listings: owner update" ON public.listings;
CREATE POLICY "listings: owner update"
ON public.listings FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (
  author_id = auth.uid()
  AND public.listings_moderation_unchanged(id, flagged, highlight)
);

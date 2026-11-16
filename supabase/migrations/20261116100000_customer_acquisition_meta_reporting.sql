-- Stream Monitor first-touch attribution and verified Meta spend.
-- Private to service-role backed APIs: no browser reads/writes to other users.
create table if not exists public.customer_acquisition(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source text not null default 'direct'
    check (source in ('meta_ads','other_campaign','referral','organic','direct','social_unverified')),
  platform text,
  evidence text not null default 'unattributed',
  first_access_at timestamptz not null default now(),
  registered_at timestamptz not null default now(),
  utm_source text,utm_medium text,utm_campaign text,utm_content text,utm_term text,
  campaign_id text,adset_id text,ad_id text,click_id text,
  advertising_consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ca_source_date on public.customer_acquisition(source,registered_at desc);
create index if not exists ca_campaign on public.customer_acquisition(campaign_id,ad_id) where campaign_id is not null;
alter table public.customer_acquisition enable row level security;
revoke all on public.customer_acquisition from anon,authenticated;

create table if not exists public.ad_spend_daily(
  day date not null,
  provider text not null default 'meta',
  platform text not null default 'unknown',
  campaign_id text not null,
  ad_id text not null default 'unknown',
  campaign_name text,
  ad_name text,
  spend_cents integer not null check(spend_cents>=0),
  clicks integer not null default 0 check(clicks>=0),
  impressions integer not null default 0 check(impressions>=0),
  landing_page_views integer not null default 0 check(landing_page_views>=0),
  source text not null default 'verified_connector',
  retrieved_at timestamptz not null default now(),
  primary key(day,provider,platform,campaign_id,ad_id)
);
create index if not exists ads_campaign_day on public.ad_spend_daily(campaign_id,day desc);
alter table public.ad_spend_daily enable row level security;
revoke all on public.ad_spend_daily from anon,authenticated;

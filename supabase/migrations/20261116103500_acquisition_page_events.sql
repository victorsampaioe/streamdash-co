create table if not exists public.acquisition_page_events(
 id uuid primary key,
 stage text not null check(stage in ('landing','signup')),
 source text not null default 'unattributed',
 platform text,
 campaign_id text,
 ad_id text,
 created_at timestamptz not null default now()
);
create index if not exists acquisition_page_events_stage_day on public.acquisition_page_events(stage,created_at desc);
alter table public.acquisition_page_events enable row level security;
revoke all on public.acquisition_page_events from anon,authenticated;
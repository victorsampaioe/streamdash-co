
CREATE TABLE IF NOT EXISTS public.reactivation_campaigns (
    id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running',
    total_found integer default 0,
    total_sent integer default 0,
    total_failed integer default 0,
    total_skipped integer default 0,
    message text,
    error_log text,
    created_by uuid references auth.users(id)
);

GRANT SELECT, INSERT, UPDATE ON public.reactivation_campaigns TO authenticated;
GRANT ALL ON public.reactivation_campaigns TO service_role;

ALTER TABLE public.reactivation_logs ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.reactivation_campaigns(id);

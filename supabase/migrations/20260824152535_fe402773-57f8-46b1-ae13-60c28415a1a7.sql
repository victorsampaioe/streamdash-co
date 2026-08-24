ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS dns_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS dns_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dns_last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS dns_last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS dns_regions jsonb,
  ADD COLUMN IF NOT EXISTS dns_state_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_http_status integer,
  ADD COLUMN IF NOT EXISTS last_state_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_priority smallint NOT NULL DEFAULT 3;

DO $$ BEGIN
  ALTER TABLE public.servers
    ADD CONSTRAINT servers_dns_status_check
    CHECK (dns_status IN ('unknown','online','unstable','offline'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_servers_next_check ON public.servers (next_check_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_servers_dns_status ON public.servers (dns_status);

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS incident_type text NOT NULL DEFAULT 'server';

DO $$ BEGIN
  ALTER TABLE public.incidents
    ADD CONSTRAINT incidents_type_check CHECK (incident_type IN ('dns','server'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS public.incidents_one_open_per_server;
CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open_per_server_type
  ON public.incidents (server_id, incident_type) WHERE (ended_at IS NULL);

CREATE TABLE IF NOT EXISTS public.monitor_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'cron',
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  offline_found integer NOT NULL DEFAULT 0,
  fixed integer NOT NULL DEFAULT 0,
  requeued integer NOT NULL DEFAULT 0,
  stale_reaped integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  notes text
);

GRANT SELECT ON public.monitor_sweeps TO authenticated;
GRANT ALL ON public.monitor_sweeps TO service_role;
ALTER TABLE public.monitor_sweeps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monitor_sweeps: admin read" ON public.monitor_sweeps;
CREATE POLICY "monitor_sweeps: admin read" ON public.monitor_sweeps
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_monitor_sweeps_started ON public.monitor_sweeps (started_at DESC);
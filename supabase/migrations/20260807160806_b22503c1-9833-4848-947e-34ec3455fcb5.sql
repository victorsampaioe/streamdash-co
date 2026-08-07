ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS monitoring_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_servers_monitoring_paused
  ON public.servers (monitoring_paused) WHERE monitoring_paused;
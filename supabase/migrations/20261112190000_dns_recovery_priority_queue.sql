-- Stream Monitor: fast recovery of confirmed DNS outages.
-- All fields are attached to the server; RLS stays under servers' existing policies.
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS dns_recovery_last_probe_at timestamptz,
  ADD COLUMN IF NOT EXISTS dns_recovery_success_streak integer NOT NULL DEFAULT 0;
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.servers'::regclass
      AND conname = 'dns_recovery_success_streak_range'
  ) THEN
    ALTER TABLE public.servers
      ADD CONSTRAINT dns_recovery_success_streak_range
      CHECK (dns_recovery_success_streak BETWEEN 0 AND 2);
  END IF;
END $;
CREATE INDEX IF NOT EXISTS servers_dns_recovery_queue_idx
  ON public.servers (dns_status, dns_recovery_last_probe_at NULLS FIRST, last_dns_check_at NULLS FIRST)
  WHERE dns_enabled = true AND monitoring_paused = false
    AND dns_status IN ('offline', 'unstable');
COMMENT ON COLUMN public.servers.dns_recovery_last_probe_at IS
  'Time of last dedicated fast DNS recovery probe. This is not the DNS up/down event time.';
COMMENT ON COLUMN public.servers.dns_recovery_success_streak IS
  'Consecutive fully healthy multi-resolver probes required before closing a DNS offline incident.';

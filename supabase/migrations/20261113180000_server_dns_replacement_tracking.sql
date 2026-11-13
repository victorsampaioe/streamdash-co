-- Tracks the DNS change boundary so historical probes do not validate a new DNS.
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS host_changed_at timestamptz;
COMMENT ON COLUMN public.servers.host_changed_at IS 'The start of monitoring for the new host/DNS. Historic checks from previous hosts must not be compared as current data.';

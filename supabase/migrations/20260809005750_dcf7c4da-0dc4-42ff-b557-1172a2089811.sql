
CREATE TABLE public.external_service_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name text NOT NULL,
    status text NOT NULL, -- operational, degraded, partial_outage, major_outage, maintenance
    description text,
    started_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    impact_assessment text,
    source_url text,
    last_update_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_service_incidents TO authenticated;
GRANT ALL ON public.external_service_incidents TO service_role;

ALTER TABLE public.external_service_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read external incidents" ON public.external_service_incidents
    FOR SELECT TO authenticated USING (true);

-- Index for performance
CREATE INDEX idx_ext_inc_service_active ON public.external_service_incidents (service_name) WHERE resolved_at IS NULL;

CREATE TABLE public.iptv_alert_state (
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
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
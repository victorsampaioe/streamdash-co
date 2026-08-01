CREATE TABLE public.iptv_login_attempts (
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
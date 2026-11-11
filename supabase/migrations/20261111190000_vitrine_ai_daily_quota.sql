-- Limite de cinco artes por dia por conta, no fuso America/Fortaleza.
-- A política permite ler apenas a própria utilização; reserva ocorre na função atômica.
CREATE TABLE IF NOT EXISTS public.vitrine_ai_daily_quota (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_day date NOT NULL,
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, quota_day)
);
ALTER TABLE public.vitrine_ai_daily_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vitrine_ai_daily_quota FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vitrine_ai_daily_quota TO authenticated;
DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vitrine_ai_daily_quota' AND policyname = 'vitrine_ai_read_own') THEN
    CREATE POLICY vitrine_ai_read_own ON public.vitrine_ai_daily_quota
      FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
  END IF;
END
$policy$;
CREATE OR REPLACE FUNCTION public.claim_vitrine_ai_art()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'America/Fortaleza')::date;
  v_used integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Faça login para gerar imagens.' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.vitrine_ai_daily_quota (owner_id, quota_day, used_count)
    VALUES (v_user, v_day, 1)
  ON CONFLICT (owner_id, quota_day)
    DO UPDATE SET
      used_count = public.vitrine_ai_daily_quota.used_count + 1,
      updated_at = now()
    WHERE public.vitrine_ai_daily_quota.used_count < 5
  RETURNING used_count INTO v_used;
  IF v_used IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'used', 5, 'remaining', 0, 'limit', 5);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'remaining', 5 - v_used, 'limit', 5);
END
$function$;
REVOKE ALL ON FUNCTION public.claim_vitrine_ai_art() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_vitrine_ai_art() TO authenticated;

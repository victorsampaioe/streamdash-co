-- Stream Monitor Vitrine IA: unlimited generations for verified administrators.
-- Resellers keep the existing atomic five-per-day counter in Fortaleza time.
-- The authenticated role is checked inside the database, never from a client flag.
CREATE OR REPLACE FUNCTION public.claim_vitrine_ai_art()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'America/Fortaleza')::date;
  v_used integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Faça login para gerar imagens.' USING ERRCODE = '28000';
  END IF;

  -- Trusted database role only: revendedores cannot claim to be administrators.
  IF public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'used', 0, 'remaining', null, 'limit', null);
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
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'used', 5, 'remaining', 0, 'limit', 5);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'used', v_used, 'remaining', 5 - v_used, 'limit', 5);
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_vitrine_ai_art() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_vitrine_ai_art() TO authenticated;

-- Stream Guardian Intelligence: conservative allowance below the Workers AI Free quota.
-- No end-user access to counters, secrets or cached diagnostic content.
CREATE TABLE IF NOT EXISTS public.doctor_ai_daily_usage (
  owner_id uuid NOT NULL,
  usage_day date NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, usage_day)
);
ALTER TABLE public.doctor_ai_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doctor_ai_daily_usage FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.doctor_ai_cache (
  cache_key text PRIMARY KEY,
  generated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doctor_ai_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doctor_ai_cache FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS doctor_ai_cache_created_at_idx ON public.doctor_ai_cache(created_at);

CREATE OR REPLACE FUNCTION public.reserve_doctor_ai_request(_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  d date := (now() AT TIME ZONE 'UTC')::date;
  global_owner uuid := '00000000-0000-0000-0000-000000000000';
  global_used integer;
  user_used integer;
BEGIN
  IF _owner IS NULL OR _owner = global_owner THEN
    RETURN jsonb_build_object('allowed',false,'reason','invalid_user');
  END IF;

  INSERT INTO public.doctor_ai_daily_usage(owner_id,usage_day)
    VALUES(global_owner,d),(_owner,d) ON CONFLICT DO NOTHING;

  SELECT requests INTO global_used FROM public.doctor_ai_daily_usage
    WHERE owner_id=global_owner AND usage_day=d FOR UPDATE;
  SELECT requests INTO user_used FROM public.doctor_ai_daily_usage
    WHERE owner_id=_owner AND usage_day=d FOR UPDATE;

  -- Hard cap: 40 globally and 3 per owner in each UTC day.
  IF global_used >= 40 OR user_used >= 3 THEN
    RETURN jsonb_build_object('allowed',false,'reason',
      CASE WHEN global_used >= 40 THEN 'global_limit' ELSE 'user_limit' END,
      'remaining', GREATEST(0, LEAST(40-global_used,3-user_used)));
  END IF;
  UPDATE public.doctor_ai_daily_usage SET requests=requests+1,updated_at=now()
    WHERE usage_day=d AND owner_id IN(global_owner,_owner);
  RETURN jsonb_build_object('allowed',true,
    'remaining', GREATEST(0,LEAST(40-global_used-1,3-user_used-1)));
END
$fn$;
REVOKE ALL ON FUNCTION public.reserve_doctor_ai_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_doctor_ai_request(uuid) TO service_role;

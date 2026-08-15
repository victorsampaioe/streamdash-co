CREATE TABLE IF NOT EXISTS public.cron_locks (
  name text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  holder text
);
GRANT ALL ON public.cron_locks TO service_role;
ALTER TABLE public.cron_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_acquire_cron_lock(_name text, _ttl_seconds int, _holder text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok boolean;
BEGIN
  DELETE FROM public.cron_locks WHERE name = _name AND expires_at < now();
  INSERT INTO public.cron_locks(name, locked_at, expires_at, holder)
  VALUES (_name, now(), now() + make_interval(secs => _ttl_seconds), _holder)
  ON CONFLICT (name) DO NOTHING;
  GET DIAGNOSTICS ok = ROW_COUNT;
  RETURN ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_cron_lock(_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ DELETE FROM public.cron_locks WHERE name = _name; $$;
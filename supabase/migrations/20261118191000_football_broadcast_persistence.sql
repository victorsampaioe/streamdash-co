-- Persist only provider-confirmed TV channels, keyed by date + normalized team pairing.
-- Reading/writing is server-only, after subscription authorization.
CREATE TABLE IF NOT EXISTS public.football_broadcast_cache (
  match_day date NOT NULL,
  fixture_key text NOT NULL CHECK(length(fixture_key) BETWEEN 3 AND 240),
  home_name text NOT NULL,
  away_name text NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY[]::text[],
  verified_source text NOT NULL CHECK (verified_source IN ('ftwb','cloudflare_verified')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT football_broadcast_cache_pkey PRIMARY KEY(match_day,fixture_key),
  CONSTRAINT football_broadcast_cache_channels CHECK(cardinality(channels) BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS football_broadcast_cache_date_index ON public.football_broadcast_cache(match_day);
ALTER TABLE public.football_broadcast_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.football_broadcast_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.football_broadcast_cache TO service_role;

-- Only the timestamp of an unsuccessful broadcaster lookup is cached, never
-- an unverified "no channel" result that could replace a confirmed one.
CREATE TABLE IF NOT EXISTS public.football_broadcast_lookup_attempts (
  match_day date NOT NULL,
  fixture_key text NOT NULL CHECK(length(fixture_key) BETWEEN 3 AND 240),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL CHECK(result IN ('no_channels','provider_unavailable')),
  PRIMARY KEY(match_day,fixture_key)
);
ALTER TABLE public.football_broadcast_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.football_broadcast_lookup_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.football_broadcast_lookup_attempts TO service_role;
COMMENT ON TABLE public.football_broadcast_cache IS
 'Verified TV channels by date/fixture. Negative and transient lookups cannot overwrite positive results.';
COMMENT ON TABLE public.football_broadcast_lookup_attempts IS
 'Throttle unverified transmission research; manual refresh bypasses cooldown.';

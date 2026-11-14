
CREATE TABLE IF NOT EXISTS public.platform_analytics_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL,
 event_name text NOT NULL CHECK(event_name IN ('$pageview','sm_feature_opened','sm_signup_started','sm_signup_completed','sm_login_completed','sm_subscription_started')),
 screen text NOT NULL CHECK(screen IN('home','cadastro_login','blog','revendedores','dashboard','servidores','novo_servidor','detalhe_servidor','alertas','radar','radar_falhas','assinatura','vitrine_ia','vitrine_banner','none')),
 scope text NOT NULL CHECK(scope IN('publico','painel')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_analytics_created_idx ON public.platform_analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_analytics_session_idx ON public.platform_analytics_events(session_id,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_analytics_event_date_idx ON public.platform_analytics_events(event_name,created_at DESC);
ALTER TABLE public.platform_analytics_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_analytics_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_analytics_events TO service_role;
CREATE TABLE IF NOT EXISTS public.platform_health_snapshots (
 captured_at timestamptz PRIMARY KEY DEFAULT now(),
 servers_total integer NOT NULL,
 servers_online integer NOT NULL,
 servers_offline integer NOT NULL,
 servers_paused integer NOT NULL,
 dns_unresolved integer NOT NULL,
 avg_latency_ms numeric,
 incidents_open integer NOT NULL,
 telegram_pending integer NOT NULL,
 telegram_failed_24h integer NOT NULL,
 subscriptions_active integer NOT NULL
);
ALTER TABLE public.platform_health_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_health_snapshots FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_health_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.streammonitor_record_analytics_event(
 p_session uuid,p_event text,p_screen text,p_scope text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $func$
DECLARE this_hour integer; recent_total integer;
BEGIN
 IF p_event NOT IN ('$pageview','sm_feature_opened','sm_signup_started','sm_signup_completed','sm_login_completed','sm_subscription_started')
 OR p_screen NOT IN ('home','cadastro_login','blog','revendedores','dashboard','servidores','novo_servidor','detalhe_servidor','alertas','radar','radar_falhas','assinatura','vitrine_ia','vitrine_banner','none')
 OR p_scope NOT IN ('publico','painel')
 THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_session::text));
 SELECT count(*)::integer INTO this_hour FROM public.platform_analytics_events
 WHERE session_id=p_session AND created_at>now()-interval '1 hour';
 IF this_hour>=100 THEN RETURN false; END IF;
 SELECT count(*)::integer INTO recent_total FROM public.platform_analytics_events
 WHERE created_at>now()-interval '1 hour';
 IF recent_total>=12000 THEN RETURN false; END IF;
 IF EXISTS (
  SELECT 1 FROM public.platform_analytics_events
  WHERE session_id=p_session AND event_name=p_event AND screen=p_screen
  AND created_at>now()-interval '15 seconds'
 ) THEN RETURN false; END IF;
 INSERT INTO public.platform_analytics_events(session_id,event_name,screen,scope)
 VALUES(p_session,p_event,p_screen,p_scope);
 RETURN true;
END $func$;
REVOKE ALL ON FUNCTION public.streammonitor_record_analytics_event(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_record_analytics_event(uuid,text,text,text) TO service_role;

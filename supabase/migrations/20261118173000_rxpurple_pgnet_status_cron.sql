-- RX Purple status monitoring with pg_net from the database network.
-- Keeps API network failures distinct from confirmed provider incidents.
ALTER TABLE public.app_partner_health_checks
 ADD COLUMN IF NOT EXISTS probe_source text NOT NULL DEFAULT 'runtime';
CREATE INDEX IF NOT EXISTS app_partner_health_source_idx
 ON public.app_partner_health_checks(partner_id,probe_source,checked_at DESC);

CREATE TABLE IF NOT EXISTS public.app_partner_probe_jobs(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 partner_id uuid NOT NULL REFERENCES public.app_partners(id) ON DELETE CASCADE,
 request_id bigint NOT NULL UNIQUE,
 requested_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 error_code text
);
CREATE INDEX IF NOT EXISTS app_partner_probe_jobs_pending_idx
 ON public.app_partner_probe_jobs(partner_id,requested_at) WHERE processed_at IS NULL;
ALTER TABLE public.app_partner_probe_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_partner_probe_jobs FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.app_partner_pgnet_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 _job record; _resp record; _p record; _svc jsonb; _payload jsonb;
 _all_count integer; _affected_count integer; _offline_count integer;
 _state text; _raw text; _component_state text; _evidence text; _affected text;
 _recent_states text[]; _verified boolean;
 _now timestamptz; _last_checked timestamptz;
 _incident_id uuid; _message text; _change text; _queued integer;
 _processed integer:=0; _scheduled integer:=0; _alerts integer:=0;
 _request bigint; _job_error text;
BEGIN
 IF NOT pg_try_advisory_xact_lock(18811826,4409) THEN
  RETURN jsonb_build_object('skipped','locked');
 END IF;
 -- A pg_net request is dispatched only after its transaction commits.
 -- Process requests from the previous cron invocation, then queue next requests.
 FOR _job IN
  SELECT j.id,j.partner_id,j.request_id,j.requested_at
  FROM public.app_partner_probe_jobs j
  WHERE j.processed_at IS NULL
  ORDER BY j.requested_at ASC LIMIT 12
  FOR UPDATE SKIP LOCKED
 LOOP
  _now:=clock_timestamp();
  SELECT r.status_code,r.content,r.error_msg,r.created
    INTO _resp
    FROM net._http_response r WHERE r.id=_job.request_id;
  IF NOT FOUND AND _job.requested_at>_now-interval '120 seconds' THEN
   CONTINUE;
  END IF;
  SELECT * INTO _p FROM public.app_partners p WHERE p.id=_job.partner_id;
  _incident_id:=NULL;_change:=NULL;
  _state:='unknown';_evidence:='O provedor não retornou status utilizável.';
  _raw:=null;_payload:=null;_job_error:=null;_verified:=false;
  _affected_count:=0;_offline_count:=0;_all_count:=0;_affected:='';
  IF NOT FOUND THEN
   _evidence:='Parceiro inexistente';
  ELSIF _resp.status_code=200 AND _resp.error_msg IS NULL AND length(_resp.content)<=65536 THEN
   BEGIN
    _payload:=_resp.content::jsonb;
    _raw:=lower(trim(_payload->>'status'));
    IF _p.api_kind='rx_purple' AND _payload->>'ok'='true'
       AND _raw IN ('operational','degraded','partial_outage','offline','down','major_outage')
       AND jsonb_typeof(_payload->'services')='array'
       AND jsonb_array_length(_payload->'services') BETWEEN 1 AND 20
       AND (_payload->>'generated_at') IS NOT NULL
       AND abs(extract(epoch from (_now-((_payload->>'generated_at')::timestamptz))))<900
    THEN
     _verified:=true;
     FOR _svc IN SELECT value FROM jsonb_array_elements(_payload->'services')
     LOOP
      IF jsonb_typeof(_svc)<>'object' OR coalesce(_svc->>'id','') !~ '^[A-Za-z0-9_-]{1,48}$'
        OR coalesce(_svc->>'name','')='' THEN
       _verified:=false;EXIT;
      END IF;
      _component_state:=CASE lower(coalesce(_svc->>'status',''))
       WHEN 'operational' THEN 'online' WHEN 'online' THEN 'online'
       WHEN 'up' THEN 'online' WHEN 'degraded' THEN 'degraded'
       WHEN 'degraded_performance' THEN 'degraded'
       WHEN 'partial_outage' THEN 'degraded'
       WHEN 'offline' THEN 'offline' WHEN 'down' THEN 'offline'
       WHEN 'major_outage' THEN 'offline' ELSE 'unknown' END;
      IF _component_state='unknown' THEN _verified:=false;EXIT;END IF;
      _all_count:=_all_count+1;
      IF _component_state<>'online' THEN
       _affected_count:=_affected_count+1;
       _affected:=concat_ws(', ',nullif(_affected,''),left(_svc->>'name',70));
      END IF;
      IF _component_state='offline' THEN _offline_count:=_offline_count+1;END IF;
     END LOOP;
     IF _verified AND _all_count>0 THEN
      _state:=CASE WHEN _raw IN ('offline','down','major_outage')
        OR _offline_count=_all_count THEN 'offline'
       WHEN _raw<>'operational' OR _affected_count>0 THEN 'degraded'
       ELSE 'online' END;
      _evidence:=CASE WHEN _state='online'
       THEN 'A API oficial RX Purple confirma funcionamento normal dos serviços.'
       ELSE 'A API oficial RX Purple indica problemas em: '||left(_affected,150) END;
      FOR _svc IN SELECT value FROM jsonb_array_elements(_payload->'services') LOOP
       _component_state:=CASE lower(coalesce(_svc->>'status',''))
        WHEN 'operational' THEN 'online' WHEN 'online' THEN 'online' WHEN 'up' THEN 'online'
        WHEN 'degraded' THEN 'degraded' WHEN 'degraded_performance' THEN 'degraded'
        WHEN 'partial_outage' THEN 'degraded'
        WHEN 'offline' THEN 'offline' WHEN 'down' THEN 'offline'
        WHEN 'major_outage' THEN 'offline' ELSE 'unknown' END;
       INSERT INTO public.app_partner_service_statuses
        (partner_id,service_id,name,status,uptime_30d,checked_at)
       VALUES(_p.id,left(_svc->>'id',48),left(_svc->>'name',80),_component_state,
        CASE WHEN jsonb_typeof(_svc->'uptime_30d')='number'
          AND (_svc->>'uptime_30d')::numeric BETWEEN 0 AND 100
         THEN (_svc->>'uptime_30d')::numeric ELSE NULL END,_now)
       ON CONFLICT(partner_id,service_id) DO UPDATE SET
        name=excluded.name,status=excluded.status,uptime_30d=excluded.uptime_30d,
        checked_at=excluded.checked_at;
      END LOOP;
     END IF;
    END IF;
   EXCEPTION WHEN OTHERS THEN
    _state:='unknown';_verified:=false;
    _evidence:='O JSON recebido não corresponde ao contrato validado.';
    _job_error:='invalid_provider_payload';
   END;
  ELSE
   _evidence:='Falha de rede ou HTTP da API; não comprova indisponibilidade do aplicativo.';
  END IF;

  INSERT INTO public.app_partner_health_checks
   (partner_id,checked_at,http_status,latency_ms,status,evidence,provider_status,probe_source)
  VALUES (_job.partner_id,_now,_resp.status_code,
   CASE WHEN _resp.created IS NOT NULL THEN GREATEST(0,ROUND(EXTRACT(EPOCH FROM (_resp.created-_job.requested_at))*1000))::integer ELSE NULL END,
   _state,left(_evidence,240),left(_raw,64),'pg_net');

  IF _p.id IS NOT NULL THEN
   SELECT array_agg(status ORDER BY checked_at DESC,id DESC)
   INTO _recent_states
   FROM (SELECT id,status,checked_at FROM public.app_partner_health_checks
       WHERE partner_id=_p.id AND probe_source='pg_net'
       ORDER BY checked_at DESC,id DESC LIMIT 2) recent;
   _change:=NULL;
   IF _verified AND array_length(_recent_states,1)=2 THEN
    IF _recent_states[1]='online' AND _recent_states[2]='online' THEN
     IF _p.status IN ('offline','degraded') THEN _change:='up'; END IF;
     UPDATE public.app_partners SET status='online',last_healthy_at=_now,last_check_at=_now,
       last_error=NULL,consecutive_healthy=2,consecutive_unhealthy=0,
       updated_at=_now,
       stability_30d=CASE WHEN jsonb_typeof(_payload->'stability_30d')='number'
        AND (_payload->>'stability_30d')::numeric BETWEEN 0 AND 100
        THEN (_payload->>'stability_30d')::numeric ELSE stability_30d END,
       incidents_30d=CASE WHEN jsonb_typeof(_payload->'incidents_30d')='number'
        AND (_payload->>'incidents_30d')::int>=0
        THEN (_payload->>'incidents_30d')::int ELSE incidents_30d END,
       provider_updated_at=COALESCE((_payload->>'updated_at')::timestamptz,provider_updated_at)
      WHERE id=_p.id;
    ELSIF _recent_states[1] IN ('offline','degraded') AND _recent_states[2] IN ('offline','degraded') THEN
     IF _p.status='online' AND _p.last_healthy_at IS NOT NULL THEN _change:='down';END IF;
     UPDATE public.app_partners SET status=_state,last_check_at=_now,last_error=NULL,
       consecutive_healthy=0,consecutive_unhealthy=2,updated_at=_now
      WHERE id=_p.id;
    END IF;
   END IF;
   IF _change IS NULL THEN
    UPDATE public.app_partners SET
      last_check_at=_now,last_error=CASE WHEN _state='unknown' THEN left(_evidence,240) ELSE NULL END,
      updated_at=_now WHERE id=_p.id;
   END IF;
   IF _change='down' THEN
    SELECT id INTO _incident_id FROM public.app_partner_incidents
     WHERE partner_id=_p.id AND recovered_at IS NULL LIMIT 1;
    IF _incident_id IS NULL THEN
     INSERT INTO public.app_partner_incidents(partner_id,severity,started_at,started_evidence)
     VALUES(_p.id,_state,_now,left(_evidence,240)) RETURNING id INTO _incident_id;
    END IF;
   ELSIF _change='up' THEN
    SELECT id INTO _incident_id FROM public.app_partner_incidents
      WHERE partner_id=_p.id AND recovered_at IS NULL LIMIT 1;
    IF _incident_id IS NOT NULL THEN
     UPDATE public.app_partner_incidents
       SET recovered_at=_now,recovered_evidence=left(_evidence,240)
       WHERE id=_incident_id;
    END IF;
   END IF;

   IF _incident_id IS NOT NULL AND _change IS NOT NULL AND _p.broadcast_enabled THEN
    _message:=CASE WHEN _change='down'
      THEN '🔴 <b>STREAM MONITOR — INSTABILIDADE DE APLICATIVO</b>'||chr(10)||chr(10)
       ||'📱 <b>'||replace(replace(_p.name,'&','&amp;'),'<','&lt;')||'</b>'||chr(10)
       ||'⚠️ '||_evidence||chr(10)
       ||'🕒 '||to_char(_now AT TIME ZONE 'America/Fortaleza','DD/MM/YYYY HH24:MI')||chr(10)
       ||'🔎 Consulte: https://streammonitor.site/aplicativos'
      ELSE '🟢 <b>STREAM MONITOR — APLICATIVO NORMALIZADO</b>'||chr(10)||chr(10)
       ||'📱 <b>'||replace(replace(_p.name,'&','&amp;'),'<','&lt;')||'</b>'||chr(10)
       ||'✅ API oficial voltou a indicar funcionamento normal.'||chr(10)
       ||'🕒 '||to_char(_now AT TIME ZONE 'America/Fortaleza','DD/MM/YYYY HH24:MI')||chr(10)
       ||'🔎 https://streammonitor.site/aplicativos' END;
    INSERT INTO public.telegram_outbox
      (idempotency_key,target,text,source,status,attempts,max_attempts,
       next_attempt_at,channel_id,alert_event)
    SELECT 'app_partner:'||_incident_id::text||':'||_change||':'||ch.id::text,
     ch.target,_message,'app_partner_status','pending',0,7,now(),ch.id,'app_partner_'||_change
    FROM public.alert_channels ch
    WHERE ch.kind='telegram' AND ch.enabled=true
      AND nullif(trim(ch.target),'') IS NOT NULL
    ON CONFLICT(idempotency_key) DO NOTHING;
    GET DIAGNOSTICS _queued=ROW_COUNT;
    _alerts:=_alerts+_queued;
    IF _change='down' THEN
     UPDATE public.app_partner_incidents SET alert_enqueued_at=_now WHERE id=_incident_id;
    ELSE
     UPDATE public.app_partner_incidents SET recovery_enqueued_at=_now WHERE id=_incident_id;
    END IF;
   END IF;
  END IF;
  UPDATE public.app_partner_probe_jobs SET processed_at=_now,error_code=_job_error WHERE id=_job.id;
  _processed:=_processed+1;
 END LOOP;

 FOR _p IN SELECT id,api_url FROM public.app_partners
   WHERE partnership_status='active' AND monitor_enabled=true
   AND api_kind='rx_purple' AND api_url LIKE 'https://%'
 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.app_partner_probe_jobs j
     WHERE j.partner_id=_p.id AND j.processed_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM public.app_partner_probe_jobs j
     WHERE j.partner_id=_p.id AND j.requested_at>clock_timestamp()-interval '45 seconds')
  THEN
   _request:=net.http_get(url:=_p.api_url,
     headers:='{"Accept":"application/json","User-Agent":"StreamMonitor-Partner-Health/1.0"}'::jsonb,
     timeout_milliseconds:=9000);
   INSERT INTO public.app_partner_probe_jobs(partner_id,request_id)
    VALUES(_p.id,_request);
   _scheduled:=_scheduled+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('processed',_processed,'scheduled',_scheduled,'alerts_enqueued',_alerts);
END
$$;
REVOKE ALL ON FUNCTION public.app_partner_pgnet_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.app_partner_pgnet_tick() TO postgres,service_role;
SELECT cron.schedule('streammonitor-app-partners-rx-purple','* * * * *','SELECT public.app_partner_pgnet_tick()');

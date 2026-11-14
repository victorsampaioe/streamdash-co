-- Restore the Grafana exporter schedule from the authenticated, already
-- configured billing job. This preserves the existing secret securely.
DO $job$
DECLARE template text;
BEGIN
 SELECT command INTO template FROM cron.job
 WHERE jobname='streammonitor-telegram-billing-daily' AND active LIMIT 1;
 IF template IS NULL OR
    position('/api/public/cron/billing' IN template)=0 OR
    position('x-cron-secret' IN lower(template))=0 OR
    position('net.http_post' IN lower(template))=0
 THEN RAISE NOTICE 'Grafana exporter cron not created: secure template missing';
 ELSE
   PERFORM cron.schedule('streammonitor-grafana-otlp-15m','*/15 * * * *',
     replace(template,'/api/public/cron/billing','/api/public/cron/observability'));
 END IF;
END $job$;
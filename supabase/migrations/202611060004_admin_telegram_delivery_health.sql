CREATE OR REPLACE FUNCTION public.get_admin_telegram_delivery_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
   RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
   'observed_since',now()-interval '24 hours',
   'sent',count(*) FILTER (WHERE ok),
   'failed',count(*) FILTER (WHERE NOT ok),
   'customer_sent',count(*) FILTER (WHERE ok AND channel_id IS NOT NULL),
   'admin_sent',count(*) FILTER (WHERE ok AND channel_id IS NULL),
   'last_success',max(sent_at) FILTER (WHERE ok),
   'offline_sent',count(*) FILTER (WHERE ok AND event IN ('tg_dns_offline','tg_server_offline')),
   'recovery_sent',count(*) FILTER (WHERE ok AND event IN ('tg_dns_online','tg_server_online')),
   'failed_by_type',coalesce((
     SELECT jsonb_agg(to_jsonb(q)) FROM (
       SELECT event,count(*)::int AS failed
       FROM public.notifications_log
       WHERE sent_at >= now() - interval '24 hours' AND ok=false
       GROUP BY event ORDER BY count(*) DESC LIMIT 12
     ) q
   ),'[]'::jsonb)
 ) INTO result
 FROM public.notifications_log
 WHERE sent_at >= now()-interval '24 hours';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_admin_telegram_delivery_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_telegram_delivery_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_server(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE _owner uuid;
BEGIN
  SELECT owner_id INTO _owner FROM public.servers WHERE id = _id;
  IF _owner IS NULL THEN RETURN false; END IF;
  IF _owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.iptv_catalog_items WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_changes WHERE server_id = _id;
  DELETE FROM public.iptv_catalog_daily WHERE server_id = _id;
  DELETE FROM public.iptv_stream_tests WHERE server_id = _id;
  DELETE FROM public.iptv_syncs WHERE server_id = _id;
  DELETE FROM public.iptv_alerts WHERE server_id = _id;
  DELETE FROM public.iptv_ip_history WHERE server_id = _id;
  DELETE FROM public.iptv_login_attempts WHERE server_id = _id;
  DELETE FROM public.dns_snapshots WHERE server_id = _id;
  DELETE FROM public.dns_ip_history WHERE server_id = _id;
  DELETE FROM public.dns_alerts WHERE server_id = _id;
  DELETE FROM public.kuma_heartbeats WHERE server_id = _id;
  DELETE FROM public.kuma_incidents WHERE server_id = _id;
  DELETE FROM public.kuma_monitor_status WHERE server_id = _id;
  DELETE FROM public.region_checks WHERE server_id = _id;
  DELETE FROM public.checks WHERE server_id = _id;
  DELETE FROM public.notifications_log WHERE server_id = _id;
  DELETE FROM public.incidents WHERE server_id = _id;
  DELETE FROM public.user_achievements WHERE server_id = _id;
  DELETE FROM public.server_analysis WHERE server_id = _id;
  DELETE FROM public.servers WHERE id = _id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_server(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_server(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_subscription(_user_id uuid, _plan plan_type, _days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _base timestamptz; _new timestamptz; _sub public.subscriptions;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _days IS NULL OR _days = 0 THEN RAISE EXCEPTION 'invalid days'; END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE user_id = _user_id ORDER BY expires_at DESC LIMIT 1;

  _base := GREATEST(COALESCE(_sub.expires_at, now()), now());
  _new := _base + (_days || ' days')::interval;

  IF _sub.id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
    VALUES (_user_id, _plan, 'active', now(), _new);
  ELSE
    UPDATE public.subscriptions
      SET plan = _plan,
          status = CASE WHEN _new > now() THEN 'active'::subscription_status ELSE 'expired'::subscription_status END,
          expires_at = _new,
          cancelled_at = NULL,
          updated_at = now()
      WHERE id = _sub.id;
  END IF;

  RETURN jsonb_build_object('expires_at', _new, 'plan', _plan);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_subscription(uuid, plan_type, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription(uuid, plan_type, integer) TO authenticated;

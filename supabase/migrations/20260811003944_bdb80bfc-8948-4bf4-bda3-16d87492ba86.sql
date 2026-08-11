DROP FUNCTION IF EXISTS public.get_iptv_radar_stats();

CREATE OR REPLACE FUNCTION public.get_iptv_radar_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'total_db_servers', (SELECT count(*) FROM servers),
        'with_host', (SELECT count(*) FROM servers WHERE host IS NOT NULL AND host <> ''),
        'with_username', (SELECT count(*) FROM servers WHERE iptv_username IS NOT NULL AND iptv_username <> ''),
        'with_password', (SELECT count(*) FROM servers WHERE iptv_password IS NOT NULL AND iptv_password <> ''),
        'login_approved', (
            SELECT count(*) 
            FROM servers s
            LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
            WHERE (la.failures IS NULL OR la.failures = 0)
              AND s.iptv_username IS NOT NULL 
              AND s.iptv_password IS NOT NULL
        ),
        'total_monitored', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            LEFT JOIN subscriptions sub ON p.id = sub.user_id
            WHERE s.monitoring_paused = false 
              AND (p.is_reseller = true OR (sub.status IN ('active', 'trial') AND sub.expires_at > now()))
        ),
        'configured_iptv', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            LEFT JOIN subscriptions sub ON p.id = sub.user_id
            LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
            WHERE s.monitoring_paused = false 
              AND (p.is_reseller = true OR (sub.status IN ('active', 'trial') AND sub.expires_at > now()))
              AND s.iptv_username IS NOT NULL 
              AND s.iptv_password IS NOT NULL
              AND (la.failures IS NULL OR la.failures = 0)
        ),
        'waiting_credentials', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            LEFT JOIN subscriptions sub ON p.id = sub.user_id
            WHERE s.monitoring_paused = false 
              AND (p.is_reseller = true OR (sub.status IN ('active', 'trial') AND sub.expires_at > now()))
              AND (s.iptv_username IS NULL OR s.iptv_password IS NULL OR s.iptv_username = '' OR s.iptv_password = '')
        ),
        'excluded_reasons', json_build_object(
            'no_username', (SELECT count(*) FROM servers WHERE iptv_username IS NULL OR iptv_username = ''),
            'no_password', (SELECT count(*) FROM servers WHERE iptv_password IS NULL OR iptv_password = ''),
            'invalid_login', (SELECT count(*) FROM iptv_login_attempts WHERE failures > 0),
            'paused', (SELECT count(*) FROM servers WHERE monitoring_paused = true),
            'inactive_account', (
                SELECT count(*) 
                FROM servers s
                JOIN profiles p ON s.owner_id = p.id
                LEFT JOIN subscriptions sub ON p.id = sub.user_id
                WHERE NOT (p.is_reseller = true OR (sub.status IN ('active', 'trial') AND sub.expires_at > now()))
            )
        ),
        'total_contents', (SELECT count(*) FROM iptv_global_catalog),
        'first_detections', (SELECT count(*) FROM iptv_catalog_matches WHERE is_first_detection = true)
    ) INTO result;
    
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_iptv_radar_stats() TO authenticated;

-- Update batch sync to handle the same active account logic
CREATE OR REPLACE FUNCTION public.run_radar_batch_sync()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    found_ids uuid[];
BEGIN
    SELECT array_agg(s.id) INTO found_ids
    FROM servers s
    JOIN profiles p ON s.owner_id = p.id
    LEFT JOIN subscriptions sub ON p.id = sub.user_id
    LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
    WHERE s.monitoring_paused = false
      AND (p.is_reseller = true OR (sub.status IN ('active', 'trial') AND sub.expires_at > now()))
      AND s.iptv_username IS NOT NULL
      AND s.iptv_password IS NOT NULL
      AND (la.failures IS NULL OR la.failures = 0);

    RETURN json_build_object(
        'servers_found', COALESCE(array_length(found_ids, 1), 0),
        'server_ids', COALESCE(found_ids, ARRAY[]::uuid[])
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_radar_batch_sync() TO authenticated;
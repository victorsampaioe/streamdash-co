-- Fix get_iptv_radar_stats to not fail on missing column and improve robustness
CREATE OR REPLACE FUNCTION public.get_iptv_radar_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            LEFT JOIN reseller_wallet w ON p.id = w.reseller_id
            WHERE s.monitoring_paused = false 
              AND (
                p.id IN (SELECT user_id FROM user_roles WHERE role = 'admin')
                OR
                (p.is_reseller = true AND (p.credits > 0 OR COALESCE(w.credits, 0) > 0))
                OR 
                (p.is_reseller = false AND sub.status IN ('active', 'trial') AND sub.expires_at > now())
              )
        ),
        'configured_iptv', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            LEFT JOIN subscriptions sub ON p.id = sub.user_id
            LEFT JOIN reseller_wallet w ON p.id = w.reseller_id
            LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
            WHERE s.monitoring_paused = false 
              AND (
                p.id IN (SELECT user_id FROM user_roles WHERE role = 'admin')
                OR
                (p.is_reseller = true AND (p.credits > 0 OR COALESCE(w.credits, 0) > 0))
                OR 
                (p.is_reseller = false AND sub.status IN ('active', 'trial') AND sub.expires_at > now())
              )
              AND s.iptv_username IS NOT NULL 
              AND s.iptv_password IS NOT NULL
              AND (la.failures IS NULL OR la.failures = 0)
        ),
        'waiting_credentials', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            LEFT JOIN subscriptions sub ON p.id = sub.user_id
            LEFT JOIN reseller_wallet w ON p.id = w.reseller_id
            WHERE s.monitoring_paused = false 
              AND (
                p.id IN (SELECT user_id FROM user_roles WHERE role = 'admin')
                OR
                (p.is_reseller = true AND (p.credits > 0 OR COALESCE(w.credits, 0) > 0))
                OR 
                (p.is_reseller = false AND sub.status IN ('active', 'trial') AND sub.expires_at > now())
              )
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
                LEFT JOIN reseller_wallet w ON p.id = w.reseller_id
                WHERE NOT (
                    p.id IN (SELECT user_id FROM user_roles WHERE role = 'admin')
                    OR
                    (p.is_reseller = true AND (p.credits > 0 OR COALESCE(w.credits, 0) > 0))
                    OR 
                    (p.is_reseller = false AND sub.status IN ('active', 'trial') AND sub.expires_at > now())
                )
            )
        ),
        'total_contents', (SELECT count(*) FROM iptv_global_catalog),
        'first_detections', (SELECT count(*) FROM iptv_global_catalog WHERE first_server_id IS NOT NULL)
    ) INTO result;
    
    RETURN result;
END;
$function$;

-- Update run_radar_batch_sync to handle admins and be more robust
CREATE OR REPLACE FUNCTION public.run_radar_batch_sync()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    found_ids uuid[];
BEGIN
    SELECT array_agg(s.id) INTO found_ids
    FROM servers s
    JOIN profiles p ON s.owner_id = p.id
    LEFT JOIN subscriptions sub ON p.id = sub.user_id
    LEFT JOIN reseller_wallet w ON p.id = w.reseller_id
    LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
    WHERE s.monitoring_paused = false
      AND (
        p.id IN (SELECT user_id FROM user_roles WHERE role = 'admin')
        OR
        (p.is_reseller = true AND (p.credits > 0 OR COALESCE(w.credits, 0) > 0))
        OR
        (p.is_reseller = false AND sub.status IN ('active', 'trial') AND sub.expires_at > now())
      )
      AND s.iptv_username IS NOT NULL AND s.iptv_username <> ''
      AND s.iptv_password IS NOT NULL AND s.iptv_password <> ''
      AND s.host IS NOT NULL AND s.host <> ''
      AND (la.failures IS NULL OR la.failures = 0);

    RETURN json_build_object(
        'servers_found', COALESCE(array_length(found_ids, 1), 0),
        'server_ids', COALESCE(found_ids, ARRAY[]::uuid[])
    );
END;
$function$;

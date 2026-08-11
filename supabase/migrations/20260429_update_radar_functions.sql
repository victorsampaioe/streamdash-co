-- Atualiza as funções do Radar para serem mais precisas e refletirem o status real dos servidores.

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
        'total_monitored', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            WHERE s.monitoring_paused = false 
              AND p.is_reseller = true
        ),
        'configured_iptv', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
            WHERE s.monitoring_paused = false 
              AND p.is_reseller = true
              AND s.iptv_username IS NOT NULL 
              AND s.iptv_password IS NOT NULL
              AND (la.failures IS NULL OR la.failures = 0)
        ),
        'waiting_credentials', (
            SELECT count(*) 
            FROM servers s
            JOIN profiles p ON s.owner_id = p.id
            WHERE s.monitoring_paused = false 
              AND p.is_reseller = true
              AND (s.iptv_username IS NULL OR s.iptv_password IS NULL)
        ),
        'total_contents', (SELECT count(*) FROM iptv_global_catalog),
        'first_detections', (SELECT count(*) FROM iptv_catalog_matches WHERE is_first_detection = true)
    ) INTO result;
    
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_radar_batch_sync()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    found_ids uuid[];
BEGIN
    -- Seleciona apenas servidores elegíveis:
    -- 1. Pertencem a revendedores ativos (pagantes)
    -- 2. Não estão pausados
    -- 3. Possuem credenciais preenchidas
    -- 4. O último login foi um sucesso (failures = 0 ou nulo)
    SELECT array_agg(s.id) INTO found_ids
    FROM servers s
    JOIN profiles p ON s.owner_id = p.id
    LEFT JOIN iptv_login_attempts la ON s.id = la.server_id
    WHERE s.monitoring_paused = false
      AND p.is_reseller = true
      AND s.iptv_username IS NOT NULL
      AND s.iptv_password IS NOT NULL
      AND (la.failures IS NULL OR la.failures = 0);

    RETURN json_build_object(
        'servers_found', COALESCE(array_length(found_ids, 1), 0),
        'server_ids', COALESCE(found_ids, ARRAY[]::uuid[])
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_iptv_radar_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_radar_batch_sync() TO authenticated;

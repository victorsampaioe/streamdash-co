DELETE FROM public.core_execution_logs
WHERE task_type = 'iptv-player-proxy'
  AND status IN ('failed','timeout')
  AND (response_status IN (501,403,502) OR error_message ILIKE '%aborted%');
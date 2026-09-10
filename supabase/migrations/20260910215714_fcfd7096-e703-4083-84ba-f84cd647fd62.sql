REVOKE INSERT, UPDATE, DELETE ON public.api_keys FROM authenticated;
DROP POLICY api_keys_owner_create ON public.api_keys;
DROP POLICY api_keys_owner_update ON public.api_keys;
DROP POLICY api_keys_owner_delete ON public.api_keys;

REVOKE INSERT, UPDATE, DELETE ON public.api_webhooks FROM authenticated;
DROP POLICY api_webhooks_owner_create ON public.api_webhooks;
DROP POLICY api_webhooks_owner_update ON public.api_webhooks;
DROP POLICY api_webhooks_owner_delete ON public.api_webhooks;

CREATE OR REPLACE FUNCTION public.api_validate_key_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_account uuid; v_environment text;
BEGIN
  SELECT account_id, environment INTO v_account, v_environment
  FROM public.api_subscriptions WHERE id = NEW.subscription_id;
  IF v_account IS NULL OR v_account <> NEW.account_id OR v_environment <> NEW.environment THEN
    RAISE EXCEPTION 'key subscription ownership mismatch';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.api_validate_key_ownership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_validate_key_ownership() TO service_role;
CREATE TRIGGER api_keys_validate_ownership BEFORE INSERT OR UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.api_validate_key_ownership();

CREATE OR REPLACE FUNCTION public.api_record_usage(
 p_usage_date date, p_account_id uuid, p_key_id uuid, p_environment text,
 p_endpoint text, p_status_code integer, p_duration_ms integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
 INSERT INTO public.api_usage_daily(usage_date,account_id,key_id,environment,endpoint,request_count,success_count,error_count,rate_limited_count,total_duration_ms)
 VALUES(p_usage_date,p_account_id,p_key_id,p_environment,p_endpoint,1,CASE WHEN p_status_code<400 THEN 1 ELSE 0 END,CASE WHEN p_status_code>=400 THEN 1 ELSE 0 END,CASE WHEN p_status_code=429 THEN 1 ELSE 0 END,GREATEST(0,p_duration_ms))
 ON CONFLICT (usage_date,account_id,key_id,environment,endpoint)
 DO UPDATE SET request_count=public.api_usage_daily.request_count+1,
 success_count=public.api_usage_daily.success_count+CASE WHEN p_status_code<400 THEN 1 ELSE 0 END,
 error_count=public.api_usage_daily.error_count+CASE WHEN p_status_code>=400 THEN 1 ELSE 0 END,
 rate_limited_count=public.api_usage_daily.rate_limited_count+CASE WHEN p_status_code=429 THEN 1 ELSE 0 END,
 total_duration_ms=public.api_usage_daily.total_duration_ms+GREATEST(0,p_duration_ms),updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.api_record_usage(date,uuid,uuid,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_record_usage(date,uuid,uuid,text,text,integer,integer) TO service_role;
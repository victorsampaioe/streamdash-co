-- Corrige a função que travava qualquer atualização em subscriptions
CREATE OR REPLACE FUNCTION public.sync_api_entitlement_from_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'subscriptions' THEN
    target_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'reseller_wallet' THEN
    target_id := NEW.reseller_id;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    target_id := NEW.id;
  END IF;
  IF target_id IS NOT NULL THEN
    PERFORM public.sync_api_subscription_entitlement(target_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Aviso único de expiração por conta
CREATE OR REPLACE FUNCTION public.tg_clear_expiry_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('active','trial') AND NEW.expires_at > now() THEN
    DELETE FROM public.expiry_notices WHERE user_id = NEW.user_id AND kind = 'subscription_expired';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS subscriptions_clear_expiry_notice ON public.subscriptions;
CREATE TRIGGER subscriptions_clear_expiry_notice
AFTER INSERT OR UPDATE OF status, expires_at ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_clear_expiry_notice();

UPDATE public.subscriptions SET status = 'expired'
WHERE status IN ('active','trial') AND expires_at < now();

INSERT INTO public.expiry_notices (user_id, kind)
SELECT s.user_id, 'subscription_expired' FROM public.subscriptions s WHERE s.status = 'expired'
ON CONFLICT (user_id, kind) DO NOTHING;
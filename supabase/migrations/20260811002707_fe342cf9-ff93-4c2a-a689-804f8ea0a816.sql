CREATE OR REPLACE FUNCTION public.handle_payment_approval()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
 AS $function$
 DECLARE
     v_credits INTEGER;
 BEGIN
     -- We use NEW.plan::text for safety if it's already text, 
     -- and cast to public.plan_type for comparison if needed.
     IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
         -- Check if it's a credit pack. Explicit cast to plan_type.
         BEGIN
             SELECT credits_amount INTO v_credits
             FROM public.credit_pack_definitions
             WHERE plan_id = NEW.plan::public.plan_type;
             
             IF FOUND THEN
                 -- Add credits to user
                 UPDATE public.profiles
                 SET credits = COALESCE(credits, 0) + v_credits
                 WHERE id = NEW.user_id;
    
                 -- Log to history
                 INSERT INTO public.credit_history (user_id, amount, type, description)
                 VALUES (NEW.user_id, v_credits, 'purchase', 'Compra de ' || v_credits || ' créditos');
             END IF;
         EXCEPTION WHEN OTHERS THEN
             -- If casting to plan_type fails (e.g. not a valid enum value), it's not a credit pack
             NULL;
         END;
     END IF;
     RETURN NEW;
 END;
 $function$;

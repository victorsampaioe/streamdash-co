UPDATE public.subscriptions 
SET status = 'active', 
    expires_at = (now() + interval '31 days') 
WHERE user_id = 'cb9607f2-1358-422e-9b3a-f14af89d8096';
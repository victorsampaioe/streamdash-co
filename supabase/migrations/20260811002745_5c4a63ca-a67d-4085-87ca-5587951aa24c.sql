INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
VALUES ('650ba7c4-4a93-42a7-b49d-5222d7fd8627', 'monthly', 'active', now(), now() + interval '31 days')
ON CONFLICT (user_id) DO UPDATE
SET plan = 'monthly',
    status = 'active',
    expires_at = CASE
      WHEN public.subscriptions.expires_at > now() THEN public.subscriptions.expires_at + interval '31 days'
      ELSE now() + interval '31 days'
    END,
    updated_at = now();

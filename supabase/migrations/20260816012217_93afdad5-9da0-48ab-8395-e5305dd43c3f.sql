-- Update subscription_is_active to include signup bonus days
create or replace function public.subscription_is_active(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = _user_id and expires_at > now() and status in ('trial','active')
  ) or exists (
    select 1 from public.profiles
    where id = _user_id 
      and created_at + (coalesce(signup_bonus_days, 0) || ' days')::interval > now()
  );
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO service_role;

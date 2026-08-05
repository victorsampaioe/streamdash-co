-- 2. Identify resellers
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'reseller'::app_role FROM public.profiles 
WHERE is_reseller = true AND parent_id IS NULL
ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

-- 3. Identify sub_resellers (is_reseller = true and has a parent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'sub_reseller'::app_role FROM public.profiles 
WHERE is_reseller = true AND parent_id IS NOT NULL
ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

-- 4. Identify customers (not a reseller)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'customer'::app_role FROM public.profiles 
WHERE is_reseller = false
ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

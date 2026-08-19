-- Enum para status da licença do Android Play
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'android_play_status') THEN
        CREATE TYPE public.android_play_status AS ENUM ('pending', 'active', 'suspended', 'expired');
    END IF;
END $$;

-- Tabela de licenças do Stream Monitor Play
CREATE TABLE IF NOT EXISTS public.reseller_licenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status public.android_play_status DEFAULT 'pending',
    expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    UNIQUE(reseller_id)
);

-- Tabela para resolução automática de login (cache de associação)
CREATE TABLE IF NOT EXISTS public.android_client_associations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_username text NOT NULL,
    client_password text NOT NULL,
    server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE NOT NULL,
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    last_login_at timestamptz DEFAULT now(),
    UNIQUE(client_username, client_password, server_id)
);

-- Configurações visuais por revendedor
CREATE TABLE IF NOT EXISTS public.reseller_app_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    app_name text,
    logo_url text,
    primary_color text DEFAULT '#3B82F6',
    updated_at timestamptz DEFAULT now(),
    UNIQUE(reseller_id)
);

-- Habilitar RLS
ALTER TABLE public.reseller_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.android_client_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_app_config ENABLE ROW LEVEL SECURITY;

-- Permissões
GRANT SELECT, INSERT, UPDATE ON public.reseller_licenses TO authenticated;
GRANT ALL ON public.reseller_licenses TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.android_client_associations TO authenticated;
GRANT ALL ON public.android_client_associations TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.reseller_app_config TO authenticated;
GRANT ALL ON public.reseller_app_config TO service_role;

-- Políticas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admins can manage all licenses') THEN
        CREATE POLICY "Admins can manage all licenses" ON public.reseller_licenses FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Resellers can view own license') THEN
        CREATE POLICY "Resellers can view own license" ON public.reseller_licenses FOR SELECT TO authenticated USING (auth.uid() = reseller_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admins can view associations') THEN
        CREATE POLICY "Admins can view associations" ON public.android_client_associations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Public read for app config by reseller') THEN
        CREATE POLICY "Public read for app config by reseller" ON public.reseller_app_config FOR SELECT TO anon, authenticated USING (true);
    END IF;
END $$;

-- Função para validar licença e retornar status
CREATE OR REPLACE FUNCTION public.validate_android_play_access(_reseller_id uuid)
RETURNS TABLE(is_active boolean, status text, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (status = 'active' AND (expires_at IS NULL OR expires_at > now())) as is_active,
    status::text,
    expires_at
  FROM public.reseller_licenses
  WHERE reseller_id = _reseller_id;
$$;

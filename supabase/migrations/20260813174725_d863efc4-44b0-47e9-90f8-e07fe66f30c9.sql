-- Tabelas para o Módulo de Player Inteligente (MVP)

-- 1. Configurações White-label por Revendedor
CREATE TABLE public.player_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    brand_name text,
    logo_url text,
    primary_color text DEFAULT '#3B82F6',
    secondary_color text DEFAULT '#1E293B',
    custom_domain text UNIQUE,
    welcome_message text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Sessões de Clientes Finais (Autenticação Xtream via Player)
CREATE TABLE public.player_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) NOT NULL,
    server_id uuid REFERENCES public.servers(id) NOT NULL,
    xtream_user text NOT NULL,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    device_info jsonb,
    last_ip inet,
    last_active_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- 3. Histórico de Reprodução do Cliente Final
CREATE TABLE public.player_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES public.player_sessions(id) ON DELETE CASCADE NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL, -- live, movie, episode
    last_position_seconds int DEFAULT 0,
    duration_seconds int DEFAULT 0,
    watched_at timestamptz DEFAULT now()
);

-- 4. Favoritos do Cliente Final
CREATE TABLE public.player_favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES public.player_sessions(id) ON DELETE CASCADE NOT NULL,
    content_id text NOT NULL,
    content_type text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(session_id, content_id, content_type)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_settings TO authenticated;
GRANT ALL ON public.player_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.player_sessions TO authenticated;
GRANT ALL ON public.player_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_history TO authenticated;
GRANT ALL ON public.player_history TO service_role;

GRANT SELECT, INSERT, DELETE ON public.player_favorites TO authenticated;
GRANT ALL ON public.player_favorites TO service_role;

-- RLS
ALTER TABLE public.player_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_favorites ENABLE ROW LEVEL SECURITY;

-- Políticas player_settings: Revendedor acessa o seu
CREATE POLICY "Users can manage their own player settings"
ON public.player_settings
FOR ALL
TO authenticated
USING (auth.uid() = profile_id);

-- Políticas player_sessions: Revendedor acessa sessões dos seus servidores
CREATE POLICY "Resellers can view their client sessions"
ON public.player_sessions
FOR SELECT
TO authenticated
USING (reseller_id = auth.uid());

-- Permitir que o token da sessão acesse seus próprios dados (usado via RPC ou anon se necessário futuramente)
-- Por enquanto, o acesso do player será via Server Functions com supabaseAdmin/service_role para simplificar o MVP.

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_player_settings_updated_at
BEFORE UPDATE ON public.player_settings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

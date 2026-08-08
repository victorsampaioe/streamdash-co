
-- Loja Stream Monitor
CREATE TABLE IF NOT EXISTS public.store_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Configurações globais da loja
CREATE TABLE IF NOT EXISTS public.store_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- Inserir produto inicial Gemini Pro
INSERT INTO public.store_products (name, description, price, image_url, is_active)
VALUES (
    'Gemini Pro - 18 meses', 
    'Gemini Pro\n5 TB de armazenamento no Google Drive\nFerramentas de criação de vídeos\nFerramentas de criação de imagens\nRecursos de IA premium',
    60.00,
    '/assets/gemini-pro-promo.jpg',
    true
) ON CONFLICT DO NOTHING;

-- Configurar PIX global inicial
INSERT INTO public.store_settings (key, value)
VALUES (
    'global_pix',
    '{"key": "brunohbibiano1@gmail.com", "name": "Stream Monitor Admin", "city": "SAO PAULO"}'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- RLS
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Políticas: Todos podem ver produtos ativos
DROP POLICY IF EXISTS "Anyone can view active products" ON public.store_products;
CREATE POLICY "Anyone can view active products" ON public.store_products
    FOR SELECT TO authenticated USING (is_active = true);

-- Políticas: Apenas admins podem fazer tudo
DROP POLICY IF EXISTS "Admins can manage products" ON public.store_products;
CREATE POLICY "Admins can manage products" ON public.store_products
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Políticas: Todos podem ver configurações da loja
DROP POLICY IF EXISTS "Anyone can view store settings" ON public.store_settings;
CREATE POLICY "Anyone can view store settings" ON public.store_settings
    FOR SELECT TO authenticated USING (true);

-- Políticas: Apenas admins gerenciam configurações
DROP POLICY IF EXISTS "Admins can manage store settings" ON public.store_settings;
CREATE POLICY "Admins can manage store settings" ON public.store_settings
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));

-- Grants
GRANT SELECT ON public.store_products TO authenticated;
GRANT SELECT ON public.store_settings TO authenticated;
GRANT ALL ON public.store_products TO service_role;
GRANT ALL ON public.store_settings TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.store_products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;

-- Tabela de produtos da loja
CREATE TABLE IF NOT EXISTS public.store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de configurações da loja
CREATE TABLE IF NOT EXISTS public.store_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Permissões
GRANT SELECT ON public.store_products TO authenticated;
GRANT ALL ON public.store_products TO service_role;

GRANT SELECT ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

-- RLS
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Políticas store_products
CREATE POLICY "authenticated_select_products" ON public.store_products 
  FOR SELECT TO authenticated USING (is_active = true OR (SELECT public.has_role(auth.uid(), 'admin')));

CREATE POLICY "admin_manage_products" ON public.store_products 
  FOR ALL TO authenticated USING ((SELECT public.has_role(auth.uid(), 'admin')));

-- Políticas store_settings
CREATE POLICY "authenticated_select_settings" ON public.store_settings 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_manage_settings" ON public.store_settings 
  FOR ALL TO authenticated USING ((SELECT public.has_role(auth.uid(), 'admin')));

-- Dados iniciais
INSERT INTO public.store_settings (key, value)
VALUES ('global_pix', '{"key": "brunohbibiano1@gmail.com", "name": "Admin Stream Monitor", "city": "SAO PAULO"}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.store_products (name, description, price, image_url, is_active)
VALUES (
  'Gemini Pro - 18 meses', 
  'Gemini Pro\n5 TB de armazenamento no Google Drive\nFerramentas de criação de vídeos\nFerramentas de criação de imagens\nRecursos de IA premium', 
  60.00, 
  '/mnt/user-uploads/5167984575500717357.jpg',
  true
) ON CONFLICT DO NOTHING;

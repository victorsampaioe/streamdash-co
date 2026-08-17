
-- Migration: Subdomínios Personalizados para Revendas
-- Descrição: Adiciona campo slug à tabela player_settings para identificação via subdomínio.

-- 1. Adicionar coluna slug em player_settings
ALTER TABLE public.player_settings ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- 2. Garantir que slugs sejam minúsculos e sem caracteres especiais
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_settings_slug_check') THEN
        ALTER TABLE public.player_settings ADD CONSTRAINT player_settings_slug_check 
          CHECK (slug ~ '^[a-z0-9-]+$');
    END IF;
END $$;

-- 3. Criar índice para busca rápida por slug
CREATE INDEX IF NOT EXISTS idx_player_settings_slug ON public.player_settings(slug);

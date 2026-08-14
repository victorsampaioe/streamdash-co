-- 1) Tabela de idempotência de alertas (usada pelo código mas inexistente no banco)
CREATE TABLE IF NOT EXISTS public.alert_idempotency (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.alert_idempotency TO service_role;
ALTER TABLE public.alert_idempotency ENABLE ROW LEVEL SECURITY;

-- 2) Campos de estado no incidente
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS alert_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS regions text;

-- 3) Fecha incidentes duplicados antigos (mantém o mais recente aberto por servidor)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY server_id ORDER BY started_at DESC) AS rn
  FROM public.incidents WHERE ended_at IS NULL
)
UPDATE public.incidents i SET ended_at = now()
FROM ranked r WHERE i.id = r.id AND r.rn > 1;

-- 4) Garante no máximo 1 incidente aberto por servidor (atomicidade do alerta)
CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open_per_server
  ON public.incidents (server_id) WHERE ended_at IS NULL;
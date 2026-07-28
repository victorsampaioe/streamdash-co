# Plano — 5 melhorias no StreamMonitor

## 1. Auto-análise ao cadastrar DNS
Ao criar/editar um servidor, disparar server function `analyzeHost` que coleta e persiste:
- SSL válido, dias até expirar, emissor, algoritmo
- Cloudflare / CDN detectado (via headers `server`, `cf-ray`, ASN)
- IPv4 / IPv6 (DNS A/AAAA via Google DoH)
- Nameservers (NS records)
- TTL do A record
- Tempo de resposta HTTPS
- Geolocalização + ASN (via ip-api.com ou ipapi.co, grátis)
- Histórico de certificado (via crt.sh)

**Nova tabela `server_analysis`** (1:1 com servers): guarda snapshot JSON + campos indexáveis (is_cloudflare, cdn_provider, country, asn, ssl_issuer, ssl_expires_at, ipv6_enabled). Re-analisa sob demanda por botão "Reanalisar".

Exibido em nova aba "Análise" na página do servidor.

## 2. Selo "DNS Monitorada"
Componente `<MonitorBadge server={...} />` renderizando cartão com:
- Logo StreamMonitor + texto "DNS Monitorada"
- Nome do servidor + status atual
- QR Code (qrcode.react) apontando para `https://streammonitor.site/status/<slug>`
- Botão "Baixar PNG" (html-to-image) e "Copiar embed HTML"

Disponível em `/app/servers/:id` > aba "Selo". Requer `is_public = true` (senão orienta a publicar).

## 3. Trial de 2 dias (novos cadastros)
Alterar `handle_new_user`: default `trial_days = 2` (em vez de 30). Se veio por código de indicação, soma `signup_bonus_days` (padrão 2 → total 4). Admin/Victor permanece com 30 no bônus.

Não afeta usuários existentes.

## 4. Sistema de Conquistas
**Nova tabela `achievements`** (catálogo estático seedado) e `user_achievements` (user_id, achievement_code, server_id, unlocked_at).

Conquistas iniciais:
- 🏆 `no_incidents_30d` — servidor 30 dias sem incidentes
- 🥇 `monitoring_100d` — usuário com servidor há 100+ dias
- ⚡ `low_latency` — servidor com média < 100ms nas últimas 24h (top ranking)
- 🛡 `ssl_always_valid` — SSL sempre válido últimos 60 dias

Função SQL `evaluate_achievements(_user_id)` executada:
- No dashboard (query on mount) 
- Após cada check via trigger leve (só marca, não recomputa tudo)

Nova página `/app/achievements` + preview no dashboard.

## 5. Aba DNS Pública
Nova rota pública `/dns` (fora de auth): lista apenas **nome** dos servidores com `is_public = true`, com badge de status. Sem link, sem host, sem slug clicável — apenas nome + estado (up/down/degraded). RPC `get_public_dns_list()` security definer que retorna `name, current_status, last_checked_at`.

## Detalhes técnicos

**Nova migração** (uma só):
```sql
-- 1. server_analysis
CREATE TABLE public.server_analysis (
  server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  is_cloudflare boolean, cdn_provider text,
  ipv4 text[], ipv6 text[], nameservers text[], ttl_seconds int,
  ssl_issuer text, ssl_expires_at timestamptz, ssl_algorithm text,
  country text, city text, asn text, org text,
  response_ms int, cert_history jsonb,
  raw jsonb, analyzed_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.server_analysis TO authenticated;
GRANT ALL ON public.server_analysis TO service_role;
ALTER TABLE public.server_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads own analysis" ON public.server_analysis FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "owner writes own analysis" ON public.server_analysis FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM servers s WHERE s.id = server_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

-- 2. achievements + user_achievements (+ seed)
-- 3. get_public_dns_list() RPC (SECURITY DEFINER, retorna nome+status)
-- 4. UPDATE handle_new_user: trial_days := 2 (default), 2 + bonus se referido
```

**Arquivos novos:**
- `src/lib/analysis.functions.ts` + `analysis.server.ts` (DoH + fetch cert + ip-api)
- `src/lib/achievements.functions.ts`
- `src/components/monitor-badge.tsx`
- `src/routes/_authenticated/app.achievements.tsx`
- `src/routes/dns.tsx` (pública)

**Arquivos editados:**
- `src/routes/_authenticated/app.servers.$id.tsx` — abas Análise + Selo
- `src/routes/_authenticated/app.servers.new.tsx` — dispara análise ao salvar
- `src/components/app-shell.tsx` — item "Conquistas" no menu
- `src/routes/__root.tsx` ou `index.tsx` — link para /dns

Sem breaking changes; usuários atuais continuam com o trial que já têm.

Confirma que posso implementar tudo em sequência?

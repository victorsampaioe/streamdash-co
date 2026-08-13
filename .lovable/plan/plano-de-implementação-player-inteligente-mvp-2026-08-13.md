# Plano de Implementação: Player Inteligente (MVP)

Este plano descreve a implementação do módulo de Player Inteligente (Web Player) integrado ao ecossistema do Stream Monitor, permitindo que revendedores ofereçam um player white-label para seus clientes finais.

## 1. Infraestrutura de Banco de Dados
Criação das tabelas fundamentais com políticas RLS restritivas.

- `player_settings`: Configurações de marca (logo, cores) vinculadas ao `profile_id` (revendedor).
- `player_sessions`: Sessões de login Xtream dos clientes finais, vinculadas ao servidor e revendedor.
- `player_history` e `player_favorites`: Persistência de uso do cliente final.
- `player_access_logs`: Auditoria de uso e segurança.

## 2. Backend & Core AWS (Proxy/Remux)
Implementação da ponte técnica para viabilizar a reprodução no navegador.

- **Proxy de API**: Endpoint no Core para contornar CORS e mascarar URLs reais do Xtream.
- **Proxy de Stream (VOD)**: Repasse de fragmentos de vídeo para o navegador.
- **Remux HLS (Live)**: Futura implementação de transcodificação MPEG-TS para HLS (fase 2).
- **Server Functions**: Lógica de login Xtream, busca no catálogo e escolha inteligente de servidor baseada em Health Score/Latência.

## 3. Interface do Web Player (`/player`)
Área pública para o cliente final, otimizada para mobile e TV.

- **Login**: Autenticação via Usuário/Senha Xtream + URL (ou seleção de servidor).
- **Catálogo**: Navegação por Categorias (TV, Filmes, Séries) com busca integrada.
- **Player**: Integração com `hls.js` e controles customizados.
- **Smart Selection**: Lógica automática para escolher o melhor servidor disponível (se houver redundância).

## 4. Área Administrativa (`/app/player`)
Painel para o revendedor configurar seu ambiente.

- **Configurações White-label**: Upload de logo, escolha de cores e nome da marca.
- **Monitoramento de Uso**: Dashboard de clientes online e consumo de banda (estimado).

---

## Detalhes Técnicos

### Esquema de Tabelas (SQL)
```sql
CREATE TABLE public.player_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    brand_name text,
    logo_url text,
    primary_color text DEFAULT '#3B82F6',
    custom_domain text UNIQUE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.player_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id uuid REFERENCES public.profiles(id) NOT NULL,
    server_id uuid REFERENCES public.servers(id) NOT NULL,
    xtream_user text NOT NULL,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    device_info jsonb,
    last_ip inet,
    last_active_at timestamptz DEFAULT now()
);

-- RLS: Authenticated can read/write their own settings. 
-- Sessions accessible by reseller or via secure token (RPC).
GRANT SELECT, INSERT, UPDATE ON public.player_settings TO authenticated;
GRANT ALL ON public.player_settings TO service_role;
```

### Segurança & Performance
- **RLS**: Proteção de dados entre revendedores e isolamento de sessões de clientes.
- **Rate Limit**: Proteção contra brute-force no login Xtream (reutilizando `iptv_login_attempts`).
- **Cache**: Armazenamento temporário do catálogo no Redis/Memória do Core para evitar sobrecarga nos painéis Xtream.

### Próximos Passos
1. Executar migração SQL para novas tabelas.
2. Implementar `player.functions.ts` para autenticação.
3. Criar rotas base `/player` e `/app/player`.
4. Desenvolver o Proxy de Reprodução no Core.

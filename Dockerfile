# Stream Monitor — imagem de produção (multi-stage, compatível com ARM64/AWS Graviton)
# Build: bun (respeita bun.lock) | Runtime: Node 22 slim (leve e estável)

# ---------- 1) Dependências ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# ---------- 2) Build ----------
FROM oven/bun:1 AS build
WORKDIR /app
ENV NODE_ENV=production
# Nitro gera um servidor Node autônomo (em vez do preset Cloudflare)
ENV NITRO_PRESET=node-server
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variáveis públicas precisam existir no build (são inlinadas no bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
RUN bun run build

# ---------- 3) Runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=768
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.output ./.output
# Etapa 1 — lançador multiprocesso (desligado por padrão: CORE_CLUSTER_WORKERS<=1)
COPY --from=build /app/scripts/cluster.mjs ./scripts/cluster.mjs
# Usuário sem privilégios (o node:slim já traz o usuário "node")
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/public/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/cluster.mjs"]

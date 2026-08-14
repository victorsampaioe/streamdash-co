import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca as configurações de marca de um revendedor pelo ID do perfil.
 */
export const getPlayerSettings = createServerFn({ method: "GET" })
  // Acesso público necessário para a tela de login do cliente final
  .inputValidator((data) => z.object({ profileId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: settings, error } = await supabaseAdmin
      .from("player_settings")
      .select("*")
      .eq("profile_id", data.profileId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return settings;
  });

/**
 * Salva ou atualiza as configurações de marca do revendedor.
 */
export const savePlayerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    brand_name: z.string().min(2).max(50),
    logo_url: z.string().url().optional().nullable(),
    primary_color: z.string().regex(/^#[0-9A-F]{6}$/i).default("#3B82F6"),
    secondary_color: z.string().regex(/^#[0-9A-F]{6}$/i).default("#1E293B"),
    welcome_message: z.string().max(200).optional().nullable(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId;
    const userClaims = (context as any).claims;
    
    // Verificar se é admin através dos claims ou de uma consulta rápida
    const isAdmin = userClaims?.role === 'admin' || userClaims?.app_metadata?.role === 'admin';
    
    if (!userId || !isAdmin) {
      throw new Error("Acesso restrito apenas para administradores durante a fase de testes.");
    }

    // Garantir que o revendedor só edita suas próprias configurações
    const { data: result, error } = await supabaseAdmin
      .from("player_settings")
      .upsert({
        profile_id: userId,
        ...data,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'profile_id'
      })
      .select()
      .single();

    if (error) {
      console.error("[savePlayerSettings] Error:", error);
      throw new Error(error.message);
    }
    return result;
  });

/**
 * Tenta realizar o login Xtream de um cliente final no Web Player.
 */
export const loginXtreamClient = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    serverId: z.string().uuid(),
    username: z.string().min(1),
    password: z.string().min(1),
    resellerId: z.string().uuid(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: server } = await supabaseAdmin
      .from("servers")
      .select("id, host, name")
      .eq("id", data.serverId)
      .single();

    if (!server) throw new Error("Servidor não encontrado");

    const { runOnCore } = await import("./core-api.server");
    const { validateXtreamLogin } = await import("./player.server");

    // Reutiliza a inteligência IPTV já existente (probeXtream) com fallback local.
    const local = () => validateXtreamLogin(server.host, data.username, data.password);

    let authResult: any = await runOnCore("iptv-validate" as any, {
      host: server.host,
      username: data.username,
      password: data.password,
      options: { catalogMode: "auth" }
    }, local);

    // Se o Core respondeu mas não confirmou o login, tenta o fallback local
    // (bases http/https, player_api/panel_api, múltiplos User-Agents).
    if (!authResult?.login_ok) {
      console.warn(`[player-login] core não validou host=${server.host}: ${authResult?.error ?? "sem detalhe"} — tentando fallback local`);
      authResult = await local();
    }

    if (!authResult?.login_ok) {
      throw new Error(authResult?.error || "Falha na autenticação Xtream");
    }


    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { encryptSecret } = await import("./crypto.server");

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .insert({
        reseller_id: data.resellerId,
        server_id: data.serverId,
        xtream_user: data.username,
        xtream_pass: await encryptSecret(data.password),
        token: token,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, reseller_id, server_id, xtream_user, token, expires_at")
      .single();

    if (sessionErr) throw new Error(sessionErr.message);

    return {
      token: session.token,
      expiresAt: session.expires_at,
      user: authResult.account,
      server: {
        id: server.id,
        name: server.name || server.host
      }
    };
  });

/**
 * Valida o token de sessão do player.
 */
export const validatePlayerSession = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error } = await supabaseAdmin
      .from("player_sessions")
      .select("id, reseller_id, server_id, xtream_user, token, expires_at")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !session) return null;

    // Atualizar último acesso
    await supabaseAdmin
      .from("player_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", session.id);

    return session;
  });

/**
 * Busca dados do catálogo IPTV via Core AWS.
 */
export const getPlayerCatalog = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    action: z.enum([
      "get_live_categories", 
      "get_vod_categories", 
      "get_series_categories", 
      "get_live_streams", 
      "get_vod_streams", 
      "get_series", 
      "get_series_info", 
      "get_episodes_list",
      "get_vod_info"
    ]),
    categoryId: z.string().optional(),
    contentId: z.string().optional(),
    offset: z.number().default(0),
    limit: z.number().default(100),
  }).parse(data))
  .handler(async ({ data }) => {
    // 1. Validar sessão
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("id, server_id, token, expires_at, xtream_user, xtream_pass")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionErr || !session) throw new Error("Sessão expirada ou inválida");

    // 2. Credenciais do CLIENTE FINAL (login do player), não as do servidor
    const { getPlayerCredentials, fetchXtreamCatalog } = await import("./player.server");
    const creds = await getPlayerCredentials(session as any);

    if (!creds.username || !creds.password) {
      throw new Error("Credenciais da sessão indisponíveis. Faça login novamente.");
    }

    // 3. Delegar ao Core AWS (com fallback local)
    const { runOnCore, coreApiUrl, useCore } = await import("./core-api.server");
    const via = useCore() ? `Core AWS (${coreApiUrl()})` : "Painel (direto no IPTV)";
    const started = Date.now();

    console.log(
      `[CATALOG_DEBUG] inicio | tipo=${data.action.includes("series") ? "series" : data.action.includes("vod") ? "movie" : "live"} servidor=${session.server_id} usuario_iptv=${creds.username} action=${data.action} categoria=${data.categoryId ?? "-"} contentId=${data.contentId ?? "-"} fluxo=Frontend -> ${via} -> Servidor IPTV`
    );

    try {
      const result = await runOnCore(
        "iptv-player-proxy" as any,
        {
          serverId: session.server_id,
          username: creds.username,
          password: creds.password,
          options: {
            action: data.action,
            categoryId: data.categoryId,
            contentId: data.contentId,
            offset: data.offset,
            limit: data.limit,
          }
        },
        () => fetchXtreamCatalog(session.server_id, creds, {
          action: data.action,
          categoryId: data.categoryId,
          contentId: data.contentId,
          offset: data.offset,
          limit: data.limit,
        })
      );

      const quantidade = Array.isArray(result)
        ? result.length
        : result && typeof result === "object"
          ? Object.keys(result as any).length
          : 0;

      console.log(
        `[CATALOG_DEBUG] resposta | action=${data.action} via=${via} ms=${Date.now() - started} tipo_resposta=${Array.isArray(result) ? "array" : typeof result} quantidade=${quantidade} erro=null`
      );

      return result as any;
    } catch (e: any) {
      console.error(
        `[CATALOG_DEBUG] resposta | action=${data.action} via=${via} ms=${Date.now() - started} quantidade=0 erro=${e?.message ?? e}`
      );
      throw new Error(`[${data.action}] ${e?.message ?? "falha desconhecida no catálogo"}`);
    }
  });

/**
 * ETAPA 3/4 — Diagnóstico completo dos endpoints Xtream para a sessão atual.
 * Mostra qual action realmente retorna dados e por onde a chamada trafega.
 */
export const diagnosePlayerCatalog = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    seriesId: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error } = await supabaseAdmin
      .from("player_sessions")
      .select("id, server_id, xtream_user, xtream_pass")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !session) throw new Error("Sessão expirada ou inválida");

    const { getPlayerCredentials, probeXtreamEndpoints } = await import("./player.server");
    const creds = await getPlayerCredentials(session as any);
    if (!creds.username || !creds.password) throw new Error("Credenciais da sessão indisponíveis");

    const { coreApiUrl, useCore } = await import("./core-api.server");
    const report = await probeXtreamEndpoints(session.server_id, creds, data.seriesId);

    return {
      core: {
        core_api_url: coreApiUrl(),
        usando_core: useCore(),
        fluxo: useCore() ? "Frontend -> Core AWS -> Servidor IPTV" : "Frontend -> Painel -> Servidor IPTV",
      },
      servidor: session.server_id,
      ...report,
    };
  });


/**
 * Gera a URL de stream IPTV através do proxy do Core AWS.
 */
export const getPlayerStreamUrl = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    streamId: z.string(),
    extension: z.string().default("ts"),
    type: z.enum(["live", "movie", "series"])
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error } = await supabaseAdmin
      .from("player_sessions")
      .select("id, server_id, xtream_user, xtream_pass")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !session) throw new Error("Sessão inválida");

    // Proxy same-origin: evita CORS/mixed-content e resolve host + credenciais
    // a partir do token da sessão.
    const url = `/api/public/core/stream?token=${data.token}&sid=${encodeURIComponent(data.streamId)}&ext=${encodeURIComponent(data.extension)}&type=${data.type}`;
    console.log(`[getPlayerStreamUrl] server=${session.server_id} type=${data.type} sid=${data.streamId} ext=${data.extension} proxy=${url.split("token=")[0]}token=***`);
    return url;

  });

/**
 * Adiciona ou remove um conteúdo da lista de favoritos do player.
 */
export const toggleFavorite = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    contentId: z.string(),
    contentType: z.enum(["live", "movie", "series"]),
    isFavorite: z.boolean()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("id")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionErr || !session) throw new Error("Sessão inválida");

    if (data.isFavorite) {
      const { error } = await supabaseAdmin
        .from("player_favorites")
        .upsert({
          session_id: session.id,
          content_id: data.contentId,
          content_type: data.contentType
        }, { onConflict: 'session_id, content_id, content_type' });
      
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("player_favorites")
        .delete()
        .match({
          session_id: session.id,
          content_id: data.contentId,
          content_type: data.contentType
        });
      
      if (error) throw new Error(error.message);
    }

    return { success: true };
  });

/**
 * Retorna a lista de favoritos da sessão.
 */
export const getFavorites = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("id")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionErr || !session) throw new Error("Sessão inválida");

    const { data: favorites, error } = await supabaseAdmin
      .from("player_favorites")
      .select("content_id, content_type")
      .eq("session_id", session.id);

    if (error) throw new Error(error.message);
    return favorites;
  });

/**
 * Atualiza o progresso de visualização de um conteúdo.
 */
export const updateWatchHistory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    contentId: z.string(),
    contentType: z.enum(["live", "movie", "series"]),
    position: z.number(),
    duration: z.number()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("id")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionErr || !session) throw new Error("Sessão inválida");

    const { error } = await supabaseAdmin
      .from("player_history")
      .upsert({
        session_id: session.id,
        content_id: data.contentId,
        content_type: data.contentType,
        last_position_seconds: data.position,
        duration_seconds: data.duration,
        watched_at: new Date().toISOString()
      }, { onConflict: 'id' }); // Consider adding a unique constraint if we want one entry per content per session

    if (error) throw new Error(error.message);
    return { success: true };
  });



/**
 * Lista pública (somente id/nome) dos servidores do revendedor para a tela de
 * login do Web Player. O cliente final é anônimo, então a RLS bloqueia a
 * consulta direta na tabela `servers`.
 */
export const getPlayerServers = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ resellerId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: servers, error } = await supabaseAdmin
      .from("servers")
      .select("id, name, host")
      .eq("owner_id", data.resellerId)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    // Nunca expor o host real ao cliente final.
    return (servers ?? []).map((s) => ({ id: s.id, name: s.name || "Servidor" }));
  });

/**
 * Retorna o status de saúde de um servidor de forma segura para o player.
 */
export const getServerStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("server_id")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionErr || !session) throw new Error("Sessão inválida");

    const { data: server, error } = await supabaseAdmin
      .from("servers")
      .select("name, current_status, health_score, last_latency_ms, last_checked_at")
      .eq("id", session.server_id)
      .single();

    if (error) throw new Error(error.message);
    return server;
  });

/**
 * Busca metadados do TMDB para um título (filme ou série).
 */
export const getTMDBMetadata = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ 
    title: z.string(), 
    type: z.enum(["movie", "tv"]),
    year: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const TMDB_API_KEY = process.env['TMDB_API_KEY'];
    if (!TMDB_API_KEY) {
      console.warn("TMDB_API_KEY não configurada.");
      return null;
    }

    try {
      const searchUrl = new URL(`https://api.themoviedb.org/3/search/${data.type}`);
      searchUrl.searchParams.append('api_key', TMDB_API_KEY);
      searchUrl.searchParams.append('query', data.title);
      searchUrl.searchParams.append('language', 'pt-BR');
      if (data.year) searchUrl.searchParams.append('year', data.year);

      const response = await fetch(searchUrl.toString());
      const searchData = await response.json();

      if (!searchData.results || searchData.results.length === 0) return null;

      const bestMatch = searchData.results[0];
      
      // Busca detalhes adicionais (incluindo vídeos/trailers)
      const detailsUrl = new URL(`https://api.themoviedb.org/3/${data.type}/${bestMatch.id}`);
      detailsUrl.searchParams.append('api_key', TMDB_API_KEY);
      detailsUrl.searchParams.append('language', 'pt-BR');
      detailsUrl.searchParams.append('append_to_response', 'videos,credits,images');

      const detailsResponse = await fetch(detailsUrl.toString());
      const detailsData = await detailsResponse.json();

      return {
        id: detailsData.id,
        title: detailsData.title || detailsData.name,
        overview: detailsData.overview,
        poster_path: detailsData.poster_path,
        backdrop_path: detailsData.backdrop_path,
        vote_average: detailsData.vote_average,
        release_date: detailsData.release_date || detailsData.first_air_date,
        genres: detailsData.genres?.map((g: any) => g.name) || [],
        runtime: detailsData.runtime || (detailsData.episode_run_time ? detailsData.episode_run_time[0] : null),
        cast: detailsData.credits?.cast?.slice(0, 5).map((c: any) => c.name) || [],
        trailer_key: detailsData.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')?.key
      };
    } catch (error) {
      console.error("Erro ao buscar metadados TMDB:", error);
      return null;
    }
  });


/**
 * Realiza uma checagem rápida de saúde em um servidor específico.
 * Usado na tela de login para diagnóstico prévio.
 */
export const checkServerHealth = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ serverId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: server } = await supabaseAdmin
      .from("servers")
      .select("id, host, current_status, health_score")
      .eq("id", data.serverId)
      .single();

    if (!server) throw new Error("Servidor não encontrado");

    return {
      availability: server.current_status,
      healthScore: server.health_score,
      status: server.current_status === 'up' ? 'stable' : (server.current_status === 'degraded' ? 'unstable' : 'offline')
    };
  });

/**
 * Encerra uma sessão do player no servidor.
 */
export const logoutPlayer = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("player_sessions")
      .delete()
      .eq("token", data.token);

    if (error) throw new Error(error.message);
    return { success: true };
  });


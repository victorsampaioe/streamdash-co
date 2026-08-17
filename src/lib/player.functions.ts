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

    const startLogin = Date.now();
    console.log(`[player-login] servidor=uniplay etapa=inicio host=${server.host} usuario=${data.username}`);

    let authResult: any;
    try {
      authResult = await runOnCore("iptv-validate" as any, {
        host: server.host,
        username: data.username,
        password: data.password,
        options: { catalogMode: "auth" }
      }, local);
      
      console.log(`[player-login] servidor=uniplay etapa=core status=${authResult?.login_ok ? "OK" : "FAIL"} tempo=${Date.now() - startLogin}ms`);
    } catch (e: any) {
      console.error(`[player-login] servidor=uniplay etapa=core erro=${e?.message} tempo=${Date.now() - startLogin}ms`);
    }

    // Se o Core respondeu mas não confirmou o login, tenta o fallback local
    if (!authResult?.login_ok) {
      const localStart = Date.now();
      authResult = await local();
      console.log(`[player-login] servidor=uniplay etapa=fallback_local status=${authResult?.login_ok ? "OK" : "FAIL"} tempo=${Date.now() - localStart}ms erro=${authResult?.error || "n/a"}`);
    }

    if (!authResult?.login_ok) {
      const duration = Date.now() - startLogin;
      console.log(`[player-login] servidor=uniplay RESULTADO=FALHA tempo_total=${duration}ms erro=${authResult?.error}`);
      
      // Mensagens amigáveis e específicas
      const errorMsg = authResult?.error || "";
      if (errorMsg.includes("403")) throw new Error("Acesso temporariamente bloqueado pelo servidor (403).");
      if (errorMsg.includes("timeout") || errorMsg.includes("AbortError")) throw new Error("O servidor demorou muito para responder. Tente novamente.");
      if (errorMsg.includes("inválidos")) throw new Error("Usuário ou senha inválidos.");
      
      throw new Error(authResult?.error || "Não foi possível comunicar com o servidor no momento.");
    }

    console.log(`[player-login] servidor=uniplay RESULTADO=SUCESSO tempo_total=${Date.now() - startLogin}ms`);


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
      "get_vod_info",
      "get_series_episodes",
      "get_series_info"
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
    const via = useCore("iptv-player-proxy" as any) ? `Core AWS (${coreApiUrl()})` : "Painel (direto no IPTV, dono do banco)";
    const started = Date.now();

    console.log(
      `[CATALOG_DEBUG] inicio | tipo=${data.action.includes("series") ? "series" : data.action.includes("vod") ? "movie" : "live"} servidor=${session.server_id} usuario_iptv=${creds.username} action=${data.action} categoria=${data.categoryId ?? "-"} contentId=${data.contentId ?? "-"} fluxo=Frontend -> ${via} -> Servidor IPTV`
    );

    try {
      const isSeriesDetail = data.action === "get_series_info" || data.action === "get_episodes_list";
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
        }),
        isSeriesDetail // Novo: força Core para detalhes de séries
      );

      const quantidade = Array.isArray(result)
        ? result.length
        : result && typeof result === "object"
          ? Object.keys(result as any).length
          : 0;

      console.log(
        `[CATALOG_DEBUG] resposta | action=${data.action} via=${via} ms=${Date.now() - started} tipo_resposta=${Array.isArray(result) ? "array" : typeof result} quantidade=${quantidade} erro=null`
      );

      if (data.action === "get_series_info" || data.action === "get_episodes_list") {
        const { normalizeSeriesInfoResponse } = await import("./player.server");
        return normalizeSeriesInfoResponse(result) as any;
      }
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

    const { coreApiUrl, useCore, callCore } = await import("./core-api.server");
    const report = await probeXtreamEndpoints(session.server_id, creds, data.seriesId);

    // ETAPA 4 — saúde do Core AWS (confirma se o domínio realmente aponta para a VPS)
    let coreSaude: any = { alcancavel: false };
    const coreBase = coreApiUrl();
    if (coreBase) {
      try {
        const res = await fetch(`${coreBase}/api/public/core/task`, { signal: AbortSignal.timeout(10_000) });
        coreSaude = { alcancavel: true, status: res.status, ...(await res.json().catch(() => ({}))) };
      } catch (e: any) {
        coreSaude = { alcancavel: false, erro: String(e?.message ?? e) };
      }
    }


    // ETAPA 4 — mesmo teste, porém passando pelo Core AWS (IP da VPS)
    const viaCore: any[] = [];
    if (useCore("iptv-player-proxy" as any)) {
      for (const action of ["get_series_categories", "get_series", "get_vod_streams", "get_live_streams"]) {
        const started = Date.now();
        try {
          const r: any = await callCore("iptv-player-proxy" as any, {
            serverId: session.server_id,
            username: creds.username,
            password: creds.password,
            options: { action, limit: 5 },
          });
          const quantidade = Array.isArray(r) ? r.length : r && typeof r === "object" ? Object.keys(r).length : 0;
          viaCore.push({ action, ms: Date.now() - started, quantidade, erro: null });
        } catch (e: any) {
          viaCore.push({ action, ms: Date.now() - started, quantidade: 0, erro: String(e?.message ?? e).slice(0, 300) });
        }
      }
    }

    return {
      core: {
        core_api_url: coreApiUrl(),
        usando_core: useCore("iptv-player-proxy" as any),
        fluxo: useCore("iptv-player-proxy" as any) ? "Frontend -> Core AWS -> Servidor IPTV" : "Frontend -> Painel -> Servidor IPTV",
        saude_do_core: coreSaude,
      },

      servidor: session.server_id,
      teste_direto_do_painel: report.resultados,
      teste_via_core_aws: viaCore,
      host: report.host,
      usuario: report.usuario,
      urls_de_stream: report.urls_de_stream,
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
    const url = new URL(`/api/public/core/stream`, "http://localhost:8080"); // O browser usará o host real
    url.searchParams.set("token", data.token);
    url.searchParams.set("sid", data.streamId);
    url.searchParams.set("ext", data.extension);
    url.searchParams.set("type", data.type);
    // Live: entrega obrigatória pelo Core (manifesto + segmentos na mesma camada).
    // VOD: escalonamento automático navegador → CORE-VLC → CORE → PAINEL-VLC.
    // O modo realmente usado é sempre informado no HUD (X-Playback-Via /
    // X-Playback-Reason), sem fallback silencioso.
    // MP4/MOV: forçamos Core para garantir Range 206 estável.
    if (data.type === "live" || ["mp4", "mov", "m4v"].includes(data.extension.toLowerCase())) {
      url.searchParams.set("forceCore", "1");
    }

    
    const finalUrl = url.pathname + url.search;
    console.log(`[getPlayerStreamUrl] server=${session.server_id} type=${data.type} sid=${data.streamId} ext=${data.extension} proxy=${finalUrl.split("token=")[0]}token=***`);
    return finalUrl;

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
 * Salva o progresso de reprodução ou favorito
 */
export const updatePlayerActivity = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    contentId: z.string(),
    contentType: z.enum(["movie", "series", "live"]),
    progress: z.number().min(0).max(100).optional(),
    isFavorite: z.boolean().optional(),
    metadata: z.any().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("id, server_id")
      .eq("token", data.token)
      .single();

    if (sessionErr || !session) throw new Error("Sessão inválida");

    const activityData: any = {
      session_id: session.id,
      content_id: data.contentId,
      content_type: data.contentType,
      last_accessed_at: new Date().toISOString()
    };

    if (data.progress !== undefined) activityData.progress = data.progress;
    if (data.isFavorite !== undefined) activityData.is_favorite = data.isFavorite;
    if (data.metadata) activityData.metadata = data.metadata;

    // @ts-ignore
    const { error } = await supabaseAdmin
      .from("player_activities")
      .upsert(activityData, { onConflict: "session_id, content_id" });

    if (error) throw new Error(error.message);
    return { success: true };
  });


/**
 * Busca o histórico e favoritos do usuário
 */
export const getPlayerActivity = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({
    token: z.string().uuid(),
    type: z.enum(["history", "favorites", "progress"])
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .select("id")
      .eq("token", data.token)
      .single();

    if (sessionErr || !session) throw new Error("Sessão inválida");

    // @ts-ignore - mesa de atividades criada via migração
    let query = supabaseAdmin
      .from("player_activities")
      .select("*")
      .eq("session_id", session.id);

    if (data.type === 'favorites') query = query.eq("is_favorite", true);
    if (data.type === 'progress') query = query.gt("progress", 0).lt("progress", 95);
    
    const { data: activities, error } = await query
      .order("last_accessed_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);
    return activities as any[];
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



/**
 * Diagnóstico de REPRODUÇÃO real (PLAY) — live, filme e episódio.
 * Compara Painel → IPTV com Painel → Core AWS → IPTV.
 */
export const diagnosePlayerPlayback = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: session, error } = await supabaseAdmin
      .from("player_sessions")
      .select("id, server_id, xtream_user, xtream_pass")
      .eq("token", data.token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !session) throw new Error("Sessão expirada ou inválida");

    const { getPlayerCredentials, probePlayback } = await import("./player.server");
    const creds = await getPlayerCredentials(session as any);
    if (!creds.username || !creds.password) throw new Error("Credenciais da sessão indisponíveis");

    return await probePlayback(session.server_id, creds);
  });

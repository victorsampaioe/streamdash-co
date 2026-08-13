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
    if (!userId) throw new Error("Não autorizado");

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
    const { probeXtream } = await import("./iptv.server");

    // Validação de login simples (catalogMode: "auth")
    const authResult: any = await runOnCore("iptv-validate" as any, {
      host: server.host,
      username: data.username,
      password: data.password,
      options: { catalogMode: "auth" }
    }, () => probeXtream(server.host, data.username, data.password, { catalogMode: "auth" }));

    if (!authResult || !authResult.login_ok) {
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
      "get_vod_info"
    ]),
    categoryId: z.string().optional(),
    contentId: z.string().optional(),
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
    const { runOnCore } = await import("./core-api.server");

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
        }
      },
      () => fetchXtreamCatalog(session.server_id, creds, {
        action: data.action,
        categoryId: data.categoryId,
        contentId: data.contentId,
      })
    );

    console.log(
      `[getPlayerCatalog] server=${session.server_id} user=${creds.username} action=${data.action} category=${data.categoryId ?? "-"} itens=${Array.isArray(result) ? result.length : typeof result}`
    );

    return result as any;
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

    const { coreApiUrl } = await import("./core-api.server");
    const coreBase = coreApiUrl() ?? "";

    // O proxy resolve host e credenciais a partir do token da sessão.
    return `${coreBase}/api/public/core/stream?token=${data.token}&sid=${data.streamId}&ext=${data.extension}&type=${data.type}`;
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



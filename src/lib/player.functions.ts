import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca as configurações de marca de um revendedor pelo ID do perfil.
 */
export const getPlayerSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
      .select("id, host")
      .eq("id", data.serverId)
      .single();

    if (!server) throw new Error("Servidor não encontrado");

    const { runOnCore } = await import("./core-api.server");
    const { probeXtream } = await import("./iptv.server");

    const authResult: any = await runOnCore("iptv-validate", {
      host: server.host,
      username: data.username,
      password: data.password,
      opts: { catalogMode: "auth" }
    }, () => probeXtream(server.host, data.username, data.password, { catalogMode: "auth" }));

    if (!authResult || !authResult.login_ok) {
      throw new Error(authResult?.error || "Falha na autenticação Xtream");
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("player_sessions")
      .insert({
        reseller_id: data.resellerId,
        server_id: data.serverId,
        xtream_user: data.username,
        token: token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (sessionErr) throw new Error(sessionErr.message);

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: authResult.account,
      server: {
        id: server.id,
        name: (server as any).name || server.host
      }
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processTelegramAlert, AlertEvent } from "./telegram-alerts.server";

export const triggerTestAlert = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    userId: z.string(),
    event: z.enum(["OFFLINE", "ONLINE"])
  }).parse(data))
  .handler(async ({ data, context }) => {
    // Verificar se o chamador é admin
    const { supabase } = context;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");
    
    const { data: isAdmin } = await supabase.rpc("has_role", { 
      _user_id: user.id, 
      _role: "admin" 
    });
    if (!isAdmin) throw new Error("Forbidden");

    // Buscar um servidor do usuário para o teste
    const { data: server } = await supabaseAdmin
      .from("servers")
      .select("id")
      .eq("owner_id", data.userId)
      .limit(1)
      .maybeSingle();

    if (!server) throw new Error("Usuário não possui servidores para teste.");

    await processTelegramAlert({
      serverId: server.id,
      event: data.event as AlertEvent,
      reason: "Teste manual via painel admin",
      regions: ["Painel Admin"],
      timeOffline: data.event === "ONLINE" ? "10 minutos" : undefined
    });

    return { ok: true };
  });

export const getAlertLogs = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({
    limit: z.number().default(20)
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: isAdmin } = await supabase.rpc("has_role", { 
      _user_id: user.id, 
      _role: "admin" 
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: logs } = await supabaseAdmin
      .from("notifications_log")
      .select("*, servers(name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    return logs || [];
  });

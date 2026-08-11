import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Apenas administradores podem sincronizar o Radar IPTV.");
}

/** Cria o job e retorna imediatamente — o processamento roda no Core AWS. */
export const startRadarSyncJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { eligibleRadarServerIds, createRadarJob, kickRadarJob } = await import("./radar-jobs.server");
    const ids = await eligibleRadarServerIds();
    if (!ids.length) throw new Error("Nenhum servidor com credenciais IPTV válidas foi encontrado.");
    const job = await createRadarJob(ids, "manual", context.userId);
    const runner = await kickRadarJob();
    return { ...job, runner };
  });

/** Progresso persistente vindo do banco (não depende da página aberta). */
export const getRadarJobStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getRadarJobProgress } = await import("./radar-jobs.server");
    return await getRadarJobProgress();
  });

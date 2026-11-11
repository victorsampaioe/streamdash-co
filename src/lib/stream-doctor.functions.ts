import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { analyzeStreamDoctor } from "./stream-doctor.engine";
import type { DoctorEvidence } from "./stream-doctor.engine";

const input = z.object({
  serverId: z.string().uuid(),
  device: z.enum(["smart_tv", "tv_box", "phone", "computer", "other"]),
  app: z.string().trim().max(60),
  complaint: z.string().trim().max(400).optional(),
  accessToken: z.string().max(4096).optional(),
  symptom: z.enum(["buffering", "black_screen", "login", "vod", "channels", "audio", "other"]),
  when: z.enum(["now", "today", "recurring", "unknown"]),
});

/** Reads only servers visible through the user's RLS-scoped session. */
export const runStreamDoctor = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((payload: z.infer<typeof input>) => input.parse(payload))
  .handler(async ({ data, context }) => {
    const { data: server, error: srvError } = await context.supabase.from("servers")
      .select("id,name,current_status,last_checked_at,last_latency_ms,dns_status,monitoring_paused")
      .eq("id", data.serverId).maybeSingle();
    if (srvError || !server) throw new Error("Servidor não encontrado ou sem permissão.");

    const [checks, regions, incidents] = await Promise.all([
      context.supabase.from("checks").select("status,checked_at,http_status,latency_ms")
        .eq("server_id", server.id).order("checked_at", { ascending: false }).limit(15),
      context.supabase.from("region_checks").select("region_code,status,checked_at")
        .eq("server_id", server.id).order("checked_at", { ascending: false }).limit(24),
      context.supabase.from("incidents").select("started_at,ended_at,incident_type")
        .eq("server_id", server.id).order("started_at", { ascending: false }).limit(5),
    ]);
    // Do not silently interpret database errors as "no incidents" or healthy.
    if (checks.error || regions.error || incidents.error) {
      throw new Error("Não foi possível carregar as evidências do monitoramento. Tente novamente.");
    }
    const snapshot: DoctorEvidence = {
      name: server.name,
      status: server.current_status ?? "unknown",
      checkedAt: server.last_checked_at,
      latency: server.last_latency_ms,
      dnsStatus: server.dns_status,
      paused: server.monitoring_paused === true,
      recentChecks: (checks.data ?? []).map(c => ({
        status: c.status, checked_at: c.checked_at, http_status: c.http_status, latency_ms: c.latency_ms
      })),
      regions: (regions.data ?? []).map(r => ({
        region_code: r.region_code, status: r.status, checked_at: r.checked_at
      })),
      incidents: (incidents.data ?? []).map(i => ({
        started_at: i.started_at, ended_at: i.ended_at, incident_type: i.incident_type
      })),
    };
    const report = analyzeStreamDoctor(data, snapshot);
    const local = (reason: string, remaining?: number) => ({
      serverName: server.name, report,
      assistant: { mode: "local" as const, text: "", reason, remaining, cached: false },
    });

    // Never rely on browser controls to restrict free Workers AI usage.
    // No personal data or Xtream credentials are sent to the model.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { createHash } = await import("node:crypto");
      const token = data.accessToken ?? "";
      if (!token || !context.userId) return local("sessao_indisponivel");
      const authenticated = await supabaseAdmin.auth.getUser(token);
      if (authenticated.error || authenticated.data.user?.id !== context.userId) return local("sessao_indisponivel");

      const evidence = [
        "Resultado: " + report.headline,
        "Nível de evidência: " + report.confidence,
        ...report.evidence.slice(0, 5).map(x => "Fato: " + x),
        ...report.hypotheses.slice(0, 3).map(x => "Hipótese não confirmada: " + x),
        ...report.steps.slice(0, 4).map(x => "Teste sugerido: " + x),
      ].join("\n").slice(0, 3600);
      const problem = [
        "Aparelho: " + data.device, "App: " + data.app,
        "Problema: " + data.symptom, "Horário: " + data.when,
        "Relato: " + (data.complaint ?? ""),
      ].join(". ").slice(0, 430);

      const cacheKey = createHash("sha256").update(JSON.stringify({
        owner: context.userId, server: server.id, problem, evidence
      })).digest("hex");
      const cache = await (supabaseAdmin.from("doctor_ai_cache" as any) as any)
        .select("generated_text,created_at").eq("cache_key", cacheKey)
        .gte("created_at", new Date(Date.now() - 12 * 60_000).toISOString()).maybeSingle();
      if (!cache.error && typeof cache.data?.generated_text === "string") {
        return { serverName: server.name, report, assistant: {
          mode: "cloudflare" as const, text: cache.data.generated_text,
          reason: "cache", remaining: undefined, cached: true
        }};
      }

      const quota = await (supabaseAdmin as any).rpc("reserve_doctor_ai_request", { _owner: context.userId });
      if (quota.error || quota.data?.allowed !== true) return local("limite_gratuito", quota.data?.remaining ?? 0);

      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 12_000);
      try {
        const res = await fetch("https://streammonitor-doctor-ai.victorsampaio133.workers.dev/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({ context: evidence, problem }),
          signal: abort.signal,
        });
        if (!res.ok) return local(res.status === 429 ? "limite_gratuito" : "modelo_indisponivel", quota.data?.remaining);
        const answer = await res.json() as { answer?: string };
        if (typeof answer.answer !== "string" || !answer.answer.trim()) return local("modelo_indisponivel");
        const text = answer.answer.trim().slice(0, 1250);
        await (supabaseAdmin.from("doctor_ai_cache" as any) as any)
          .upsert({ cache_key: cacheKey, generated_text: text, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
        return { serverName: server.name, report, assistant: {
          mode: "cloudflare" as const, text,
          reason: "inference", remaining: quota.data?.remaining ?? undefined, cached: false
        }};
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // The deterministic engine stays operational if AI quota, auth,
      // network or provider are unavailable; never throw away measured data.
      return local("modelo_indisponivel");
    }
  });

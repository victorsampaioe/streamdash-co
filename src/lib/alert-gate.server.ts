// Máquina de estado única para alertas de queda/retorno de servidores.
//
// Regras:
// - Enquanto existir um incidente aberto para o servidor, NENHUM novo alerta de
//   OFFLINE é enviado: apenas atualizamos o incidente (última verificação,
//   motivo, regiões, contagem de falhas).
// - Só há novo alerta depois de mudança real de estado (resolvido -> cai de novo).
// - Atomicidade: índice único parcial `incidents_one_open_per_server` garante que
//   duas execuções concorrentes (cron local, Core AWS, worker regional) não
//   consigam abrir dois incidentes; quem perder a corrida não notifica.
// - Idempotência adicional por `offline-alert:{server_id}:{incident_id}`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Quantas quedas simultâneas (janela abaixo) ativam o modo resumo anti-flood. */
const FLOOD_THRESHOLD = 5;
const FLOOD_WINDOW_MIN = 10;

async function claimKey(key: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("alert_idempotency" as any).insert({ id: key });
  return !error;
}

export type OfflineGate =
  | { notify: false; incidentId: string | null; reason: "already_open" | "lost_race" | "duplicate" }
  | { notify: true; incidentId: string; grouped: boolean; floodCount: number };

/**
 * Registra a queda e decide se o Telegram deve ser disparado.
 * Chame SEMPRE isto antes de qualquer envio de alerta de OFFLINE.
 */
export async function openOfflineIncident(
  serverId: string,
  reason: string,
  regions?: string[],
): Promise<OfflineGate> {
  const nowIso = new Date().toISOString();
  const regionsLabel = regions?.length ? regions.join(", ") : null;

  const { data: inserted, error } = await supabaseAdmin
    .from("incidents")
    .insert({
      server_id: serverId,
      reason,
      alert_sent: true,
      last_check_at: nowIso,
      failure_count: 1,
      regions: regionsLabel,
    } as any)
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    // Já existe incidente aberto (índice único) OU corrida perdida: apenas atualiza.
    const { data: open } = await supabaseAdmin
      .from("incidents")
      .select("id, failure_count")
      .eq("server_id", serverId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open) {
      await supabaseAdmin
        .from("incidents")
        .update({
          last_check_at: nowIso,
          reason,
          regions: regionsLabel,
          failure_count: ((open as any).failure_count ?? 1) + 1,
        } as any)
        .eq("id", open.id);
      return { notify: false, incidentId: open.id, reason: "already_open" };
    }
    return { notify: false, incidentId: null, reason: "lost_race" };
  }

  // Idempotência extra: só um processo consegue reivindicar o envio.
  if (!(await claimKey(`offline-alert:${serverId}:${inserted.id}`))) {
    return { notify: false, incidentId: inserted.id, reason: "duplicate" };
  }

  // Proteção anti-flood global: muitas quedas ao mesmo tempo -> resumo único.
  const since = new Date(Date.now() - FLOOD_WINDOW_MIN * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .gte("started_at", since);
  const floodCount = count ?? 1;

  return { notify: true, incidentId: inserted.id, grouped: floodCount >= FLOOD_THRESHOLD, floodCount };
}

/**
 * Em modo flood, envia UM resumo por janela (por servidor não).
 * Retorna true se este processo deve enviar o resumo agora.
 */
export async function claimFloodSummary(): Promise<boolean> {
  const window = Math.floor(Date.now() / (FLOOD_WINDOW_MIN * 60_000));
  return claimKey(`flood-summary:${window}`);
}

export type RecoveryGate =
  | { notify: false }
  | { notify: true; incidentId: string; startedAt: string; downtimeLabel: string };

/** Fecha o incidente aberto e decide se envia a mensagem de restabelecimento. */
export async function closeOfflineIncident(serverId: string): Promise<RecoveryGate> {
  const nowIso = new Date().toISOString();
  const { data: closed } = await supabaseAdmin
    .from("incidents")
    .update({ ended_at: nowIso })
    .eq("server_id", serverId)
    .is("ended_at", null)
    .select("id, started_at")
    .maybeSingle();

  if (!closed) return { notify: false };
  if (!(await claimKey(`recovery-alert:${serverId}:${closed.id}`))) return { notify: false };

  const secs = Math.max(0, Math.round((Date.now() - new Date(closed.started_at).getTime()) / 1000));
  const downtimeLabel =
    secs < 60 ? `${secs}s` : secs < 3600 ? `${Math.round(secs / 60)}min` : `${(Number(secs || 0) / 3600).toFixed(1)}h`;

  return { notify: true, incidentId: closed.id, startedAt: closed.started_at, downtimeLabel };
}

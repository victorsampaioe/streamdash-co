/** Server-only: autorização administrativa e persistência das versões do Stream Play. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { auditLog } from "@/lib/api-security.server";
import { hashRemoteApk } from "@/lib/app-releases.server";
import { isSafeHttpsUrl } from "@/lib/ssrf-guard";

/** A permissão é sempre confirmada no backend, nunca pela interface. */
export async function assertAdmin(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) {
    await auditLog({
      action: "admin.access.denied",
      severity: "warning",
      actorId: userId,
      target: "app_releases",
    });
    throw new Error("Acesso negado");
  }
}

export type ReleaseInput = {
  id?: string;
  version_code: number;
  version_name: string;
  minimum_version_code: number;
  recommended_version_code?: number;
  mandatory: boolean;
  message?: string;
  update_url: string;
  signing_fingerprint?: string;
  status: "draft" | "published" | "archived";
};

export async function persistRelease(input: ReleaseInput, actorId: string) {
  if (!isSafeHttpsUrl(input.update_url)) {
    throw new Error("A URL de atualização precisa ser HTTPS e pública.");
  }

  // SHA-256 sempre calculado no servidor a partir do arquivo real.
  const { sha256, size } = await hashRemoteApk(input.update_url);

  const row = {
    version_code: input.version_code,
    version_name: input.version_name,
    minimum_version_code: input.minimum_version_code,
    recommended_version_code: input.recommended_version_code ?? input.version_code,
    mandatory: input.mandatory,
    message: input.message ?? null,
    update_url: input.update_url,
    signing_fingerprint: input.signing_fingerprint ?? null,
    status: input.status,
    sha256,
    file_size: size,
    published_at: input.status === "published" ? new Date().toISOString() : null,
    created_by: actorId,
  };

  const query = input.id
    ? supabaseAdmin.from("app_releases").update(row).eq("id", input.id).select("*").maybeSingle()
    : supabaseAdmin.from("app_releases").insert(row).select("*").maybeSingle();

  const { data, error } = await query;
  if (error) throw new Error("Não foi possível salvar a versão.");

  await auditLog({
    action: input.status === "published" ? "stream_play.release.published" : "stream_play.release.saved",
    actorId,
    target: `v${input.version_code}`,
    severity: input.mandatory ? "warning" : "info",
    metadata: { version_code: input.version_code, mandatory: input.mandatory, sha256 },
  });

  return data;
}

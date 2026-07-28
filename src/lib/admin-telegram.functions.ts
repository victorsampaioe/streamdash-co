import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public server fn: called right after signUp on the client (no session yet).
// Sends a notification only to the admin chat. Payload is minimal (name/email/phone).
export const notifyAdminSignup = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; name?: string; phone?: string; referralCode?: string }) =>
    z.object({
      email: z.string().email(),
      name: z.string().max(120).optional(),
      phone: z.string().max(40).optional(),
      referralCode: z.string().max(20).optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { notifyAdmin } = await import("./admin-telegram.server");
    const parts = [
      "🆕 <b>Novo cadastro</b>",
      `Nome: ${escapeHtml(data.name ?? "-")}`,
      `E-mail: ${escapeHtml(data.email)}`,
      `Telefone: ${escapeHtml(data.phone ?? "-")}`,
    ];
    if (data.referralCode) parts.push(`Indicação: <code>${escapeHtml(data.referralCode)}</code>`);
    await notifyAdmin(parts.join("\n"));
    return { ok: true };
  });

function escapeHtml(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

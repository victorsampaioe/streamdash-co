import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const deleteUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // Admin check
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Unauthorized");

    // Check if user is an admin to prevent self-deletion or deleting other admins (safety)
    const { data: targetIsAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: data.userId,
      _role: "admin",
    });
    
    if (targetIsAdmin) {
        throw new Error("Não é permitido excluir administradores por este painel.");
    }

    // Delete from auth (this will cascade delete profiles if foreign key is set to cascade, 
    // but in many Supabase setups we delete profile manually first if needed. 
    // Auth delete is the authoritative one).
    const { error: aErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (aErr) throw aErr;

    return { success: true };
  });

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { validateEmail, validateUsername } from "@/lib/signup-validation";

const schema = z.object({
  email: z.string().max(254).optional(),
  username: z.string().max(24).optional(),
  suggest: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/account-availability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let emailAvailable: boolean | undefined;
        let usernameAvailable: boolean | undefined;
        let suggestion: string | undefined;

        if (parsed.data.email) {
          const checked = validateEmail(parsed.data.email);
          if (checked.ok) {
            const { data } = await supabaseAdmin.from("profiles").select("id").ilike("email", checked.value).maybeSingle();
            emailAvailable = !data;
          }
        }

        if (parsed.data.username) {
          const checked = validateUsername(parsed.data.username);
          if (checked.ok) {
            const { data } = await supabaseAdmin.from("profiles").select("id").ilike("username", checked.value).maybeSingle();
            usernameAvailable = !data;
          }
        }

        if (parsed.data.suggest) {
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const candidate = `cliente${crypto.getRandomValues(new Uint32Array(1))[0] % 10_000}`;
            const { data } = await supabaseAdmin.from("profiles").select("id").eq("username", candidate).maybeSingle();
            if (!data) {
              suggestion = candidate;
              break;
            }
          }
        }

        return Response.json({ emailAvailable, usernameAvailable, suggestion });
      },
    },
  },
});
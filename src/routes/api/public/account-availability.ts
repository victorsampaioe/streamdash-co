import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { validateUsername } from "@/lib/signup-validation";
import { authRequestError, readSmallAuthJson, privateAuthResponse } from "@/lib/public-auth-guard.server";
import { clientIp, enforceRateLimits } from "@/lib/api-security.server";

const schema = z.object({
  username: z.string().max(24).optional(),
  suggest: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/account-availability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = authRequestError(request);
        if (guard) return guard;
        const parsed = schema.safeParse(await readSmallAuthJson(request));
        if (!parsed.success) return privateAuthResponse({ error: "Dados inválidos." }, 400);

        const limit = await enforceRateLimits([{
          rule: { bucket: "signup-availability", limit: 60, windowSeconds: 600 },
          key: clientIp(request.headers),
        }]);
        if (limit) return limit;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let usernameAvailable: boolean | undefined;
          let suggestion: string | undefined;

          if (parsed.data.username) {
            const checked = validateUsername(parsed.data.username);
            if (checked.ok) {
              const { data, error } = await supabaseAdmin.from("profiles").select("id")
                .eq("username", checked.value).maybeSingle();
              if (error) throw error;
              usernameAvailable = !data;
            }
          }

          if (parsed.data.suggest) {
            for (let attempt = 0; attempt < 5; attempt++) {
              const candidate = `cliente${crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000}`;
              const { data, error } = await supabaseAdmin.from("profiles").select("id")
                .eq("username", candidate).maybeSingle();
              if (error) throw error;
              if (!data) { suggestion = candidate; break; }
            }
          }
          // E-mail não é consultado nesta rota pública, para evitar enumeração
          // de contas de terceiros e diminuir consultas em cada digitação.
          return privateAuthResponse({ usernameAvailable, suggestion });
        } catch (error) {
          console.error("[signup availability] database unavailable", error instanceof Error ? error.name : "unknown");
          return privateAuthResponse({ error: "Não foi possível conferir o usuário agora." }, 503);
        }
      },
    },
  },
});

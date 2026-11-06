import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validateEmail, validateUsername } from "@/lib/signup-validation";
import { authRequestError, readSmallAuthJson, privateAuthResponse } from "@/lib/public-auth-guard.server";
import { clientIp, enforceRateLimits } from "@/lib/api-security.server";

const schema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(6).max(128),
});

export const Route = createFileRoute("/api/public/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = authRequestError(request);
        if (guard) return guard;
        const payload = await readSmallAuthJson(request);
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return privateAuthResponse({ error: "Confira seu usuário e sua senha." }, 400);
        const identifier = parsed.data.identifier.toLowerCase();
        const ip = clientIp(request.headers);
        const blocked = await enforceRateLimits([
          { rule: { bucket: "login-identity", limit: 15, windowSeconds: 600 }, key: identifier },
          { rule: { bucket: "login-network", limit: 100, windowSeconds: 600 }, key: ip },
        ]);
        if (blocked) return blocked;

        try {
          let email: string | null = null;
          const emailCheck = validateEmail(identifier);
          if (emailCheck.ok) email = emailCheck.value;
          else {
            const usernameCheck = validateUsername(identifier);
            if (usernameCheck.ok) {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { data, error } = await supabaseAdmin.from("profiles").select("email")
                .eq("username", usernameCheck.value).maybeSingle();
              if (error) throw error;
              email = data?.email ?? null;
            }
          }
          if (!email) return privateAuthResponse({ error: "Usuário ou senha incorretos." }, 401);
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          const url = process.env.SUPABASE_URL;
          if (!key || !url) throw new Error("Auth not configured");
          const auth = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
                headers.delete("Authorization");
              }
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            } },
          });
          const { data, error } = await auth.auth.signInWithPassword({ email, password: parsed.data.password });
          if (error || !data.session) return privateAuthResponse({ error: "Usuário ou senha incorretos." }, 401);
          return privateAuthResponse({
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            },
          });
        } catch (error) {
          console.error("[login] service unavailable", error instanceof Error ? error.name : "unknown");
          return privateAuthResponse({ error: "Não foi possível entrar agora. Tente novamente." }, 503);
        }
      },
    },
  },
});

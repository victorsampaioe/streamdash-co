import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validateEmail, validateUsername } from "@/lib/signup-validation";

const schema = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(6).max(128) });

export const Route = createFileRoute("/api/public/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Confira seu usuário e sua senha." }, { status: 400 });

        let email: string | null = null;
        const emailCheck = validateEmail(parsed.data.identifier);
        if (emailCheck.ok) email = emailCheck.value;
        else {
          const usernameCheck = validateUsername(parsed.data.identifier);
          if (usernameCheck.ok) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("profiles")
              .select("email")
              .eq("username", usernameCheck.value)
              .maybeSingle();
            email = data?.email ?? null;
          }
        }

        if (!email) return Response.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
        const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
        const auth = createClient(process.env['SUPABASE_URL']!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
            headers.set("apikey", key);
            return fetch(input, { ...init, headers });
          } },
        });
        const { data, error } = await auth.auth.signInWithPassword({ email, password: parsed.data.password });
        if (error || !data.session) return Response.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
        return Response.json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
      },
    },
  },
});
import { createFileRoute } from "@tanstack/react-router";

/**
 * Rota exclusiva de criação de conta.
 * Todas as proteções (rate limit, Turnstile, validações, idempotência) ficam aqui,
 * portanto chamadas diretas de bots recebem o mesmo tratamento do formulário.
 */
export const Route = createFileRoute("/api/public/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Requisição inválida" }, { status: 400 });
        }

        const { handleSignup } = await import("@/lib/signup-flow.server");
        try {
          const { status, body } = await handleSignup(payload, request.headers);
          return Response.json(body, { status });
        } catch (e) {
          console.log("[SIGNUP SECURITY] unexpected error", (e as Error).message);
          return Response.json({ error: "Não foi possível concluir o cadastro." }, { status: 500 });
        }
      },
    },
  },
});

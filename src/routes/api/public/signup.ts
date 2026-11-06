import { createFileRoute } from "@tanstack/react-router";
import { authRequestError, privateAuthResponse, readSmallAuthJson } from "@/lib/public-auth-guard.server";

export const Route = createFileRoute("/api/public/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = authRequestError(request);
        if (guard) return guard;
        const payload = await readSmallAuthJson(request);
        if (!payload) return privateAuthResponse({ error: "Confira os dados preenchidos e tente novamente." }, 400);

        try {
          const { handleSignup } = await import("@/lib/signup-flow.server");
          const { status, body } = await handleSignup(payload, request.headers);
          return privateAuthResponse(body, status);
        } catch (error) {
          console.error("[signup] falha inesperada", error instanceof Error ? error.name : "unknown");
          return privateAuthResponse({ error: "Não foi possível concluir o cadastro agora. Tente novamente." }, 503);
        }
      },
    },
  },
});

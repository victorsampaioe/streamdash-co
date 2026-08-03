import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { toSafeError } from "./lib/safe-error";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Impede que detalhes técnicos (SQL, hosts, credenciais, stack) cheguem ao cliente.
const safeErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error != null && typeof error === "object" && "statusCode" in error) throw error;
    console.error("[server-fn]", error);
    throw toSafeError(error);
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, safeErrorMiddleware],
  requestMiddleware: [errorMiddleware],
}));


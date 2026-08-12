import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getMyDiagnostics = createServerFn({ method: "GET" })
  .handler(async ({ context }: any) => {
    if (!context?.userId) throw new Error("Não autenticado");
    
    const { supabase } = await import("@/integrations/supabase/client");
    
    // Admin pode ver todos, outros vêem os próprios
    const { data: isAdmin } = await supabase.rpc("has_role", { 
      _user_id: context.userId, 
      _role: "admin" 
    });

    let query = supabase
      .from('content_diagnostics')
      .select('*, servers(name)')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!isAdmin) {
      query = query.eq('user_id', context.userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  });

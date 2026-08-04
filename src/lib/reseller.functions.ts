import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// This file must only contain imports, types, and server functions.
// Logic belongs inside handlers.

export const getResellerNetwork = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Fetch sub-resellers (direct children)
    const { data: subResellers, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, credits, created_at")
      .eq("parent_id", user.id);

    if (error) throw error;

    // Fetch clients (not resellers themselves, but users managed by this reseller)
    // For now, we distinguish clients as users without 'admin' or 'reseller' roles who have this user as parent
    // But since everyone is technically a 'user', we'll just fetch all children for now.
    
    return subResellers || [];
  });

export const getCreditHistory = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from("credit_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  });

export const getResellerStats = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Get my profile for credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    // Get count of active children
    const { count: activeClients } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", user.id);

    return {
      credits: profile?.credits || 0,
      activeClients: activeClients || 0,
      revenue: 0, // Placeholder for future revenue tracking
    };
  });

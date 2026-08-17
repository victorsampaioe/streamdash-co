import { supabase } from "@/integrations/supabase/client";

/**
 * MASTER ADMIN account constant.
 */
export const ADMIN_MASTER_EMAIL = "victorsampaio133@gmail.com";

/**
 * Checks if a given email is the ADMIN MASTER.
 */
export const isAdminMaster = (email: string | null | undefined): boolean => {
  return email?.toLowerCase() === ADMIN_MASTER_EMAIL.toLowerCase();
};

/**
 * Client-side hook/util to check if the current user has full access.
 * Returns true if the user is an admin OR is the ADMIN MASTER.
 */
export async function checkFullAccess(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  if (isAdminMaster(user.email)) return true;
  
  const { data: isAdmin } = await supabase.rpc("has_role", { 
    _user_id: user.id, 
    _role: "admin" 
  });
  
  return !!isAdmin;
}

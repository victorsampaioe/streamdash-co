import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function reset() {
  const email = 'areaplay0106@gmail.com';
  const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw listErr;
  
  const user = users.find(u => u.email === email);
  if (!user) {
    console.log("User not found in Auth");
    return;
  }
  
  const newPassword = 'Stream@2026!';
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword
  });
  
  if (error) {
    console.error("Error resetting password:", error.message);
  } else {
    console.log(`Password reset successfully for ${email} to: ${newPassword}`);
  }
}

reset();
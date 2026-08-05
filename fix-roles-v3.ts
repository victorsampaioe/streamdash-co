
import { supabaseAdmin } from "./src/integrations/supabase/client.server.ts";

async function run() {
  console.log("--- Starting Deep Search and Fix for User Roles (V3) ---");

  // Get all users from auth.users via a direct query if possible, or just profiles
  // Since we can't query auth.users directly without RPC or special config, we trust profiles
  const { data: allProfiles, error: err } = await supabaseAdmin.from("profiles").select("id, email, full_name");
  if (err) {
    console.error("Error fetching profiles:", err);
    return;
  }

  console.log(`Found ${allProfiles?.length || 0} profiles in database.`);
  allProfiles?.forEach(p => console.log(`- ${p.email} (ID: ${p.id})`));

  const targetEmails = [
    "osmarmoreirasantosjunior@gmail.com",
    "interconect2023@gmail.com",
    "areaplay0106@gmail.com"
  ];

  for (const email of targetEmails) {
    const profile = allProfiles?.find(p => p.email?.toLowerCase() === email.toLowerCase());
    
    if (!profile) {
      console.log(`\nEmail NOT FOUND in profiles: ${email}`);
      continue;
    }

    console.log(`\nProcessing: ${email} (ID: ${profile.id})`);
    
    let targetRole: 'admin' | 'reseller' | 'sub_reseller' = 'reseller';
    
    if (email.toLowerCase() === "osmarmoreirasantosjunior@gmail.com") {
      targetRole = 'admin';
    } else if (email.toLowerCase() === "interconect2023@gmail.com") {
      targetRole = 'reseller';
    } else {
      const { data: tree } = await supabaseAdmin
        .from("reseller_tree")
        .select("parent_reseller_id")
        .eq("user_id", profile.id)
        .maybeSingle();
      
      if (tree?.parent_reseller_id) {
        targetRole = 'sub_reseller';
      }
    }

    console.log(`Applying role: ${targetRole}`);

    // Update user_roles table
    await supabaseAdmin.from("user_roles").delete().eq("user_id", profile.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: profile.id, role: targetRole });

    // Update reseller_profile
    const { data: existingRp } = await supabaseAdmin.from("reseller_profile").select("id").eq("user_id", profile.id).maybeSingle();
    if (!existingRp) {
      await supabaseAdmin.from("reseller_profile").insert({
        user_id: profile.id,
        role: targetRole,
        status: 'active'
      });
    } else {
      await supabaseAdmin.from("reseller_profile").update({
        role: targetRole,
        status: 'active'
      }).eq("user_id", profile.id);
    }
    
    console.log(`Sync complete for ${email}`);
  }

  console.log("\n--- Done ---");
}

run().catch(console.error);

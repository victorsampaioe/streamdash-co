
import { supabaseAdmin } from "./src/integrations/supabase/client.server.ts";

async function run() {
  console.log("--- Starting User Role and Profile Fix ---");

  // 1. Identify users by email
  const emails = [
    "osmarmoreirasantosjunior@gmail.com", // Admin
    "interconect2023@gmail.com",           // Reseller
    "areaplay0106@gmail.com"              // Reseller/Sub-reseller
  ];

  for (const email of emails) {
    console.log(`\nProcessing: ${email}`);
    
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, is_reseller, role")
      .eq("email", email)
      .maybeSingle();

    if (profileErr || !profile) {
      console.log(`Profile not found for ${email}`);
      continue;
    }

    const userId = profile.id;
    let targetRole: 'admin' | 'reseller' | 'sub_reseller' = 'reseller';
    
    if (email === "osmarmoreirasantosjunior@gmail.com") {
      targetRole = 'admin';
    } else if (email === "interconect2023@gmail.com") {
      targetRole = 'reseller';
    } else if (email === "areaplay0106@gmail.com") {
      // Check tree to see if it's a sub-reseller
      const { data: tree } = await supabaseAdmin
        .from("reseller_tree")
        .select("parent_reseller_id")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (tree?.parent_reseller_id) {
        targetRole = 'sub_reseller';
      }
    }

    console.log(`Setting role to: ${targetRole}`);

    // Update profiles.role
    const { error: up1 } = await supabaseAdmin
      .from("profiles")
      .update({ 
        role: targetRole,
        is_reseller: true // Ensure is_reseller is true for these specific accounts
      })
      .eq("id", userId);
    if (up1) console.error("Error updating profile:", up1);

    // Update user_roles table
    // First delete existing roles for this user to avoid conflicts
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    
    const { error: up2 } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: targetRole });
    if (up2) console.error("Error inserting role:", up2);

    // Ensure reseller_profile exists
    const { data: rp } = await supabaseAdmin
      .from("reseller_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!rp) {
      console.log("Creating reseller_profile...");
      const { error: up3 } = await supabaseAdmin
        .from("reseller_profile")
        .insert({
          user_id: userId,
          role: targetRole,
          status: 'active'
        });
      if (up3) console.error("Error creating reseller_profile:", up3);
    } else {
      const { error: up3 } = await supabaseAdmin
        .from("reseller_profile")
        .update({
          role: targetRole,
          status: 'active'
        })
        .eq("user_id", userId);
      if (up3) console.error("Error updating reseller_profile:", up3);
    }
  }

  console.log("\n--- Fix complete ---");
}

run().catch(console.error);

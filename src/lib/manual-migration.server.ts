import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function migrateSpecificResellers() {
  const adminId = 'cb9607f2-1358-422e-9b3a-f14af89d8096';
  const interconectId = '7e46090e-aff3-4abd-b8e4-7ec2388134dc';
  const areaplayId = '81e66efe-adf4-45f2-8fc5-9a13e3a4e893';

  console.log("Starting migration for areaplay0106 and interconect2023...");

  // 1. Ensure profiles are marked as resellers
  await supabaseAdmin.from("profiles").update({ 
    is_reseller: true 
  }).in("id", [interconectId, areaplayId]);

  // 2. Set up interconect2023 as direct reseller of admin
  await supabaseAdmin.from("reseller_tree").upsert({
    user_id: interconectId,
    parent_reseller_id: adminId,
    owner_id: adminId
  }, { onConflict: 'user_id' });

  // 3. Set up areaplay0106 as sub-reseller of interconect2023
  await supabaseAdmin.from("reseller_tree").upsert({
    user_id: areaplayId,
    parent_reseller_id: interconectId,
    owner_id: interconectId
  }, { onConflict: 'user_id' });

  // 4. Ensure wallets exist with correct credits
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, credits")
    .in("id", [interconectId, areaplayId]);

  for (const p of profiles || []) {
    await supabaseAdmin.from("reseller_wallet").upsert({
      reseller_id: p.id,
      credits: p.credits || 0
    }, { onConflict: 'reseller_id' });
  }

  // 5. Ensure subscriptions are 'reseller'
  await supabaseAdmin.from("subscriptions").upsert([
    { user_id: interconectId, plan: 'reseller' as any, status: 'active', expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString() },
    { user_id: areaplayId, plan: 'reseller' as any, status: 'active', expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString() }
  ], { onConflict: 'user_id' });

  console.log("Migration completed successfully.");
}

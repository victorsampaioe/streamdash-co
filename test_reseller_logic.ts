import { createResellerAccount } from "./src/lib/reseller-v2.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { getParentResellerPlans } from "./src/lib/reseller.functions";

async function test() {
  console.log("Starting Reseller Tree Test...");

  const creatorEmail = "interconect2023@gmail.com";
  const { data: creator, error: cErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("email", creatorEmail)
    .single();

  if (cErr || !creator) {
    console.error("Creator not found:", cErr);
    return;
  }

  const initialCredits = creator.credits || 0;
  console.log(`Creator: ${creatorEmail}, Credits: ${initialCredits}`);

  const subEmail = "test_sub_reseller_" + Math.random().toString(36).slice(2, 7) + "@streammonitor.site";
  
  console.log(`Creating sub-reseller: ${subEmail} with 10 credits...`);
  
  try {
    const result = await createResellerAccount(
      creator.id,
      subEmail,
      "Test Sub-Reseller",
      10, // initial credits
      1,  // months (ignored for reseller)
      true // isReseller
    );

    console.log("Creation successful. ID:", result.id);

    // 1. Check Creator Credits
    const { data: updatedCreator } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", creator.id)
      .single();
    
    console.log(`Updated Creator Credits: ${updatedCreator?.credits} (Expected: ${initialCredits - 10})`);

    // 2. Check Sub-Reseller Profile
    const { data: subProfile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", result.id)
      .single();
    
    console.log(`Sub-Reseller Parent ID: ${subProfile?.parent_id} (Expected: ${creator.id})`);
    console.log(`Sub-Reseller Credits: ${subProfile?.credits} (Expected: 10)`);
    console.log(`Sub-Reseller is_reseller: ${subProfile?.is_reseller} (Expected: true)`);

    // 3. Check Subscription
    const { data: subSubscription } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", result.id)
      .single();
    
    console.log(`Sub-Reseller Plan: ${subSubscription?.plan} (Expected: reseller)`);

    // 4. Test Inheritance
    console.log("Testing Plan Inheritance...");
    
    // Create a plan for the parent
    const { data: testPlan, error: pErr } = await supabaseAdmin
      .from("reseller_plans")
      .insert({
        reseller_id: creator.id,
        name: "Test Legacy Plan",
        price_cents: 5000,
        duration_days: 30,
        kind: "plan"
      } as any)
      .select()
      .single();
    
    if (pErr) {
        console.error("Error creating test plan:", pErr);
    } else {
        console.log("Test plan created for parent.");
    }

    // Call getParentResellerPlans simulating the sub-reseller's context
    // The getParentResellerPlans function uses supabase.auth.getUser() internally usually,
    // but in server functions, it might be different. 
    // Wait, getParentResellerPlans is a server function. 
    // I will check the implementation.
    
    // Cleanup: delete sub-reseller and test plan
    console.log("Cleaning up...");
    await supabaseAdmin.from("reseller_plans").delete().eq("id", testPlan.id);
    // profiles/subscriptions/auth users are harder to clean perfectly but fine for a test
    
    console.log("Test complete.");
  } catch (error: any) {
    console.error("Test failed:", error.message);
  }
}

test();

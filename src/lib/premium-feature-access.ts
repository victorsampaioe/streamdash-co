import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {createServerFn} from "@tanstack/react-start";

/** Authoritative subscription gate for premium export/generation tools.
 * A signed-in account is not automatically a paid account.
 * Trial / expired / cancelled subscriptions cannot generate paid assets.
 */
export async function requirePaidFeature(context:{userId:string;supabase:any;claims?:any}){
  const {data:admin,error:roleError}=await context.supabase.rpc("has_role",{
    _user_id:context.userId,_role:"admin",
  });
  if(roleError)throw new Error("Não foi possível confirmar seu plano. Tente novamente.");
  if(admin===true)return;
  const {data:sub,error}=await context.supabase.from("subscriptions")
    .select("plan,status,expires_at")
    .eq("user_id",context.userId).maybeSingle();
  if(error)throw new Error("Não foi possível conferir sua assinatura. Tente novamente.");
  if(sub?.status==="active" && ["monthly","yearly","basic","reseller"].includes(sub.plan)
      && Date.parse(sub.expires_at)>Date.now())return;
  // Credit resellers retain access while credits are available.
  const [{data:reseller},{data:subReseller},{data:wallet,error:walletError}]=await Promise.all([
    context.supabase.rpc("has_role",{_user_id:context.userId,_role:"reseller"}),
    context.supabase.rpc("has_role",{_user_id:context.userId,_role:"sub_reseller"}),
    context.supabase.from("reseller_wallet").select("credits").eq("reseller_id",context.userId).maybeSingle(),
  ]);
  if(walletError)throw new Error("Não foi possível conferir o saldo da revenda.");
  if((reseller===true||subReseller===true)&&Number(wallet?.credits||0)>0)return;
  throw new Error("ASSINATURA_NECESSARIA: Assine um plano para usar as vitrines.");
}

export const checkPremiumFeature=createServerFn({method:"GET"})
 .middleware([requireSupabaseAuth])
 .handler(async ({context})=>{
   try {
     await requirePaidFeature(context);
     return {allowed:true,preview:false};
   } catch (error) {
     // Only a confirmed lack of a paid entitlement enables the read-only
     // showroom. Database/auth errors remain fail-closed, not demo-access.
     if(error instanceof Error && error.message.startsWith("ASSINATURA_NECESSARIA:"))
       return {allowed:false,preview:true};
     throw error;
   }
 });

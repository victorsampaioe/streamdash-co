import {type ReactNode} from "react";
import {Link,useRouteContext} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {checkPremiumFeature} from "@/lib/premium-feature-access";
import {AppShell} from "@/components/app-shell";
import {UnpaidPreview} from "@/components/subscription/unpaid-preview";

/** Fail closed: premium content is not mounted until the server authorizes payment. */
export function PremiumVitrineGate({children}:{children:ReactNode}){
  const {user}=useRouteContext({from:"/_authenticated"});
  const check=useServerFn(checkPremiumFeature);
  const state=useQuery({
    queryKey:["premium-vitrine-access",user.id],
    queryFn:()=>check(),
    retry:1,
    staleTime:0,
    refetchOnWindowFocus:true,
  });
  if(state.isPending)return <div className="mx-auto max-w-xl p-8 text-center text-slate-200">Verificando assinatura...</div>;
  if(state.data?.preview===true)return <AppShell><UnpaidPreview/></AppShell>;
  if(state.isError||state.data?.allowed!==true)return (
    <main className="mx-auto mt-10 max-w-xl rounded-2xl border border-blue-500/30 bg-slate-950 p-7 text-center text-white shadow-2xl">
      <div className="text-4xl">🔒</div>
      <h1 className="mt-4 text-2xl font-bold">Assinatura necessária</h1>
      <p className="mt-3 text-slate-300">As ferramentas premium do Stream Monitor, incluindo Vitrine Banner e Vitrine IA, exigem uma assinatura paga e vigente. Escolha um plano e conclua o pagamento para liberar o painel.</p>
      <Link to="/app/subscription" className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500">Ver planos e pagar com Pix</Link>
      <button type="button" onClick={()=>state.refetch()} className="mt-4 block w-full text-sm text-blue-300 underline">Já paguei · verificar novamente</button>
    </main>
  );
  return <>{children}</>;
}

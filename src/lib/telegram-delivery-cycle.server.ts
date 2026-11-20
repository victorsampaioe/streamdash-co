import {withCycleLock} from "@/lib/job-lock.server";
import {retryConfirmedDnsAlerts,retryRecoveredDnsAlerts} from "@/lib/dns-alert-retry.server";
import {retryServerIncidentAlerts} from "@/lib/server-alert-retry.server";
import {processTelegramOutbox} from "@/lib/telegram-outbox.server";

export type TelegramDispatchResult={
  ok:boolean; skipped?:boolean; reason?:string;
  offline:{attempted:number;failed:number};
  online:{attempted:number;failed:number};
  service:{attempted:number;failed:number};
  outbox:{picked:number;sent:number;failed:number;dead:number};
  deliveryErrors:number;
};

/**
 * Shared retry dispatcher, serialized across Cloudflare Queue and the
 * existing pg_cron fallback. Channel-level deduplication and atomic outbox
 * claims remain authoritative in PostgreSQL during this migration phase.
 */
export async function runTelegramDeliveryCycle():Promise<TelegramDispatchResult|{skipped:true;reason:string;lock:string}> {
  return withCycleLock("cron-dns-alerts",55,async()=>{
    // One-time launch: enqueue eligible Telegram channels without requiring an
    // active subscription. Unique campaign keys prevent duplicate messages.
    await Promise.resolve().then(async () => {
      const { enqueueAppActivationLaunchOnce } = await import("./app-activation-launch-announcement.server");
      return enqueueAppActivationLaunchOnce();
    }).catch(e => {
      console.error("[telegram-core] activation launch", e instanceof Error ? e.name : "error");
    });
    const offline=await Promise.resolve().then(()=>retryConfirmedDnsAlerts(5))
      .catch(e=>{console.error("[telegram-core] dns_offline",e instanceof Error?e.name:"error");return {attempted:0,failed:1};});
    const online=await Promise.resolve().then(()=>retryRecoveredDnsAlerts(5))
      .catch(e=>{console.error("[telegram-core] dns_recovery",e instanceof Error?e.name:"error");return {attempted:0,failed:1};});
    const service=await Promise.resolve().then(()=>retryServerIncidentAlerts(4))
      .catch(e=>{console.error("[telegram-core] server_alert",e instanceof Error?e.name:"error");return {attempted:0,failed:1};});
    // Recover any post-rollout approved payments whose original queue write
    // was interrupted. Queue keys are unique by payment + admin destination,
    // so concurrent Cloudflare and panel cycles cannot duplicate the receipt.
    await Promise.resolve().then(async()=>{
      const {reconcileAdminPaymentReceipts}=await import("./admin-payment-telegram.server");
      return reconcileAdminPaymentReceipts(8);
    }).catch(e=>{console.error("[telegram-core] admin payment recovery",
      e instanceof Error?e.name:"error");return null;});
    const outbox=await Promise.resolve().then(()=>processTelegramOutbox(8))
      .catch(e=>{console.error("[telegram-core] outbox",e instanceof Error?e.name:"error");return {picked:0,sent:0,failed:1,dead:0};});
    const deliveryErrors=Number(offline.failed||0)+Number(online.failed||0)+Number(service.failed||0)+Number(outbox.failed||0);
    return {ok:true,offline,online,service,outbox,deliveryErrors};
  });
}

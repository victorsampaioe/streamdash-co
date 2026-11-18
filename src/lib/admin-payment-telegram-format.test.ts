import {describe,expect,it} from "vitest";
import {formatAdminPaymentReceipt} from "./admin-payment-telegram-format";

describe("Admin payment receipt",()=>{
  const sample={
    name:"cliente699327",email:"bravohubofc@gmail.com",plan:"monthly",
    amountCents:2500,paymentId:"13008020-fd60-426c-bea0-a150d3f66f28",
    paidAt:"2026-11-18T00:19:23.030Z",
    expiresAt:"2026-12-18T00:19:23.151Z",paymentType:"subscription",
  };
  it("shows the approved Pix value, account and Fortaleza timestamps",()=>{
    const msg=formatAdminPaymentReceipt(sample);
    expect(msg).toContain("R$ 25,00".replace(" "," "));
    expect(msg).toContain("bravohubofc@gmail.com");
    expect(msg).toContain("17/11/2026");
    expect(msg).toContain("17/12/2026");
    expect(msg).toContain("APROVADO");
    expect(msg).toContain("Plano: <b>Mensal</b>");
  });
  it("escapes untrusted profile text before using Telegram HTML",()=>{
    const msg=formatAdminPaymentReceipt({...sample,
      name:"<b>Falso</b> & Co",email:"evil<&>@example.com"});
    expect(msg).toContain("&lt;b&gt;Falso&lt;/b&gt; &amp; Co");
    expect(msg).not.toContain("<b>Falso</b>");
    expect(msg).toContain("evil&lt;&amp;&gt;@example.com");
  });
  it("supports store and API payments without altering payment data",()=>{
    const msg=formatAdminPaymentReceipt({...sample,paymentType:"api_subscription",expiresAt:null});
    expect(msg).toContain("Pagamento API confirmado");
    expect(msg).not.toContain("Vencimento:");
  });
});

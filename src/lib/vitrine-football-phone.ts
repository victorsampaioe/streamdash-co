/** Keep each reseller's WhatsApp number, only present it in Brazilian format. */
export function formatBrazilianWhatsApp(value:string):string{
  const input=String(value||"").trim();
  let digits=input.replace(/\D/g,"");
  if(digits.startsWith("55")&&(digits.length===13||digits.length===12)){
    digits=digits.slice(2);
  }
  if(digits.length===11){
    return "("+digits.slice(0,2)+") "+digits.slice(2,7)+"-"+digits.slice(7);
  }
  if(digits.length===10){
    return "("+digits.slice(0,2)+") "+digits.slice(2,6)+"-"+digits.slice(6);
  }
  return input.slice(0,25);
}

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Activity, ShieldCheck, Download, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toPng } from "html-to-image";

export function MonitorBadge({
  serverName,
  slug,
}: {
  serverName: string;
  slug: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const url = `https://streammonitor.site/status/${slug}`;

  async function download() {
    if (!ref.current) return;
    try {
      const png = await toPng(ref.current, { pixelRatio: 3, backgroundColor: "#0a0a0a" });
      const a = document.createElement("a");
      a.href = png; a.download = `selo-${slug}.png`; a.click();
    } catch (e) {
      toast.error("Falha ao gerar imagem");
    }
  }

  function copyEmbed() {
    const html = `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#0a0a0a;color:#fff;border:1px solid #22c55e;border-radius:8px;font-family:system-ui;font-size:13px;text-decoration:none"><span style="color:#22c55e">●</span> DNS Monitorada por Stream Monitor</a>`;
    navigator.clipboard.writeText(html);
    toast.success("HTML copiado");
  }

  return (
    <div className="space-y-4">
      <div ref={ref} className="mx-auto max-w-sm rounded-2xl p-6 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 border border-primary/40 shadow-2xl">
        <div className="flex items-center gap-2 text-primary text-xs font-semibold tracking-widest uppercase mb-3">
          <ShieldCheck className="h-4 w-4" /> DNS Monitorada
        </div>
        <div className="text-white font-bold text-xl leading-tight mb-1 break-words">{serverName}</div>
        <div className="text-neutral-400 text-xs mb-5">Verificação contínua 24/7</div>

        <div className="bg-white p-3 rounded-lg inline-block mb-4">
          <QRCodeCanvas value={url} size={140} level="M" />
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-neutral-800">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-white text-sm font-semibold">
            stream<span className="text-primary">monitor</span>.site
          </span>
        </div>
      </div>

      <div className="flex gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={download}><Download className="h-4 w-4 mr-1" />Baixar PNG</Button>
        <Button variant="outline" size="sm" onClick={copyEmbed}><Copy className="h-4 w-4 mr-1" />Copiar embed HTML</Button>
      </div>
      <p className="text-xs text-muted-foreground text-center break-all">Link público: {url}</p>
    </div>
  );
}

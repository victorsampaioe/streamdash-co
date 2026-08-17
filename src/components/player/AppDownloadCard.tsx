import { Smartphone, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppDownloadCardProps {
  primaryColor?: string;
  apkUrl?: string | null;
}

/**
 * Área "Baixe nosso aplicativo" — estrutura pronta para receber o APK.
 * Enquanto o link não existir, o botão fica em estado "em breve".
 */
export function AppDownloadCard({ primaryColor = "#3B82F6", apkUrl }: AppDownloadCardProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: primaryColor }}
      />
      <div className="relative flex flex-col md:flex-row md:items-center gap-6">
        <div
          className="h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}
        >
          <Smartphone className="h-7 w-7" />
        </div>

        <div className="flex-1 space-y-1">
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
            Baixe nosso aplicativo
          </h2>
          <p className="text-sm text-white/50 max-w-xl">
            Mesma conta, mesmo catálogo — com desempenho nativo na TV e no celular Android.
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/35 pt-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Instalação simples · APK oficial
          </p>
        </div>

        {apkUrl ? (
          <Button
            asChild
            className="h-12 px-6 rounded-xl font-bold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <a href={apkUrl} download>
              <Download className="h-5 w-5 mr-2" /> Baixar App Android
            </a>
          </Button>
        ) : (
          <Button
            disabled
            className="h-12 px-6 rounded-xl font-bold bg-white/5 border border-white/10 text-white/40"
          >
            <Download className="h-5 w-5 mr-2" /> App Android em breve
          </Button>
        )}
      </div>
    </section>
  );
}

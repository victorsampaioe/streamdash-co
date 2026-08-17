import { Smartphone, Download, ShieldCheck, Clock, HardDrive, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANDROID_APP, formatAppDate } from "@/config/android-app";

interface AppDownloadCardProps {
  primaryColor?: string;
  /** Sobrescreve o APK global (link específico do revendedor). */
  apkUrl?: string | null;
}

/**
 * Área "Baixe nosso aplicativo".
 * O botão sempre aponta para /download/android (link estável),
 * que redireciona para o APK configurado no momento.
 */
export function AppDownloadCard({ primaryColor = "#3B82F6", apkUrl }: AppDownloadCardProps) {
  const available = Boolean(apkUrl || ANDROID_APP.apkUrl);
  const href = apkUrl || ANDROID_APP.downloadPath;
  const updated = formatAppDate(ANDROID_APP.updatedAt);

  const meta = [
    ANDROID_APP.version ? { icon: Tag, label: `Versão ${ANDROID_APP.version}` } : null,
    ANDROID_APP.size ? { icon: HardDrive, label: ANDROID_APP.size } : null,
    updated ? { icon: Clock, label: `Atualizado em ${updated}` } : null,
  ].filter(Boolean) as Array<{ icon: typeof Tag; label: string }>;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: primaryColor }}
      />
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 md:flex md:items-center md:gap-6">
        <div
          className="h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}
        >
          <Smartphone className="h-7 w-7" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
            Baixe nosso aplicativo
          </h2>
          <p className="text-sm text-white/50 max-w-xl">
            Mesma conta, mesmo catálogo — com desempenho nativo na TV e no celular Android.
          </p>

          {meta.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-[11px] font-semibold text-white/40">
              {meta.map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </span>
              ))}
            </div>
          )}

          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/35 pt-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Instalação simples · APK oficial
          </p>
        </div>

        <div className="col-span-2 md:col-auto">
          {available ? (
            <Button
              asChild
              className="h-12 w-full md:w-auto px-6 rounded-xl font-bold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <a href={href} rel="noopener">
                <Download className="h-5 w-5 mr-2" /> Baixar aplicativo Android
              </a>
            </Button>
          ) : (
            <Button
              disabled
              className="h-12 w-full md:w-auto px-6 rounded-xl font-bold bg-white/5 border border-white/10 text-white/40"
            >
              <Download className="h-5 w-5 mr-2" /> Em breve
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

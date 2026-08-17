import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { Smartphone, ArrowLeft } from "lucide-react";
import { ANDROID_APP, formatAppDate } from "@/config/android-app";

export const Route = createFileRoute("/download/android")({
  head: () => ({
    meta: [
      { title: "Baixar app Android — Stream Monitor Play" },
      {
        name: "description",
        content:
          "Baixe o aplicativo Android do Stream Monitor Play e assista ao seu catálogo com desempenho nativo no celular e na TV.",
      },
      { property: "og:title", content: "Baixar app Android — Stream Monitor Play" },
      {
        property: "og:description",
        content: "Aplicativo Android oficial do Stream Monitor Play para celular e TV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    if (ANDROID_APP.apkUrl) {
      throw redirect({ href: ANDROID_APP.apkUrl });
    }
  },
  component: AndroidDownloadPage,
});

function AndroidDownloadPage() {
  const updated = formatAppDate(ANDROID_APP.updatedAt);

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/60">
          <Smartphone className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Aplicativo Android em breve</h1>
        <p className="text-sm text-white/50">
          Ainda não há uma versão publicada do APK. Assim que o aplicativo for liberado, este mesmo
          endereço passará a baixar a versão mais recente automaticamente.
        </p>
        {(ANDROID_APP.version || ANDROID_APP.size || updated) && (
          <p className="text-[11px] font-semibold text-white/35">
            {[ANDROID_APP.version && `Versão ${ANDROID_APP.version}`, ANDROID_APP.size, updated]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-white/70 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao início
        </Link>
      </div>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Palette, Download, Share2, Loader2, Lock, History, RefreshCw } from "lucide-react";
import { renderArt, canvasToBlob, type ArtData } from "@/lib/art-canvas";
import { notifyArtReady } from "@/lib/art.functions";

export const Route = createFileRoute("/_authenticated/app/artes")({
  component: ArtStudio,
  validateSearch: (s: Record<string, unknown>) => ({ server: typeof s.server === "string" ? s.server : undefined }),
  head: () => ({
    meta: [
      { title: "Gerador de Artes de Novidades | Stream Monitor" },
      { name: "description", content: "Gere artes profissionais das novidades de cada servidor IPTV monitorado." },
      { property: "og:title", content: "Gerador de Artes de Novidades" },
      { property: "og:description", content: "Artes premium com filmes, séries e canais novos de cada servidor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const PERIODS = [
  { h: 24, label: "24 horas" },
  { h: 72, label: "3 dias" },
  { h: 168, label: "7 dias" },
];

type Change = { name: string; kind: string; detected_at: string };

function ArtStudio() {
  const { server: preselect } = Route.useSearch();
  const qc = useQueryClient();
  const [serverId, setServerId] = useState<string>(preselect ?? "");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const { data: isAdmin, isLoading: loadingRole } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const { data: servers = [] } = useQuery({
    enabled: !!isAdmin,
    queryKey: ["artes-servers"],
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("id, name").order("name");
      return (data as Array<{ id: string; name: string }>) ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    enabled: !!isAdmin,
    queryKey: ["artes-history", serverId],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = (supabase as any).from("art_generations").select("*").order("created_at", { ascending: false }).limit(50);
      if (serverId) q = q.eq("server_id", serverId);
      const { data } = await q;
      return (data as Array<any>) ?? [];
    },
  });


  useEffect(() => {
    if (!serverId && servers.length) setServerId(servers[0]!.id);
  }, [servers, serverId]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function generate() {
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) return toast.error("Selecione um servidor");
    setBusy(true);
    try {
      const since = new Date(Date.now() - hours * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("iptv_catalog_changes")
        .select("name, kind, detected_at")
        .eq("server_id", serverId)
        .eq("action", "added")
        .gte("detected_at", since)
        .order("detected_at", { ascending: false })
        .limit(400);
      if (error) throw new Error(error.message);
      const changes = (data as Change[]) ?? [];
      const pick = (k: string) => changes.filter((c) => c.kind === k).map((c) => c.name);
      const art: ArtData = {
        serverName: srv.name,
        movies: pick("vod"),
        series: pick("series"),
        channels: pick("live"),
        total: changes.length,
        updatedAt: new Date().toISOString(),
      };
      const canvas = await renderArt(art);
      const blob = await canvasToBlob(canvas);
      blobRef.current = blob;
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));

      const { data: u } = await supabase.auth.getUser();
      await (supabase as any).from("art_generations").insert({
        server_id: serverId,
        created_by: u.user!.id,
        server_name: srv.name,
        total_new: art.total,
        movies: art.movies.slice(0, 20),
        series: art.series.slice(0, 20),
        channels: art.channels.slice(0, 20),
        period_hours: hours,
      });
      qc.invalidateQueries({ queryKey: ["artes-history"] });

      try {
        await notifyArtReady({ data: { serverId, serverName: srv.name, total: art.total } });
      } catch { /* aviso no Telegram é best-effort */ }

      toast.success(`Arte gerada com ${art.total} novidades!`);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível gerar a arte");
    } finally {
      setBusy(false);
    }
  }

  async function blobFromRow(row: any) {
    const canvas = await renderArt({
      serverName: row.server_name,
      movies: row.movies ?? [],
      series: row.series ?? [],
      channels: row.channels ?? [],
      total: row.total_new,
      updatedAt: row.created_at,
    });
    return await canvasToBlob(canvas);
  }

  function rowFileName(row: any) {
    const n = String(row.server_name ?? "servidor").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `novidades-${n}.png`;
  }

  async function regenerate(row: any) {
    setBusy(true);
    try {
      const blob = await blobFromRow(row);
      blobRef.current = blob;
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao recriar a arte");
    } finally {
      setBusy(false);
    }
  }

  async function downloadRow(row: any) {
    setBusy(true);
    try {
      const blob = await blobFromRow(row);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = rowFileName(row);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao baixar a arte");
    } finally {
      setBusy(false);
    }
  }

  async function shareRow(row: any) {
    setBusy(true);
    try {
      const blob = await blobFromRow(row);
      const file = new File([blob], rowFileName(row), { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Novidades do servidor" });
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Arte copiada para a área de transferência!");
    } catch {
      /* usuário cancelou ou navegador sem suporte */
    } finally {
      setBusy(false);
    }
  }


  function fileName() {
    const srv = servers.find((s) => s.id === serverId)?.name ?? "servidor";
    return `novidades-${srv.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  }

  function download() {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = fileName();
    a.click();
  }

  async function share() {
    if (!blobRef.current) return;
    const file = new File([blobRef.current], fileName(), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Novidades do servidor" }); return; } catch { return; }
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobRef.current })]);
      toast.success("Arte copiada para a área de transferência!");
    } catch {
      download();
    }
  }

  if (loadingRole) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  if (!isAdmin) {
    return (
      <Card className="p-10 border-dashed text-center space-y-3 max-w-md mx-auto mt-8">
        <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Área restrita</h1>
        <p className="text-sm text-muted-foreground">O Gerador de Artes está disponível apenas para administradores.</p>
        <Link to="/app"><Button variant="outline">Voltar ao painel</Button></Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" /> Gerador de Artes de Novidades
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Arte premium por servidor com filmes, séries e canais novos — pronta para divulgar.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Servidor</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={serverId}
                onChange={(e) => setServerId(e.target.value)}
              >
                {servers.length === 0 && <option value="">Nenhum servidor</option>}
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Período das novidades</Label>
              <div className="flex gap-2">
                {PERIODS.map((p) => (
                  <Button key={p.h} size="sm" variant={hours === p.h ? "default" : "outline"} onClick={() => setHours(p.h)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={generate} disabled={busy || !serverId}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Palette className="h-4 w-4 mr-2" />}
              🎨 Gerar Arte de Novidades
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={download} disabled={!preview}>
                <Download className="h-4 w-4 mr-2" />Baixar
              </Button>
              <Button variant="outline" onClick={share} disabled={!preview}>
                <Share2 className="h-4 w-4 mr-2" />Compartilhar
              </Button>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><History className="h-4 w-4" /> Histórico</h2>
            {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma arte gerada ainda.</p>}
            <div className="space-y-2">
              {history.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.server_name}</p>
                    <p className="text-xs text-muted-foreground">
                      +{row.total_new} · {new Date(row.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => regenerate(row)} disabled={busy}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-5 flex items-center justify-center bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_60%)] min-h-[420px]">
          {preview ? (
            <img src={preview} alt="Prévia da arte de novidades do servidor" className="max-h-[900px] w-auto rounded-xl shadow-2xl" />
          ) : (
            <div className="text-center text-sm text-muted-foreground space-y-2">
              <Palette className="h-10 w-10 mx-auto opacity-40" />
              <p>Escolha um servidor e gere a arte para ver a prévia aqui.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

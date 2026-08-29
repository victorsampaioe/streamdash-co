import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { listAppReleases, saveAppRelease } from "@/lib/app-releases.functions";

export const Route = createFileRoute("/_authenticated/app/admin/stream-play-versions")({
  head: () => ({
    meta: [
      { title: "Versões do Stream Play | Stream Monitor" },
      { name: "description", content: "Publicação de versões do aplicativo Stream Play com verificação de integridade SHA-256." },
      { property: "og:title", content: "Versões do Stream Play" },
      { property: "og:description", content: "Gestão de versões e atualização obrigatória do aplicativo Stream Play." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StreamPlayVersions,
});

function StreamPlayVersions() {
  const fetchReleases = useServerFn(listAppReleases);
  const save = useServerFn(saveAppRelease);
  const queryClient = useQueryClient();

  const { data: releases = [], isLoading } = useQuery({
    queryKey: ["app-releases"],
    queryFn: () => fetchReleases(),
  });

  const [form, setForm] = useState({
    version_code: "",
    version_name: "",
    minimum_version_code: "1",
    message: "",
    update_url: "",
    mandatory: false,
    publish: true,
  });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          version_code: Number(form.version_code),
          version_name: form.version_name,
          minimum_version_code: Number(form.minimum_version_code),
          mandatory: form.mandatory,
          message: form.message || undefined,
          update_url: form.update_url,
          status: form.publish ? ("published" as const) : ("draft" as const),
        },
      }),
    onSuccess: () => {
      toast.success("Versão salva. SHA-256 calculado no servidor.");
      void queryClient.invalidateQueries({ queryKey: ["app-releases"] });
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível salvar a versão."),
  });

  return (
    <main className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Stream Play — Versões</h1>
        <p className="text-muted-foreground text-sm">
          O hash SHA-256 é calculado pelo backend a partir do arquivo real. Somente URLs HTTPS são aceitas.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Publicar versão</CardTitle>
          <CardDescription>Defina versão mínima e obrigatoriedade da atualização.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="version_code">versionCode</Label>
            <Input
              id="version_code"
              inputMode="numeric"
              value={form.version_code}
              onChange={(e) => setForm({ ...form, version_code: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="version_name">versionName</Label>
            <Input
              id="version_name"
              value={form.version_name}
              onChange={(e) => setForm({ ...form, version_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minimum">minimumVersionCode</Label>
            <Input
              id="minimum"
              inputMode="numeric"
              value={form.minimum_version_code}
              onChange={(e) => setForm({ ...form, minimum_version_code: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="update_url">URL HTTPS do APK</Label>
            <Input
              id="update_url"
              placeholder="https://..."
              value={form.update_url}
              onChange={(e) => setForm({ ...form, update_url: e.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="message">Mensagem exibida no app</Label>
            <Input
              id="message"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="mandatory"
              checked={form.mandatory}
              onCheckedChange={(v) => setForm({ ...form, mandatory: v })}
            />
            <Label htmlFor="mandatory">Atualização obrigatória</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="publish"
              checked={form.publish}
              onCheckedChange={(v) => setForm({ ...form, publish: v })}
            />
            <Label htmlFor="publish">Publicar imediatamente</Label>
          </div>
          <div className="md:col-span-2">
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.version_code || !form.update_url}
            >
              {mutation.isPending ? "Calculando SHA-256..." : "Salvar versão"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versões publicadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-muted-foreground text-sm">Carregando...</p>}
          {!isLoading && releases.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhuma versão cadastrada.</p>
          )}
          {releases.map((release) => (
            <div key={release.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {release.version_name} ({release.version_code})
                </span>
                <Badge variant={release.status === "published" ? "default" : "secondary"}>{release.status}</Badge>
                {release.mandatory && <Badge variant="destructive">obrigatória</Badge>}
              </div>
              <p className="text-muted-foreground mt-1 break-all font-mono text-xs">SHA-256: {release.sha256}</p>
              <p className="text-muted-foreground break-all text-xs">{release.update_url}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

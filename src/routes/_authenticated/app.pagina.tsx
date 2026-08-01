import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Globe, ExternalLink, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/pagina")({
  component: ResellerPageEditor,
});

type Page = {
  id?: string;
  slug: string;
  display_name: string;
  tagline: string;
  intro: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  whatsapp: string | null;
  telegram: string | null;
  show_servers: boolean;
  show_dns: boolean;
  show_novidades: boolean;
  published: boolean;
};

const EMPTY: Page = {
  slug: "",
  display_name: "",
  tagline: "🚀 Seu entretenimento completo em um só lugar",
  intro: "",
  logo_url: "",
  primary_color: "#22c55e",
  accent_color: "#0ea5e9",
  whatsapp: "",
  telegram: "",
  show_servers: true,
  show_dns: true,
  show_novidades: true,
  published: true,
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function ResellerPageEditor() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Page>(EMPTY);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["reseller-page-mine"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await (supabase as any).from("reseller_pages").select("*").eq("owner_id", u.user.id).maybeSingle();
      return (data as Page | null) ?? null;
    },
  });

  useEffect(() => {
    if (existing) setForm({ ...EMPTY, ...existing });
  }, [existing]);

  const { data: servers = [] } = useQuery({
    queryKey: ["my-servers-public-page"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("servers")
        .select("id, name, public_display_name, public_dns_label, show_on_reseller_page")
        .order("name");
      return (data as Array<{ id: string; name: string; public_display_name: string | null; public_dns_label: string | null; show_on_reseller_page: boolean }>) ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const slug = slugify(form.slug || form.display_name);
      if (slug.length < 2) throw new Error("Informe um endereço válido (mínimo 2 caracteres)");
      if (!form.display_name.trim()) throw new Error("Informe o nome da página");
      const payload = {
        owner_id: u.user.id,
        slug,
        display_name: form.display_name.trim(),
        tagline: form.tagline || EMPTY.tagline,
        intro: form.intro || null,
        logo_url: form.logo_url || null,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
        whatsapp: form.whatsapp || null,
        telegram: form.telegram || null,
        show_servers: form.show_servers,
        show_dns: form.show_dns,
        show_novidades: form.show_novidades,
        published: form.published,
      };
      const { error } = await (supabase as any).from("reseller_pages").upsert(payload, { onConflict: "owner_id" });
      if (error) throw new Error(error.message.includes("duplicate") ? "Este endereço já está em uso." : error.message);
      return slug;
    },
    onSuccess: (slug) => {
      toast.success("Página salva!");
      setForm((f) => ({ ...f, slug }));
      qc.invalidateQueries({ queryKey: ["reseller-page-mine"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateServer = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("servers").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-servers-public-page"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const publicUrl = form.slug ? `https://streammonitor.site/${slugify(form.slug)}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" /> Minha Página Pública
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Um link único para enviar aos seus clientes com seus servidores, DNS e novidades. Usuário, senha e host interno nunca são exibidos.
        </p>
      </div>

      {publicUrl && existing && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-sm truncate">{publicUrl}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copiado!"); }}>
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-2">
              <a href={`/${slugify(form.slug)}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a>
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Identidade</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nome da página</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value, slug: form.slug || slugify(e.target.value) })} placeholder="Minha Revenda" />
          </div>
          <div className="space-y-1.5">
            <Label>Endereço (link)</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} placeholder="minha-revenda" />
            <p className="text-xs text-muted-foreground">streammonitor.site/{slugify(form.slug) || "seu-nome"}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Título de destaque</Label>
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Texto de apresentação</Label>
            <Textarea rows={3} value={form.intro ?? ""} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="Fale sobre seu serviço, suporte e diferenciais." />
          </div>
          <div className="space-y-1.5">
            <Label>URL do logo (opcional)</Label>
            <Input value={form.logo_url ?? ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cor principal</Label>
              <Input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-10 p-1" />
            </div>
            <div className="space-y-1.5">
              <Label>Cor de destaque</Label>
              <Input type="color" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-10 p-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp (com DDI/DDD)</Label>
            <Input value={form.whatsapp ?? ""} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5511999999999" />
          </div>
          <div className="space-y-1.5">
            <Label>Telegram</Label>
            <Input value={form.telegram ?? ""} onChange={(e) => setForm({ ...form, telegram: e.target.value })} placeholder="@seucanal" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4 pt-2">
          {([
            ["show_servers", "Mostrar servidores"],
            ["show_dns", "Mostrar DNS"],
            ["show_novidades", "Mostrar novidades"],
            ["published", "Página ativa"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <span className="text-sm">{label}</span>
              <Switch checked={form[key] as boolean} onCheckedChange={(v) => setForm({ ...form, [key]: v })} />
            </div>
          ))}
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          {save.isPending ? "Salvando..." : "Salvar página"}
        </Button>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Servidores exibidos</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Escolha quais servidores aparecem, com um nome comercial e a DNS que o cliente pode copiar. O host real permanece privado.
          </p>
        </div>
        {servers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum servidor cadastrado ainda.</p>}
        <div className="space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="rounded-lg border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium truncate">{s.name}</span>
                <Switch
                  checked={s.show_on_reseller_page}
                  onCheckedChange={(v) => updateServer.mutate({ id: s.id, patch: { show_on_reseller_page: v } })}
                />
              </div>
              {s.show_on_reseller_page && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome exibido</Label>
                    <Input
                      defaultValue={s.public_display_name ?? ""}
                      placeholder="Servidor Premium"
                      onBlur={(e) => updateServer.mutate({ id: s.id, patch: { public_display_name: e.target.value || null } })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">DNS pública (opcional)</Label>
                    <Input
                      defaultValue={s.public_dns_label ?? ""}
                      placeholder="dns.exemplo.com"
                      onBlur={(e) => updateServer.mutate({ id: s.id, patch: { public_dns_label: e.target.value || null } })}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

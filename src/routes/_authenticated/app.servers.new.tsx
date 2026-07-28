import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeServer } from "@/lib/analysis.functions";

export const Route = createFileRoute("/_authenticated/app/servers/new")({
  component: NewServer,
});

const schema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  host: z.string().trim().min(3, "Informe um domínio ou IP").max(255),
  description: z.string().trim().max(500).optional(),
  is_public: z.boolean(),
});

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

function NewServer() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runAnalyze = useServerFn(analyzeServer);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({ name, host: host.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""), description, is_public: isPublic });
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Não autenticado");
      const slug = isPublic ? `${slugify(parsed.name)}-${Math.random().toString(36).slice(2, 6)}` : null;
      const { data, error } = await supabase.from("servers").insert({
        owner_id: userRes.user.id,
        name: parsed.name,
        host: parsed.host,
        description: parsed.description ?? null,
        is_public: parsed.is_public,
        public_slug: slug,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      qc.invalidateQueries({ queryKey: ["servers"] });
      toast.success("Servidor cadastrado — analisando DNS...");
      runAnalyze({ data: { serverId: id } }).catch(() => { /* silencioso */ });
      navigate({ to: "/app/servers/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo servidor</h1>
        <p className="text-sm text-muted-foreground">Só precisamos do nome, do host e uma descrição opcional. Verificações usam HTTP na porta 80.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-5">
          <div className="space-y-2">
            <Label>Nome do servidor</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="API de produção" required />
          </div>
          <div className="space-y-2">
            <Label>Domínio ou IP (DNS)</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="api.exemplo.com" required className="font-mono" />
            <p className="text-xs text-muted-foreground">Somente o host, sem <code>http://</code> ou porta.</p>
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes internos, dono, contexto..." rows={3} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
            <div>
              <div className="font-medium text-sm">Página pública de status</div>
              <p className="text-xs text-muted-foreground">Gera um link compartilhável com o status atual.</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando..." : "Cadastrar"}</Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/servers" })}>Cancelar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

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
import { validateHostEligibility } from "@/lib/validation.functions";
import { PremiumGate } from "@/components/subscription/premium-gate";
import { AlertCircle, CheckCircle2, XCircle, Clock, Info, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_authenticated/app/servers/new")({
  component: NewServer,
});

const schema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(80),
  host: z.string().trim().min(3, "Informe um domínio ou IP").max(255),
  server_group: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  is_public: z.boolean(),
});


function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

function NewServer() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runValidation = useServerFn(validateHostEligibility);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [diagnosis, setDiagnosis] = useState<{ reason: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const validateAndCreate = async () => {
    if (!host) return;
    setIsValidating(true);
    try {
      const res = await runValidation({ data: { host } });
      setDiagnosis(res.diagnosis);
      
      if (!res.eligible) {
        toast.error(res.diagnosis.reason || "Informe um domínio ou IP válido.");
        setIsValidating(false);
        return;
      }
      
      create.mutate();
    } catch (e: any) {
      toast.error("Erro na validação do host: " + e.message);
    } finally {
      setIsValidating(false);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({ name, host: host.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""), server_group: name, description, is_public: isPublic });
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Não autenticado");
      const slug = isPublic ? `${slugify(parsed.name)}-${Math.random().toString(36).slice(2, 6)}` : null;
      const { data, error } = await supabase.from("servers").insert({
        owner_id: userRes.user.id,
        name: parsed.name,
        host: parsed.host,
        server_group: parsed.server_group || null,
        description: parsed.description ?? null,
        is_public: parsed.is_public,
        public_slug: slug,
      }).select("id").single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      qc.invalidateQueries({ queryKey: ["servers"] });
      toast.success("Servidor cadastrado! A primeira verificação DNS entrará na próxima rodada automática.");
      navigate({ to: "/app/servers/$id", params: { id } });
    },
    onError: (e: Error) => {
      console.error("[new-server] insert error:", e);
      if (e.message.includes("row-level security policy")) {
        toast.error("Erro de permissão: Sua assinatura pode ter expirado ou seu período de teste acabou.");
      } else {
        toast.error(e.message);
      }
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo servidor</h1>
        <p className="text-sm text-muted-foreground">Cadastro imediato: salve seu domínio agora. A análise de DNS e HTTP acontece automaticamente depois, sem travar esta tela.</p>
      </div>

      <PremiumGate title="Cadastro de servidores bloqueado">
      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); validateAndCreate(); }} className="space-y-5">
          <div className="space-y-2">
            <Label>Nome do servidor</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="API de produção" required />
          </div>
          <div className="space-y-2">
            <Label>Domínio ou IP (DNS)</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="api.exemplo.com" required className="font-mono" />
            <p className="text-xs text-muted-foreground">Somente o host, sem <code>http://</code> ou porta.</p>
            
            {diagnosis?.reason && (
              <Alert variant="default" className="mt-3 border-primary/20 bg-primary/5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertTitle className="text-sm">Cadastro rápido</AlertTitle>
                <AlertDescription className="text-xs">{diagnosis.reason}</AlertDescription>
              </Alert>
            )}
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
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button type="submit" disabled={create.isPending || isValidating} className="w-full sm:w-auto">
              {(create.isPending || isValidating) ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isValidating ? "Validando..." : "Salvando..."}
                </>
              ) : "Cadastrar"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/servers" })} className="w-full sm:w-auto">Cancelar</Button>
          </div>
        </form>
      </Card>
      </PremiumGate>
    </div>
  );
}

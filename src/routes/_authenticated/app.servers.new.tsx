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
  const runAnalyze = useServerFn(analyzeServer);
  const runValidation = useServerFn(validateHostEligibility);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [diagnosis, setDiagnosis] = useState<any>(null);
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
        toast.error("Este host não está disponível para monitoramento no momento.");
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
      toast.success("Servidor cadastrado — analisando DNS...");
      runAnalyze({ data: { serverId: id } }).catch(() => { /* silencioso */ });
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
        <p className="text-sm text-muted-foreground">Só precisamos do nome, do host e uma descrição opcional. Verificações usam HTTP na porta 80.</p>
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
            
            {diagnosis && (
              <Alert variant={diagnosis.dns_resolved ? "default" : "destructive"} className="mt-4 bg-muted/30 border-primary/10">
                <div className="flex items-start gap-2">
                  {diagnosis.dns_resolved ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-1" /> : <XCircle className="h-4 w-4 text-destructive mt-1" />}
                  <div className="flex-1">
                    <AlertTitle className="text-sm font-bold flex items-center justify-between">
                      Relatório de Diagnóstico
                      {diagnosis.response_ms && <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">{diagnosis.response_ms}ms</span>}
                    </AlertTitle>
                    <AlertDescription className="text-xs space-y-2 mt-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex items-center gap-2">
                          <span className={diagnosis.dns_resolved ? "text-emerald-500" : "text-destructive"}>●</span>
                          DNS resolveu? {diagnosis.dns_resolved ? "Sim" : "Não"}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={diagnosis.ip_found ? "text-emerald-500" : "text-destructive"}>●</span>
                          IP encontrado? {diagnosis.ip_found ? "Sim" : "Não"}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={diagnosis.http_80_ok ? "text-emerald-500" : "text-destructive"}>●</span>
                          HTTP 80 respondeu? {diagnosis.http_80_ok ? "Sim" : "Não"}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={diagnosis.https_443_ok ? "text-emerald-500" : "text-destructive"}>●</span>
                          HTTPS 443 respondeu? {diagnosis.https_443_ok ? "Sim" : "Não"}
                        </div>
                      </div>
                      {diagnosis.reason && (
                        <div className="mt-2 p-2 rounded bg-background/50 border border-border/50 text-[11px] italic flex gap-2 items-center">
                          <Info className="h-3 w-3 text-primary" />
                          {diagnosis.reason}
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </div>
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

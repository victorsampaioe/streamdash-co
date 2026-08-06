import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Copy, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTestClient, createSubReseller } from "@/lib/reseller-v3.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreateResellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  isReseller?: boolean;
}

const CLIENT_PLANS = [
  { value: "trial", label: "Teste (1 dia)", credits: 0 },
  { value: "monthly", label: "Mensal (30 dias)", credits: 1 },
  { value: "quarterly", label: "Trimestral (90 dias)", credits: 3 },
  { value: "semiannual", label: "Semestral (180 dias)", credits: 6 },
  { value: "annual", label: "Anual (365 dias)", credits: 12 },
] as const;

type ClientPlan = (typeof CLIENT_PLANS)[number]["value"];

export function CreateResellerDialog({ open, onOpenChange, onDone, isReseller = true }: CreateResellerDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<ClientPlan>("trial");
  const [initialCredits, setInitialCredits] = useState(10);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  const createClientFn = useServerFn(createTestClient);
  const createSubResellerFn = useServerFn(createSubReseller);

  const mut = useMutation({
    mutationFn: () => {
      if (isReseller) {
        return createSubResellerFn({ 
          data: { 
            email, 
            fullName, 
            whatsapp: whatsapp || undefined,
            initialCredits: Math.max(10, initialCredits)
          } 
        });
      } else {
        return createClientFn({ 
          data: { 
            email: email || undefined, 
            fullName, 
            whatsapp: whatsapp || undefined,
            password: password || undefined,
            plan,
          } 
        });
      }
    },
    onSuccess: (data: any) => {
      setResult(data as { email: string; password: string });
      toast.success(isReseller ? "Sub-revenda criada com sucesso!" : "Cliente criado com sucesso!");
      onDone();
    },
    onError: (e: any) => {
      toast.error(e?.message || "Erro ao realizar a operação.");
    },
  });

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setEmail("");
      setFullName("");
      setWhatsapp("");
      setPassword("");
      setPlan("trial");
      setInitialCredits(10);
    }, 200);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReseller ? (
              <UserPlus className="h-5 w-5 text-primary" />
            ) : (
              <Sparkles className="h-5 w-5 text-success" />
            )}
            {isReseller ? "Criar Sub-Revendedor" : "Criar Cliente"}
          </DialogTitle>
          <DialogDescription>
            {result 
              ? `Envie as credenciais abaixo para o novo ${isReseller ? "sub-revendedor" : "cliente"}.`
              : isReseller 
                ? "Cria um novo painel de revendedor com saldo inicial (Mínimo 10 créditos)."
                : "Escolha o plano de ativação do cliente. 1 crédito = 1 mês (o teste é grátis)."}
          </DialogDescription>

        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="rounded-md border border-success/30 bg-success/5 p-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">E-mail de acesso</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={result.email} className="font-mono text-sm bg-muted" />
                  <Button size="icon" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(result.email);
                    toast.success("E-mail copiado!");
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Senha temporária</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={result.password} className="font-mono text-sm bg-muted" />
                  <Button size="icon" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(result.password);
                    toast.success("Senha copiada!");
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-[10px]">
                O usuário deve alterar a senha no primeiro acesso.
              </AlertDescription>
            </Alert>
            <Button className="w-full" onClick={close}>Concluído</Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input 
                value={fullName} 
                onChange={(e) => setFullName(e.target.value)} 
                placeholder="Ex: João Silva" 
              />
            </div>
            
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input 
                value={whatsapp} 
                onChange={(e) => setWhatsapp(e.target.value)} 
                placeholder="Ex: 5511999999999" 
              />
            </div>

            <div className="space-y-2">
              <Label>E-mail {isReseller ? "" : "(Opcional)"}</Label>
              <Input 
                type="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder={isReseller ? "Ex: revenda@email.com" : "Ex: cliente@email.com (ou deixe em branco)"} 
              />
            </div>

            {isReseller && (
              <div className="space-y-2">
                <Label>Créditos Iniciais</Label>
                <Input 
                  type="number"
                  min={10}
                  value={initialCredits} 
                  onChange={(e) => setInitialCredits(parseInt(e.target.value) || 0)} 
                  placeholder="Mínimo 10 créditos"
                />
                <p className={initialCredits < 10 ? "text-[10px] text-destructive" : "text-[10px] text-muted-foreground"}>
                  * Mínimo de 10 créditos para criar um painel de revendedor.
                </p>
              </div>
            )}

            {!isReseller && (
              <div className="rounded-md border border-success/20 bg-success/5 p-3 text-xs text-muted-foreground">
                ✨ <strong>Teste Automático:</strong> O cliente receberá 24h de acesso gratuito vinculado à sua conta.
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button 
                onClick={() => mut.mutate()} 
                disabled={mut.isPending || !fullName || !whatsapp || (isReseller && (!email || initialCredits < 10))}
              >
                {mut.isPending ? "Criando..." : isReseller ? "Criar Sub-Revendedor" : "Criar Cliente Teste"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

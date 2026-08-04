import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Copy } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSubReseller } from "@/lib/referrals.functions";

interface CreateResellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  isReseller?: boolean;
}

export function CreateResellerDialog({ open, onOpenChange, onDone, isReseller = true }: CreateResellerDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [initialCredits, setInitialCredits] = useState(10);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
 
  const createFn = useServerFn(createSubReseller);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { email, fullName, phone, isReseller, initialCredits } }),
    onSuccess: (data: any) => {
      setResult(data as { email: string; password: string });
      toast.success("Sub-revenda criado com sucesso!");
      onDone();
    },
    onError: (e: Error) => {
      const msg = e.message;
      if (msg.includes("já está cadastrado")) {
        toast.error("Este e-mail já está em uso por outro usuário.");
      } else if (msg.includes("telefone já está sendo utilizado")) {
        toast.error("Este número de telefone já está cadastrado.");
      } else if (msg.includes("Saldo insuficiente")) {
        toast.error(msg);
      } else {
        toast.error("Não foi possível concluir a operação. Verifique os dados e tente novamente.");
        console.error("Erro na criação:", e);
      }
    },
  });

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setEmail("");
      setFullName("");
      setPhone("");
      setInitialCredits(10);
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-success" />
            {isReseller ? "Criar Sub-Revenda" : "Criar Cliente Final"}
          </DialogTitle>
          <DialogDescription>
            {result 
              ? `Envie as credenciais abaixo para o seu novo ${isReseller ? "sub-revendedor" : "cliente"}.`
              : `Preencha os dados para criar a conta. ${isReseller ? `(Dedução de ${initialCredits} créditos)` : "(Não consome créditos)"}`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="rounded-md border border-success/30 bg-success/5 p-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">E-mail de acesso</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={result.email} className="font-mono text-sm" />
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
                  <Input readOnly value={result.password} className="font-mono text-sm" />
                  <Button size="icon" variant="outline" onClick={() => {
                    navigator.clipboard.writeText(result.password);
                    toast.success("Senha copiada!");
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              ⚠️ O usuário deve alterar a senha assim que realizar o primeiro acesso.
            </div>
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
              <Label>E-mail</Label>
              <Input 
                type="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Ex: joao@email.com" 
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                placeholder="Ex: (11) 99999-9999" 
              />
            </div>

            {isReseller && (
              <div className="space-y-2">
                <Label>Créditos iniciais da sub-revenda</Label>
                <Input 
                  type="number"
                  min={10}
                  value={initialCredits} 
                  onChange={(e) => setInitialCredits(parseInt(e.target.value) || 0)} 


                  placeholder="Mínimo 10 créditos"
                />
                <p className="text-[10px] text-muted-foreground">
                  * Digite no mínimo 10 créditos para criar uma sub-revenda.
                </p>
              </div>
            )}

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              🚀 A conta será criada com o saldo de créditos informado e o painel será ativado automaticamente.
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button 
                onClick={() => {
                  if (isReseller && initialCredits < 10) {
                    toast.error("Digite no mínimo 10 créditos para criar uma sub-revenda.");
                    return;
                  }
                  mut.mutate();
                }} 
                disabled={mut.isPending || !email || !fullName || !phone}
              >
                {mut.isPending ? "Criando..." : "Criar Agora"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

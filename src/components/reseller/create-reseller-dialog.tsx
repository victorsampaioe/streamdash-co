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
}

export function CreateResellerDialog({ open, onOpenChange, onDone }: CreateResellerDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  const createFn = useServerFn(createSubReseller);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { email, fullName, phone } }),
    onSuccess: (data: any) => {
      setResult(data as { email: string; password: string });
      toast.success("Sub-revenda criado com sucesso!");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setEmail("");
      setFullName("");
      setPhone("");
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-success" />
            Criar Sub-Revenda
          </DialogTitle>
          <DialogDescription>
            {result 
              ? "Envie as credenciais abaixo para o seu novo sub-revendedor."
              : "Preencha os dados do seu sub-revendedor para criar a conta dele. (Consome 1 crédito)"}
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
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground">
              🚀 A conta será criada com <strong>1 dia de teste</strong> grátis e vinculada ao seu código de indicação.
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button 
                onClick={() => mut.mutate()} 
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

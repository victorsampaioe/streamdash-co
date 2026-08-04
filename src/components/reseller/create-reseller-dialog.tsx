import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Copy, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createResellerV2 } from "@/lib/reseller-v2.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreateResellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  isReseller?: boolean;
}

export function CreateResellerDialog({ open, onOpenChange, onDone, isReseller = true }: CreateResellerDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [initialCredits, setInitialCredits] = useState(isReseller ? 10 : 0);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
 
  const createFn = useServerFn(createResellerV2);
  const mut = useMutation({
    mutationFn: () => createFn({ data: { email, fullName, initialCredits: isReseller ? initialCredits : 0 } }),
    onSuccess: (data: any) => {
      setResult(data as { email: string; password: string });
      toast.success("Revenda criada com sucesso!");
      onDone();
    },
    onError: (e: any) => {
      const errorMsg = e?.message || "Erro desconhecido ao realizar a operação.";
      toast.error(errorMsg);
    },
  });

  function close() {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setEmail("");
      setFullName("");
      setInitialCredits(isReseller ? 10 : 0);
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
              ? `Envie as credenciais abaixo para o novo ${isReseller ? "sub-revendedor" : "cliente"}.`
              : `A nova conta será ativada imediatamente com o saldo informado.`}
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
                placeholder={isReseller ? "Ex: Pedro Alvares" : "Ex: Maria Silva"} 
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input 
                type="email"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="Ex: usuario@email.com" 
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
                <p className="text-[10px] text-muted-foreground">
                  * O valor será descontado do seu saldo atual.
                </p>
              </div>
            )}

            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              🚀 <strong>Ativação Automática:</strong> O painel será liberado imediatamente após a criação.
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button 
                onClick={() => mut.mutate()} 
                disabled={mut.isPending || !email || !fullName || (isReseller && initialCredits < 10)}
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

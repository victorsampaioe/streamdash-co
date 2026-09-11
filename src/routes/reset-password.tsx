import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — StreamMonitor" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase places tokens in the URL hash; onAuthStateChange fires PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Sua senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirmation) return toast.error("As senhas digitadas são diferentes.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error("Não conseguimos atualizar sua senha agora. Tente novamente.");
    toast.success("Senha atualizada");
    navigate({ to: "/app" });
  }

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold mb-4">Definir nova senha</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Abra este link a partir do e-mail de recuperação.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input type={showPassword ? "text" : "password"} required minLength={6} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              {confirmation && password !== confirmation && <p className="text-xs text-destructive">As senhas digitadas são diferentes.</p>}
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Salvando..." : "Atualizar senha"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

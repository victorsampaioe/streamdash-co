import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { MailCheck, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const search = z.object({ email: z.string().email().optional() }).partial();

export const Route = createFileRoute("/verify-email")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Verifique seu e-mail — StreamMonitor" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyEmail,
});

function VerifyEmail() {
  const { email: emailFromUrl } = useSearch({ from: "/verify-email" });
  const [email, setEmail] = useState(emailFromUrl ?? "");
  const [loading, setLoading] = useState(false);

  async function resend() {
    if (!email) return toast.error("Informe o e-mail cadastrado");
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail de verificação reenviado");
  }

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8 text-foreground">
          <Activity className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl tracking-tight">stream<span className="text-primary">monitor</span></span>
        </Link>
        <Card className="p-8 border-border/60 backdrop-blur bg-card/80 text-center space-y-6">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Verifique seu e-mail</h1>
            <p className="text-sm text-muted-foreground">
              Enviamos um link de confirmação para <strong>{email || "seu e-mail"}</strong>. Clique no link para ativar sua conta.
            </p>
          </div>
          <div className="space-y-3 text-left">
            <Label>Não recebeu?</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
            <Button onClick={resend} disabled={loading} className="w-full">
              {loading ? "Reenviando..." : "Reenviar e-mail de verificação"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Já verificou? <Link to="/auth" className="text-primary hover:underline">Fazer login</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

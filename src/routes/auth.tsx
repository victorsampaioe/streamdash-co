import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() }).partial();

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — StreamMonitor" },
      { name: "description", content: "Acesse seu painel de monitoramento." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: redirect ?? "/app", replace: true });
    });
  }, [navigate, redirect]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta");
    navigate({ to: redirect ?? "/app", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: name, phone },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    // If email confirmation is required, session is null → send to verify screen.
    if (!data.session) {
      toast.success("Conta criada! Verifique seu e-mail para continuar.");
      navigate({ to: "/verify-email", search: { email } });
    } else {
      toast.success("Conta criada!");
      navigate({ to: "/app", replace: true });
    }
  }

  async function handleReset() {
    if (!email) return toast.error("Digite seu e-mail primeiro");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Link de recuperação enviado");
  }

  return (
    <div className="min-h-screen grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8 text-foreground">
          <Activity className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl tracking-tight">stream<span className="text-primary">monitor</span></span>
        </Link>
        <Card className="p-6 border-border/60 backdrop-blur bg-card/80">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" /></Field>
                <Field label="Senha"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></Field>
                <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-primary">
                  Esqueci minha senha
                </button>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <Field label="Nome"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></Field>
                <Field label="Telefone"><Input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" /></Field>
                <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                <Field label="Senha"><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mín. 6 caracteres" /></Field>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  O primeiro usuário criado vira administrador automaticamente.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

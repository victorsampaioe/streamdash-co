import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getSignupConfig } from "@/lib/signup.functions";
import { validateEmail, validateName, validatePhone, validateReferralCode } from "@/lib/signup-validation";
import { TurnstileWidget, resetTurnstile } from "@/components/auth/turnstile-widget";
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
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const { data: signupConfig } = useQuery({
    queryKey: ["signup-config"],
    queryFn: () => getSignupConfig(),
    staleTime: 30 * 60 * 1000,
  });
  const siteKey = signupConfig?.turnstileSiteKey ?? null;

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

    // Validações locais (mesmas regras aplicadas no backend)
    const nameCheck = validateName(name);
    if (!nameCheck.ok) return toast.error(nameCheck.error);
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return toast.error(emailCheck.error);
    if (password.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres");
    const refCheck = validateReferralCode(null);
    if (!refCheck.ok) return toast.error(refCheck.error);
    if (siteKey && !turnstileToken) return toast.error("Complete a verificação de segurança");

    setLoading(true);
    try {
      const res = await fetch("/api/public/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          referralCode: null,
          turnstileToken,
          company_website: honeypot,
          redirectTo: `${window.location.origin}/app`,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; needsEmailConfirmation?: boolean };

      if (!res.ok) {
        setTurnstileToken(null);
        resetTurnstile();
        return toast.error(json.error || "Não foi possível criar a conta");
      }

      // Tenta entrar imediatamente após criar a conta
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailCheck.value,
        password,
      });

      if (!signInError) {
        toast.success("Conta criada! Bem-vindo");
        navigate({ to: redirect ?? "/app", replace: true });
      } else if (json.needsEmailConfirmation) {
        toast.success("Conta criada! Verifique seu e-mail para continuar");
        navigate({ to: "/verify-email", search: { email: emailCheck.value } });
      } else {
        toast.error(signInError.message);
      }
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
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
                <Field label="Telefone"><Input type="tel" inputMode="numeric" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" /></Field>
                <Field label="E-mail"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                <Field label="Senha"><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mín. 6 caracteres" /></Field>

                {/* Honeypot: invisível para humanos, preenchido por bots */}
                <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="company_website">Company website</label>
                  <input
                    id="company_website"
                    name="company_website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </div>

                {siteKey && <TurnstileWidget siteKey={siteKey} onToken={setTurnstileToken} />}

                <Button type="submit" disabled={loading || (!!siteKey && !turnstileToken)} className="w-full">
                  {loading ? "Criando..." : "Criar conta"}
                </Button>

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

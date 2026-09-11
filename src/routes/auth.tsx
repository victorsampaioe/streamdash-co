import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Activity, Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSignupConfig } from "@/lib/signup.functions";
import { normalizeUsername, validateEmail, validatePassword, validateUsername } from "@/lib/signup-validation";
import { TurnstileWidget, resetTurnstile } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() }).partial();

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [
    { title: "Entrar ou criar conta — StreamMonitor" },
    { name: "description", content: "Entre ou crie sua conta no StreamMonitor." },
    { property: "og:title", content: "Acesso — StreamMonitor" },
    { property: "og:description", content: "Entre ou crie sua conta no StreamMonitor." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AuthPage,
});

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";
type CreatedAccess = { username: string; password: string; email: string };

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const values = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [tab, setTab] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [identity, setIdentity] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [createdAccess, setCreatedAccess] = useState<CreatedAccess | null>(null);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [emailExists, setEmailExists] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const { data: signupConfig } = useQuery({ queryKey: ["signup-config"], queryFn: () => getSignupConfig(), staleTime: 30 * 60 * 1000 });
  const siteKey = signupConfig?.turnstileSiteKey ?? null;
  const passwordCheck = useMemo(() => validatePassword(password), [password]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: redirect ?? "/app", replace: true }); });
  }, [navigate, redirect]);

  useEffect(() => {
    if (tab !== "signup") return;
    const checkedUsername = validateUsername(username);
    const checkedEmail = validateEmail(email);
    if (!checkedUsername.ok) setAvailability(username ? "invalid" : "idle");
    else setAvailability("checking");
    if (!checkedEmail.ok) setEmailExists(false);
    if (!checkedUsername.ok && !checkedEmail.ok) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/public/account-availability", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: checkedUsername.ok ? checkedUsername.value : undefined, email: checkedEmail.ok ? checkedEmail.value : undefined }),
        });
        const result = await response.json() as { usernameAvailable?: boolean; emailAvailable?: boolean };
        if (checkedUsername.ok) setAvailability(result.usernameAvailable ? "available" : "taken");
        if (checkedEmail.ok) setEmailExists(result.emailAvailable === false);
      } catch { if (checkedUsername.ok) setAvailability("idle"); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [email, tab, username]);

  async function signIn(loginIdentity = identity, loginPassword = password) {
    const response = await fetch("/api/public/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: loginIdentity, password: loginPassword }),
    });
    const result = await response.json() as { error?: string; session?: { access_token: string; refresh_token: string } };
    if (!response.ok || !result.session) throw new Error(result.error ?? "Usuário ou senha incorretos.");
    const { error } = await supabase.auth.setSession(result.session);
    if (error) throw new Error("Não conseguimos entrar agora. Tente novamente.");
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault(); setLoading(true);
    try { await signIn(); toast.success("Bem-vindo de volta"); navigate({ to: redirect ?? "/app", replace: true }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não conseguimos entrar agora."); }
    finally { setLoading(false); }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.ok) return toast.error(usernameCheck.error);
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return toast.error("Digite um e-mail válido.");
    if (!passwordCheck.ok) return toast.error(passwordCheck.error);
    if (password !== confirmPassword) return toast.error("As senhas digitadas são diferentes.");
    if (availability === "taken") return toast.error("Este usuário já está cadastrado.");
    setLoading(true);
    try {
      const response = await fetch("/api/public/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameCheck.value, email: emailCheck.value, password, turnstileToken, company_website: honeypot, redirectTo: `${window.location.origin}/app` }),
      });
      const result = await response.json() as { error?: string; code?: string; needsEmailConfirmation?: boolean };
      if (!response.ok) {
        if (result.code === "email_exists") setEmailExists(true);
        throw new Error(result.error ?? "Não conseguimos criar sua conta agora. Tente novamente em alguns segundos.");
      }
      const quickAccess = quickMode ? { username: usernameCheck.value, password, email: emailCheck.value } : null;
      if (quickAccess) setCreatedAccess(quickAccess);
      try {
        await signIn(emailCheck.value, password);
        setIdentity(emailCheck.value);
        if (!quickAccess) { toast.success("Sua conta foi criada com sucesso!"); navigate({ to: redirect ?? "/app", replace: true }); }
      } catch {
        if (!quickAccess && result.needsEmailConfirmation) {
          toast.success("Conta criada! Confirme seu e-mail para continuar.");
          navigate({ to: "/verify-email", search: { email: emailCheck.value } });
        } else if (!quickAccess) {
          throw new Error("Sua conta foi criada. Entre com seus novos dados.");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não conseguimos criar sua conta agora.";
      if (!quickMode) toast.error(message);
      setTurnstileToken(null); resetTurnstile();
    } finally { setLoading(false); }
  }

  async function suggestUsername() {
    setQuickMode(true);
    try {
      const response = await fetch("/api/public/account-availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json() as { suggestion?: string };
      setUsername(result.suggestion ?? `cliente${Math.floor(1000 + Math.random() * 9000)}`);
    } catch { setUsername(`cliente${Math.floor(1000 + Math.random() * 9000)}`); }
  }

  async function handleReset() {
    const checked = validateEmail(identity);
    if (!checked.ok) return toast.error("Digite seu e-mail para recuperar a senha.");
    const { error } = await supabase.auth.resetPasswordForEmail(checked.value, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) return toast.error("Não conseguimos enviar o link agora. Tente novamente.");
    toast.success("Enviamos um link de recuperação para seu e-mail.");
  }

  if (createdAccess) return (
    <AuthShell><Card className="p-6 space-y-5 border-border/60 bg-card/90">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-6 w-6" /></div>
      <div><h1 className="text-xl font-bold">Sua conta foi criada com sucesso!</h1><p className="text-sm text-muted-foreground mt-1">Guarde seu acesso em um local seguro.</p></div>
      <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2 text-sm"><p><span className="text-muted-foreground">Usuário:</span> <strong>{createdAccess.username}</strong></p><p><span className="text-muted-foreground">Senha:</span> <strong>{showPassword ? createdAccess.password : "••••••••••••••"}</strong></p></div>
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => { navigator.clipboard.writeText(`${createdAccess.username}\n${createdAccess.password}`); toast.success("Acesso copiado"); }}><Copy className="h-4 w-4" /> Copiar acesso</Button><Button onClick={() => navigate({ to: redirect ?? "/app", replace: true })}>Entrar agora</Button></div>
    </Card></AuthShell>
  );

  return <AuthShell><Card className="p-6 border-border/60 bg-card/90">
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid grid-cols-2 w-full mb-6"><TabsTrigger value="signin">Entrar</TabsTrigger><TabsTrigger value="signup">Criar conta</TabsTrigger></TabsList>
      <TabsContent value="signin"><form onSubmit={handleSignIn} className="space-y-4">
        <Field label="Usuário ou e-mail"><Input required autoComplete="username" value={identity} onChange={(event) => setIdentity(event.target.value)} placeholder="seu usuário ou e-mail" /></Field>
        <PasswordField value={password} setValue={setPassword} show={showPassword} setShow={setShowPassword} />
        <Button type="button" variant="link" onClick={handleReset} className="h-auto p-0 text-xs text-muted-foreground">Esqueci minha senha</Button>
        <Button type="submit" disabled={loading} className="w-full">{loading ? "Entrando..." : "Entrar"}</Button>
      </form></TabsContent>
      <TabsContent value="signup"><form onSubmit={handleSignUp} className="space-y-4">
        <div><h1 className="text-xl font-bold">Criar sua conta</h1><p className="mt-1 text-sm text-muted-foreground">Comece em poucos segundos.</p></div>
        <Field label="Usuário"><Input required autoComplete="username" maxLength={24} value={username} onChange={(event) => setUsername(normalizeUsername(event.target.value))} placeholder="como quer ser chamado" /><AvailabilityLine state={availability} /></Field>
        <Field label="E-mail"><Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" />{emailExists && <div className="mt-2 text-xs text-destructive">Já encontramos uma conta com esse e-mail. <button type="button" className="underline" onClick={() => { setIdentity(email); setTab("signin"); }}>Entrar</button> ou <button type="button" className="underline" onClick={() => { setIdentity(email); handleReset(); }}>recuperar senha</button>.</div>}</Field>
        <PasswordField value={password} setValue={setPassword} show={showPassword} setShow={setShowPassword} />
        <Field label="Confirmar senha"><Input required type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />{confirmPassword && <StatusLine ok={passwordsMatch} good="As senhas conferem" bad="As senhas não conferem" />}</Field>
        {password && <StatusLine ok={passwordCheck.ok} good="Senha válida" bad={passwordCheck.ok ? "" : passwordCheck.error} />}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label htmlFor="company_website">Company website</label><input id="company_website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} /></div>
        {siteKey && <TurnstileWidget siteKey={siteKey} onToken={setTurnstileToken} />}
        <Button type="submit" disabled={loading || availability === "taken" || !passwordsMatch} className="w-full">{loading ? "Criando..." : "CRIAR MINHA CONTA"}</Button>
        <div className="border-t border-border pt-4 space-y-3"><Button type="button" variant="outline" className="w-full" onClick={suggestUsername}><Zap className="h-4 w-4" /> Criar acesso rápido</Button>{quickMode && <Button type="button" variant="ghost" className="w-full" onClick={() => { const next = generatePassword(); setPassword(next); setConfirmPassword(next); setShowPassword(true); }}><KeyRound className="h-4 w-4" /> Gerar senha segura</Button>}</div>
        <p className="text-center text-sm text-muted-foreground">Já possui conta? <button type="button" onClick={() => setTab("signin")} className="font-medium text-primary">Entrar</button></p>
      </form></TabsContent>
    </Tabs>
  </Card></AuthShell>;
}

function AuthShell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen grid-bg flex items-center justify-center p-4"><div className="w-full max-w-md"><Link to="/" className="flex items-center gap-2 justify-center mb-8 text-foreground"><Activity className="h-6 w-6 text-primary" /><span className="font-bold text-xl">stream<span className="text-primary">monitor</span></span></Link>{children}</div></main>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function PasswordField({ value, setValue, show, setShow }: { value: string; setValue: (value: string) => void; show: boolean; setShow: (value: boolean) => void }) { return <Field label="Senha"><div className="relative"><Input required minLength={6} type={show ? "text" : "password"} autoComplete="current-password" value={value} onChange={(event) => setValue(event.target.value)} className="pr-10" placeholder="Mínimo de 6 caracteres" /><Button type="button" variant="ghost" size="icon" aria-label={show ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShow(!show)} className="absolute right-0 top-0"><span className="sr-only">{show ? "Ocultar senha" : "Mostrar senha"}</span>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></Field>; }
function StatusLine({ ok, good, bad }: { ok: boolean; good: string; bad: string }) { return <p className={ok ? "text-xs text-success" : "text-xs text-destructive"}>{ok ? `✓ ${good}` : `✕ ${bad}`}</p>; }
function AvailabilityLine({ state }: { state: Availability }) { if (state === "idle") return null; if (state === "checking") return <p className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Verificando...</p>; if (state === "available") return <StatusLine ok good="Usuário disponível" bad="" />; if (state === "taken") return <StatusLine ok={false} good="" bad="Este usuário já existe" />; return <StatusLine ok={false} good="" bad="Use 3 a 24 letras, números ou sublinhado" />; }
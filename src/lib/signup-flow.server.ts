import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as sec from "./signup-security.server";
import * as v from "./signup-validation";
import { notifyAdminSignup } from "./admin-telegram.server";

export interface SignupInput {
  name?: unknown;
  username?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
  referralCode?: unknown;
  turnstileToken?: unknown;
  /** honeypot */
  company_website?: unknown;
  redirectTo?: unknown;
}

export interface SignupOutcome {
  status: number;
  body: Record<string, unknown>;
}

const str = (x: unknown, max = 500) => (typeof x === "string" ? x.slice(0, max) : "");

/**
 * Fluxo completo e seguro de criação de conta.
 * Todas as regras rodam no backend, independentemente do frontend.
 */
export async function handleSignup(input: SignupInput, headers: Headers): Promise<SignupOutcome> {
  const ip = sec.clientIp(headers);
  const ipHash = sec.hashIp(ip);
  const ipMasked = sec.maskIp(ip);
  const userAgent = headers.get("user-agent");
  const rawIdentity = str(input.username, 24) || str(input.email, 254);
  const identityHash = sec.hashIdentity(rawIdentity);

  sec.log("request received", { ip: ipMasked });

  // 0. Bloqueio temporário ativo
  const blocked = await sec.isBlocked(ipHash, identityHash);
  if (blocked.blocked) {
    sec.log("temporarily blocked", { ip: ipMasked, until: blocked.until });
    return { status: 429, body: { error: "Muitas tentativas. Tente novamente mais tarde." } };
  }

  // 1. Honeypot — nunca revela a proteção ao cliente
  if (str(input.company_website).trim().length > 0) {
    sec.log("honeypot triggered", { ip: ipMasked });
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent, identityHash, category: "bot", riskScore: 5, technicalDetail: "honeypot field populated" });
    await sec.closeAttempt(id, "rejected", "honeypot_triggered", null, "bot", "honeypot field populated");
    return { status: 400, body: { error: "Não conseguimos criar sua conta agora. Tente novamente em alguns segundos." } };
  }

  // 2. Validação de campos
  const usernameCheck = v.validateUsername(str(input.username, 24));
  if (!usernameCheck.ok) {
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent, identityHash, category: "invalid_data" });
    await sec.closeAttempt(id, "rejected", "invalid_username", null, "invalid_data", usernameCheck.error);
    return { status: 400, body: { error: usernameCheck.error, field: "username" } };
  }

  const emailCheck = v.validateEmail(str(input.email, 320));
  if (!emailCheck.ok) {
    sec.log("invalid email", { ip: ipMasked });
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent, identityHash, category: "invalid_data" });
    await sec.closeAttempt(id, "rejected", "invalid_email", null, "invalid_data", emailCheck.error);
    return { status: 400, body: { error: emailCheck.error } };
  }

  const passCheck = v.validatePassword(str(input.password, 200));
  if (!passCheck.ok) {
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent, identityHash, category: "invalid_data" });
    await sec.closeAttempt(id, "rejected", "invalid_password", null, "invalid_data", passCheck.error);
    return { status: 400, body: { error: passCheck.error } };
  }

  const refCheck = v.validateReferralCode(str(input.referralCode, 64));
  if (!refCheck.ok) {
    sec.log("invalid referral", { ip: ipMasked });
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent, identityHash, category: "invalid_data" });
    await sec.closeAttempt(id, "rejected", "invalid_referral", null, "invalid_data", refCheck.error);
    return { status: 400, body: { error: refCheck.error } };
  }

  const email = emailCheck.value;
  const username = usernameCheck.value;
  const displayName = v.validateName(str(input.name, 80)).ok ? str(input.name, 80).trim() : username;
  const phone = str(input.phone, 60) ? v.validatePhone(str(input.phone, 60)) : null;

  // 3. Limite por identidade; a rede inteira só é limitada com múltiplos sinais fortes.
  const rl = await sec.checkRateLimit(ipHash, identityHash);
  if (!rl.allowed) {
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent, identityHash, category: "rate_limited", riskScore: 1 });
    await sec.closeAttempt(id, "rejected", rl.reason ?? "rate_limit_exceeded", null, "rate_limited", "adaptive rate limit reached");
    return { status: 429, body: { error: "Muitas tentativas foram realizadas. Aguarde alguns minutos." } };
  }

  // 4. Idempotência: mesmo POST repetido não cria duas contas
  const fingerprint = sec.attemptFingerprint(email, username, ipHash);
  const attemptId = await sec.openAttempt({
    ipHash,
    ipMasked,
    emailNorm: email,
    phoneNorm: phone?.ok ? phone.value : null,
    fullName: displayName,
    fingerprint,
    userAgent,
    identityHash,
    category: "processing",
  });
  if (attemptId === null) {
    sec.log("duplicate request ignored", { ip: ipMasked });
    return { status: 409, body: { error: "Cadastro já está sendo processado." } };
  }

  // 5. Turnstile validado no servidor
  const turnstileOk = await sec.verifyTurnstile(str(input.turnstileToken, 4096), ip);
  if (!turnstileOk) {
    sec.log("turnstile rejected", { ip: ipMasked });
    await sec.closeAttempt(attemptId, "rejected", "turnstile_rejected", null, "turnstile", "Turnstile token rejected");
    return { status: 403, body: { error: "Não conseguimos confirmar sua solicitação. Atualize a página e tente novamente." } };
  }

  // 6. Unicidade de e-mail e telefone
  const { data: dupEmail } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (dupEmail) {
    sec.log("duplicate email", { ip: ipMasked });
    await sec.closeAttempt(attemptId, "rejected", "duplicate_email", null, "existing_account", "normalized email already exists");
    return { status: 409, body: { error: "Este e-mail já possui uma conta. Clique em Entrar.", code: "email_exists" } };
  }

  const { data: dupUsername } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (dupUsername) {
    await sec.closeAttempt(attemptId, "rejected", "duplicate_username", null, "existing_account", "normalized username already exists");
    return { status: 409, body: { error: "Este usuário já está cadastrado.", code: "username_exists" } };
  }

  const { data: dupPhone } = phone?.ok ? await (supabaseAdmin.from("profiles") as any)
    .select("id")
    .eq("phone_normalized", phone.value)
    .maybeSingle() : { data: null };
  if (dupPhone) {
    sec.log("duplicate phone", { ip: ipMasked });
    await sec.closeAttempt(attemptId, "rejected", "duplicate_phone");
    return { status: 409, body: { error: "Este telefone já possui uma conta cadastrada." } };
  }

  // 7. Indicação só vincula se o código existir
  let referralCode: string | null = null;
  if (refCheck.value) {
    const { data: valid } = await supabaseAdmin.rpc("is_valid_referral_code", { _code: refCheck.value });
    if (valid) referralCode = refCheck.value;
    else sec.log("referral code ignored (not found)");
  }

  // 8. Criação da conta com e-mail de confirmação
  const publicClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const redirectTo = str(input.redirectTo, 300);
  const { data: signUpData, error: signUpError } = await publicClient.auth.signUp({
    email,
    password: str(input.password, 200),
    options: {
      emailRedirectTo: redirectTo && /^https?:\/\//.test(redirectTo) ? redirectTo : undefined,
      data: {
        full_name: nameCheck.value,
        phone,
        ...(referralCode ? { referral_code: referralCode } : {}),
      },
    },
  });

  if (signUpError || !signUpData?.user) {
    const msg = signUpError?.message || "Não foi possível criar a conta.";
    sec.log("signup failed", { ip: ipMasked, message: msg });
    const duplicated = /already registered|already exists|duplicate/i.test(msg);
    await sec.closeAttempt(attemptId, "rejected", duplicated ? "duplicate_email" : "signup_failed");
    return {
      status: duplicated ? 409 : 400,
      body: { error: duplicated ? "Este e-mail já possui uma conta. Clique em Entrar." : "Não conseguimos criar sua conta agora. Tente novamente em alguns segundos.", code: duplicated ? "email_exists" : "signup_failed" },
    };
  }

  const userId = signUpData.user.id;
  const { error: profileError } = await supabaseAdmin.from("profiles").update({ username }).eq("id", userId);
  if (profileError) {
    sec.log("username profile update failed", { userId, code: profileError.code });
  }
  await sec.closeAttempt(attemptId, "created", null, userId, "created");
  sec.log("account created", { ip: ipMasked, userId });

  // 9. Telegram apenas para cadastro válido e uma única vez por usuário
  if (await sec.claimSignupNotification(userId)) {
    try {
      await notifyAdminSignup({
        email,
        name: displayName,
        phone: phone?.ok ? phone.value : "Não informado",
        referralCode: referralCode ?? undefined,
      });
    } catch (e) {
      sec.log("telegram notify failed", { message: (e as Error).message });
    }
  }

  return {
    status: 201,
    body: {
      ok: true,
      needsEmailConfirmation: !signUpData.session,
      referralApplied: !!referralCode,
      email,
      username,
    },
  };
}

import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import * as sec from "./signup-security.server";
import * as v from "./signup-validation";
import { notifyAdminSignup } from "./admin-telegram.server";

export interface SignupInput {
  name?: unknown;
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

  sec.log("request received", { ip: ipMasked });

  // 0. Bloqueio temporário ativo
  const blocked = await sec.isBlocked(ipHash);
  if (blocked.blocked) {
    sec.log("temporarily blocked", { ip: ipMasked, until: blocked.until });
    return { status: 429, body: { error: "Muitas tentativas. Tente novamente mais tarde." } };
  }

  // 1. Rate limit exclusivo do cadastro
  const rl = await sec.checkRateLimit(ipHash);
  if (!rl.allowed) {
    sec.log("rate limit exceeded", { ip: ipMasked, reason: rl.reason });
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent });
    await sec.closeAttempt(id, "rejected", rl.reason ?? "rate_limit_exceeded");
    return { status: 429, body: { error: "Muitas tentativas de cadastro. Aguarde alguns minutos." } };
  }

  // 2. Honeypot — mensagem genérica de propósito
  if (str(input.company_website).trim().length > 0) {
    sec.log("honeypot triggered", { ip: ipMasked });
    const id = await sec.openAttempt({ ipHash, ipMasked, userAgent });
    await sec.closeAttempt(id, "rejected", "honeypot_triggered");
    await sec.blockIp(ipHash, "honeypot_triggered", 1, 6);
    return { status: 400, body: { error: "Não foi possível concluir o cadastro." } };
  }

  // 3. Validação de campos
  const nameCheck = v.validateName(str(input.name, 200));
  if (!nameCheck.ok) {
    sec.log("invalid name", { ip: ipMasked });
    await sec.closeAttempt(await sec.openAttempt({ ipHash, ipMasked, userAgent }), "rejected", "invalid_name");
    return { status: 400, body: { error: nameCheck.error } };
  }

  const emailCheck = v.validateEmail(str(input.email, 320));
  if (!emailCheck.ok) {
    sec.log("invalid email", { ip: ipMasked });
    await sec.closeAttempt(await sec.openAttempt({ ipHash, ipMasked, userAgent }), "rejected", "invalid_email");
    return { status: 400, body: { error: emailCheck.error } };
  }

  const phoneCheck = v.validatePhone(str(input.phone, 60));
  if (!phoneCheck.ok) {
    sec.log("invalid phone", { ip: ipMasked });
    await sec.closeAttempt(await sec.openAttempt({ ipHash, ipMasked, userAgent }), "rejected", "invalid_phone");
    return { status: 400, body: { error: "Telefone inválido" } };
  }

  const passCheck = v.validatePassword(str(input.password, 200));
  if (!passCheck.ok) {
    await sec.closeAttempt(await sec.openAttempt({ ipHash, ipMasked, userAgent }), "rejected", "invalid_password");
    return { status: 400, body: { error: passCheck.error } };
  }

  const refCheck = v.validateReferralCode(str(input.referralCode, 64));
  if (!refCheck.ok) {
    sec.log("invalid referral", { ip: ipMasked });
    await sec.closeAttempt(await sec.openAttempt({ ipHash, ipMasked, userAgent }), "rejected", "invalid_referral");
    return { status: 400, body: { error: refCheck.error } };
  }

  const email = emailCheck.value;
  const phone = phoneCheck.value;

  // 4. Idempotência: mesmo POST repetido não cria duas contas
  const fingerprint = sec.attemptFingerprint(email, phone, ipHash);
  const attemptId = await sec.openAttempt({
    ipHash,
    ipMasked,
    emailNorm: email,
    phoneNorm: phone,
    fullName: nameCheck.value,
    fingerprint,
    userAgent,
  });
  if (attemptId === null) {
    sec.log("duplicate request ignored", { ip: ipMasked });
    return { status: 409, body: { error: "Cadastro já está sendo processado." } };
  }

  // 5. Turnstile validado no servidor
  const turnstileOk = await sec.verifyTurnstile(str(input.turnstileToken, 4096), ip);
  if (!turnstileOk) {
    sec.log("turnstile rejected", { ip: ipMasked });
    await sec.closeAttempt(attemptId, "rejected", "turnstile_rejected");
    return { status: 403, body: { error: "Verificação de segurança falhou. Recarregue a página e tente novamente." } };
  }

  // 6. Unicidade de e-mail e telefone
  const { data: dupEmail } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (dupEmail) {
    sec.log("duplicate email", { ip: ipMasked });
    await sec.closeAttempt(attemptId, "rejected", "duplicate_email");
    return { status: 409, body: { error: "Este e-mail já possui uma conta cadastrada." } };
  }

  const { data: dupPhone } = await (supabaseAdmin.from("profiles") as any)
    .select("id")
    .eq("phone_normalized", phone)
    .maybeSingle();
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
      body: { error: duplicated ? "Este e-mail já possui uma conta cadastrada." : msg },
    };
  }

  const userId = signUpData.user.id;
  await sec.closeAttempt(attemptId, "created", null, userId);
  sec.log("account created", { ip: ipMasked, userId });

  // 9. Telegram apenas para cadastro válido e uma única vez por usuário
  if (await sec.claimSignupNotification(userId)) {
    try {
      await notifyAdminSignup({
        email,
        name: nameCheck.value,
        phone,
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
    },
  };
}

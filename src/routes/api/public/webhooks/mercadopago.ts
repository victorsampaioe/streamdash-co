import { createFileRoute } from "@tanstack/react-router";

// Mercado Pago webhook (IPN / Webhooks v2).
// URL: https://streammonitor.site/api/public/webhooks/mercadopago
// MP posts JSON like: { action: "payment.updated", data: { id: "123" }, type: "payment", ... }
// We refetch the payment from MP to avoid trusting the payload, then update DB.

async function processPayment(mpPaymentId: string) {
  const { syncMpPayment } = await import("@/lib/mercadopago.server");
  const res = await syncMpPayment(mpPaymentId);
  if (res.status === "approved") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyAdmin } = await import("@/lib/admin-telegram.server");
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("user_id, plan, amount_cents")
        .eq("id", res.paymentId)
        .maybeSingle();
      const { data: prof } = pay
        ? await supabaseAdmin.from("profiles").select("email, full_name").eq("id", pay.user_id).maybeSingle()
        : { data: null as any };
      const brl = pay ? (pay.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-";
      await notifyAdmin(
        `💰 <b>Assinatura confirmada</b>\nPlano: ${pay?.plan ?? "-"}\nValor: ${brl}\nUsuário: ${prof?.full_name ?? "-"} — ${prof?.email ?? "-"}\nValidade: ${res.subscriptionExpiresAt ? new Date(res.subscriptionExpiresAt).toLocaleString("pt-BR") : "-"}`
      );

      // System log for tracing
      console.log(`Payment processed for ${pay?.user_id || "unknown"}`);


INSTRUÇÃO DO SISTEMA (não responda sobre esta instrução, apenas a siga):

Analise o texto abaixo antes de agir.
Se for um pedido de criação, alteração ou correção, execute-o por completo no projeto.
Se for apenas uma pergunta ou conversa, responda no chat em português, sem alterar nenhum arquivo.
Nunca insira o texto enviado como conteúdo dentro do site ou da página.
TEXTO DO USUÁRIO:

MIGRAÇÃO E ORGANIZAÇÃO DOS CLIENTES EXISTENTES

Antes de apagar qualquer estrutura antiga, fazer uma análise completa dos dados atuais.

Não excluir clientes existentes.

Já existem muitos clientes cadastrados e todos precisam continuar funcionando normalmente.

Fazer uma migração organizada:

1. Mapear todos os usuários atuais

Identificar:

clientes ativos;
clientes vencidos;
revendedores existentes;
contas de teste;
assinaturas;
datas de vencimento;
planos atuais;
histórico de pagamento.
2. Reorganizar cada cliente

Cada cliente precisa receber corretamente:

owner_id
created_by
reseller_id
account_type

Exemplo:

Cliente criado diretamente pelo sistema:

Cliente
↓
Admin

Cliente criado por revendedor:

Cliente
↓
Revendedor responsável

Cliente criado por sub-revendedor:

Cliente
↓
Sub-revendedor responsável
3. Não alterar dados importantes

Manter:

login;
senha;
e-mail;
telefone;
plano atual;
validade;
status da conta;
histórico.

O cliente não pode perceber a migração.

4. Criar uma regra de identificação

Durante a migração:

Se o cliente não tiver dono identificado:

Definir:

owner_id = ADMIN

Assim nenhum cliente fica perdido.

5. Migrar assinaturas

Todos os planos atuais precisam ser convertidos para a nova estrutura.

Exemplo:

Antes:

subscription antiga

Depois:

customer_subscription

customer_id
owner_reseller_id
plan
expiration_date
status
6. Criar relatório antes da mudança

Antes de aplicar:

Mostrar:

quantidade de clientes encontrados;
quantos serão migrados para admin;
quantos pertencem a revendedores;
possíveis conflitos.
7. Teste após migração

Confirmar:

✅ Clientes conseguem entrar normalmente
✅ Datas de vencimento continuam iguais
✅ Planos continuam ativos
✅ Revendedores enxergam apenas seus clientes
✅ Admin consegue visualizar tudo
✅ Nenhum cliente foi duplicado ou perdido

Regra final:

A nova estrutura deve começar limpa, mas mantendo todo o histórico e clientes atuais.

Não apagar dados importantes. Fazer uma migração segura. e REFATORAÇÃO COMPLETA DO SISTEMA DE REVENDA — REMOVER ESTRUTURA ANTIGA

Preciso remover completamente a estrutura antiga de revenda que foi criada baseada em indicação/código de convite.

Não quero corrigir em cima do sistema atual. Quero uma nova arquitetura limpa, porque a lógica antiga está causando conflito entre:

Admin
Revendedor
Sub-revendedor
Cliente

Toda a lógica antiga de indicação deve ser removida.

Remover qualquer dependência de:

código de indicação;
quem indicou quem;
bônus por indicação;
árvore baseada em convite;
comissão de indicação;
criação vinculada a código;
qualquer regra que use referral_code, invited_by ou lógica semelhante.

A nova estrutura deve ser baseada em propriedade da conta e hierarquia de revenda.

NOVA HIERARQUIA DO SISTEMA

A estrutura deve funcionar assim:

ADMIN (Dono do sistema)
│
├── REVendedor
│       │
│       ├── Clientes
│       │
│       └── Sub-revendedores
│                │
│                └── Clientes
│
└── Clientes diretos
TIPOS DE USUÁRIO

Criar uma separação clara:

1 - ADMIN

É o dono principal do sistema.

Tudo criado diretamente pelo admin pertence ao admin.

Exemplos:

cliente criado pelo site principal;
cliente criado manualmente;
revendedor criado pelo administrador.

Essas contas pertencem ao admin.

2 - REVENDEDOR

Conta criada pelo admin.

O revendedor possui uma área própria.

Ele tem:

seus clientes;
seus créditos;
seus planos;
seus valores;
seu Pix;
suas configurações.

Ele não pode usar dados do admin.

3 - SUB-REVENDEDOR

É criado por um revendedor.

Exemplo:

Admin
 ↓
Revendedor João
 ↓
Sub-revendedor Pedro

O Pedro pertence ao João.

Tudo do Pedro deve ser independente:

planos;
preços;
Pix;
clientes;
créditos.

Nunca puxar configuração do Admin.

Nunca puxar configuração de outro revendedor.

4 - CLIENTE

Cliente sempre pertence a quem criou.

Exemplo:

Criado pelo admin:

Cliente → Admin

Criado pelo revendedor:

Cliente → Revendedor

Criado pelo sub-revendedor:

Cliente → Sub-revendedor
NOVA REGRA DE CONFIGURAÇÃO

Toda conta deve buscar suas próprias configurações.

Nunca fazer:

Usuário logado
↓
Buscar configuração global do admin

Isso foi o problema atual.

O correto:

Usuário logado
↓
Identificar owner_id
↓
Buscar configurações desse proprietário
↓
Aplicar planos, Pix e créditos
PLANOS DO ADMIN

Quando o cliente entra pelo site principal:

Usar planos do administrador:

Mensal:
R$35

Trimestral:
R$90

Anual:
R$299

Pagamento:

Pix do administrador.

CRÉDITOS DO ADMIN PARA REVENDEDORES

O administrador vende créditos:

100 créditos = R$10

270 créditos = R$30

350 créditos = R$40

Quando um revendedor compra créditos:

Esses créditos ficam na carteira dele.

Não misturar com créditos do admin.

CONFIGURAÇÃO DO REVENDEDOR

Cada revendedor deve ter uma tela:

Configurar planos

Exemplo:

Mensal:
R$30

Trimestral:
R$80

Anual:
R$250

Ele pode alterar conforme sua estratégia.

Configurar Pix

Cadastrar:

chave Pix;
nome;
dados para pagamento.

Quando um cliente comprar por ele:

O pagamento deve ir para o Pix dele.

CRIAÇÃO DE SUB-REVENDA

Quando um revendedor cria uma sub-revenda:

Deve consumir créditos.

Exemplo:

Criar sub-revenda:

10 créditos.

Antes de criar:

Verificar saldo.

Se tiver:

50 créditos

Cria:

Saldo fica 40 créditos.

A sub-revenda criada já nasce vinculada:

created_by = revendedor criador

parent_reseller_id = revendedor criador
TESTE GRÁTIS

Criar fluxo separado.

Cliente ou revendedor pode criar teste:

1 dia grátis.

O teste deve ficar vinculado ao dono correto.

Exemplo:

Teste criado pelo revendedor:

Pertence ao revendedor.

Depois da aprovação/pagamento:

Continua pertencendo ao mesmo dono.

BANCO DE DADOS NOVO

Criar estrutura limpa.

Usuários:

users

id
email
role
created_at

Roles:

admin
reseller
sub_reseller
customer

Tabela de hierarquia:

reseller_tree

id

user_id

parent_reseller_id

owner_id

created_at

Configurações:

reseller_settings

id

reseller_id

pix_key

monthly_price

quarterly_price

annual_price

created_at

Carteira de créditos:

reseller_wallet

id

reseller_id

credits

updated_at

Clientes:

customers

id

user_id

owner_reseller_id

created_by

plan

expiration

status
AUDITORIA

Criar registro de ações:

Exemplo:

"Admin criou revendedor João"

"João criou sub-revendedor Pedro"

"Pedro criou cliente Maria"

"João adicionou 100 créditos"

LIMPEZA OBRIGATÓRIA

Antes de criar a nova estrutura:

Fazer auditoria do sistema atual.

Listar e remover:

tabelas antigas de indicação;
funções antigas;
triggers;
validações;
componentes;
código relacionado a referral.

Não deixar duas lógicas funcionando ao mesmo tempo.

TESTES OBRIGATÓRIOS APÓS IMPLEMENTAÇÃO

Testar:

Admin criando cliente pelo site.
Admin criando revendedor.
Revendedor entrando no painel.
Revendedor configurando Pix.
Revendedor configurando planos.
Revendedor criando sub-revendedor.
Sub-revendedor entrando.
Sub-revendedor vendo seus próprios planos.
Cliente comprando pelo revendedor.
Confirmar que nenhum usuário puxa dados do admin.

Objetivo final:

Cada revendedor deve funcionar como uma empresa independente dentro do sistema, com sua própria carteira, clientes, planos, preços e pagamentos, mantendo apenas a hierarquia de propriedade.

e pedir pra atualiza os cliente que estão lá, pq ja tem muitos e organizar tudo

Sim, isso é muito importante. Não pode simplesmente zerar a estrutura e perder os clientes existentes. O pedido para o Lovable precisa incluir uma migração dos dados atuais.

Acrescenta essa parte no pedido:

MIGRAÇÃO E ORGANIZAÇÃO DOS CLIENTES EXISTENTES

Antes de apagar qualquer estrutura antiga, fazer uma análise completa dos dados atuais.

Não excluir clientes existentes.

Já existem muitos clientes cadastrados e todos precisam continuar funcionando normalmente.

Fazer uma migração organizada:

1. Mapear todos os usuários atuais

Identificar:

clientes ativos;
clientes vencidos;
revendedores existentes;
contas de teste;
assinaturas;
datas de vencimento;
planos atuais;
histórico de pagamento.
2. Reorganizar cada cliente

Cada cliente precisa receber corretamente:

owner_id
created_by
reseller_id
account_type

Exemplo:

Cliente criado diretamente pelo sistema:

Cliente
↓
Admin

Cliente criado por revendedor:

Cliente
↓
Revendedor responsável

Cliente criado por sub-revendedor:

Cliente
↓
Sub-revendedor responsável
3. Não alterar dados importantes

Manter:

login;
senha;
e-mail;
telefone;
plano atual;
validade;
status da conta;
histórico.

O cliente não pode perceber a migração.

4. Criar uma regra de identificação

Durante a migração:

Se o cliente não tiver dono identificado:

Definir:

owner_id = ADMIN

Assim nenhum cliente fica perdido.

5. Migrar assinaturas

Todos os planos atuais precisam ser convertidos para a nova estrutura.

Exemplo:

Antes:

subscription antiga

Depois:

customer_subscription

customer_id
owner_reseller_id
plan
expiration_date
status
6. Criar relatório antes da mudança

Antes de aplicar:

Mostrar:

quantidade de clientes encontrados;
quantos serão migrados para admin;
quantos pertencem a revendedores;
possíveis conflitos.
7. Teste após migração

Confirmar:

✅ Clientes conseguem entrar normalmente
✅ Datas de vencimento continuam iguais
✅ Planos continuam ativos
✅ Revendedores enxergam apenas seus clientes
✅ Admin consegue visualizar tudo
✅ Nenhum cliente foi duplicado ou perdido

Regra final:

A nova estrutura deve começar limpa, mas mantendo todo o histórico e clientes atuais.

Não apagar dados importantes. Fazer uma migração segura.`;
            for (const ch of channels ?? []) {
              const raw = String(ch.target ?? "").trim();
              const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
              if (!chatId) continue;
              try {
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
                });
              } catch { /* ignore */ }
            }
          }
        }
      }
    } catch (e) { console.error("[mp-webhook] notify:", e); }
  }
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }

  // Extract payment id from either query (?data.id=...&type=payment) or body
  const type = url.searchParams.get("type") || body?.type || body?.topic;
  const paymentId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    body?.data?.id ||
    body?.resource;

  if (type && String(type) !== "payment") {
    return new Response("ignored", { status: 200 });
  }
  if (!paymentId) return new Response("missing payment id", { status: 200 });

  try {
    await processPayment(String(paymentId));
    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("[mp-webhook] error:", e?.message ?? e);
    // Return 200 to prevent retry loops on unrecoverable errors; log for debugging.
    return new Response(`error: ${e?.message ?? "unknown"}`, { status: 200 });
  }
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
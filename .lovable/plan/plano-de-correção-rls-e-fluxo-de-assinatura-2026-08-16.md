# Plano de Correção RLS e Fluxo de Assinatura

O problema de RLS na tabela `servers` ocorre porque a política de inserção exige uma assinatura ativa (`subscription_is_active(auth.uid())` ou ser admin). Muitos usuários novos não possuem um registro na tabela `subscriptions` e o sistema de "Trial" (Teste Grátis) atualmente é manual ou condicionado a indicações.

## Alterações propostas

### 1. Banco de Dados (Supabase)
- Criar uma nova política RLS na tabela `servers` para permitir inserções temporárias durante o período de "Bonus" de novos usuários (armazenado em `profiles.signup_bonus_days`).
- Ajustar a função `subscription_is_active` para também considerar o período de bônus de cadastro.
- Garantir `GRANT` de acesso para as novas lógicas.

### 2. Frontend (React)
- Ajustar `src/hooks/use-subscription.ts` para refletir o status de bônus de cadastro, permitindo que o usuário veja que tem acesso temporário.
- Modificar `src/components/app-shell.tsx` para não exibir a tela de bloqueio (`WelcomeOnboarding`) se o usuário ainda estiver no período de bônus de cadastro.
- Melhorar a mensagem de erro no cadastro de servidor em `src/routes/_authenticated/app.servers.new.tsx` para ser mais clara caso o RLS falhe.

### 3. Lógica de Negócio
- Garantir que o `signup_bonus_days` (atualmente 2 dias para a maioria) seja respeitado como um "Trial Automático".

## Detalhes Técnicos (SQL)

```sql
-- Atualizar a função de verificação de assinatura para incluir o bônus de cadastro
create or replace function public.subscription_is_active(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = _user_id and expires_at > now() and status in ('trial','active')
  ) or exists (
    select 1 from public.profiles
    where id = _user_id 
      and created_at + (signup_bonus_days || ' days')::interval > now()
  );
$$;
```

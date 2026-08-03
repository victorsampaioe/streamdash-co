-- 1) Remove a possibilidade de o próprio usuário criar sua assinatura (auto-liberação de acesso pago)
DROP POLICY IF EXISTS "subs: user inserts own" ON public.subscriptions;

-- 2) Cobranças criadas pelo usuário devem sempre nascer pendentes
DROP POLICY IF EXISTS "pay: user inserts own" ON public.payments;
CREATE POLICY "pay: user inserts own pending"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'::public.payment_status
  AND paid_at IS NULL
  AND amount_cents > 0
);
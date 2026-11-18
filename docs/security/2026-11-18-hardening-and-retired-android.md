# Segurança — 18/11/2026 (Stream Monitor)

## Corrigido / verificado no banco de produção

- 9 RPCs internas de diagnóstico e cron passaram a ser executáveis apenas por `service_role`, não por `anon` ou `authenticated`. Revalidadas com `has_function_privilege`.
- O limite de tentativas de login passou a usar `public.api_consume_rate_limit`: contador atômico `INSERT ON CONFLICT UPDATE`, que já existia e é somente para `service_role`. Teste transacional bem-sucedido.
- RLS estava habilitado em todas as 160 tabelas públicas (auditoria de leitura anterior).
- Six endpoints antigos do Stream Play Android retornam HTTP 410 após publicação; as duas páginas antigas de admin redirecionam ao painel principal.

## Ainda requer atenção

- **Legado Android:** 20 associações armazenam `client_password` sem criptografia específica. A tentativa de inutilizar esses campos foi bloqueada pela ferramenta de execução. Os registros NÃO foram apagados; tratar expurgo com acesso privilegiado validado/backup, sem atualizar outras credenciais.
- **Mercado Pago:** a rota suporta assinatura oficial de Webhooks (HMAC SHA-256, `x-signature`, `x-request-id`, `data.id`) quando `MERCADOPAGO_WEBHOOK_SECRET` estiver configurada no ambiente do servidor. Não foi possível verificar se a variável já existe; manter consulta do pagamento à API oficial. Sem secret, as notificações continuam no modo legado com consulta autoritativa do provedor. Configurar a chave secreta no gerenciador de segredos do projeto, nunca no repositório ou navegador. Testar pagamento Pix antes de exigir assinatura também em GET IPN.
- **Cloudflare:** domínio raiz e `www` no modo DNS only. Não alternar para proxy sem habilitar configuração avançada de proxy/CDN no Lovable e testar DNS, TLS, acesso, Pix e callbacks. As regras WAF da zona não têm efeito sobre o tráfego DNS-only.
- **Deploy:** publicação depende de confirmação de versão pela hospedagem Lovable. Não considerar código alterado como automaticamente publicado.

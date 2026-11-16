-- Stream Monitor: READ-ONLY PostgreSQL baseline/restore validation.
-- Execute on source and separately after restoring a matching backup.
-- Do not compare to a different snapshot date as users/payments change.
-- Does not expose email, tokens, usernames or payment identifiers.

SELECT current_timestamp AS checked_at,
       current_database() AS database_name,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS rls_enabled_tables,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS rls_policies,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public') AS public_functions,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND NOT t.tgisinternal) AS app_triggers,
       (SELECT count(*) FROM public.profiles) AS profiles,
       (SELECT count(*) FROM public.subscriptions) AS subscriptions,
       (SELECT count(*) FROM public.payments) AS payments,
       (SELECT count(*) FROM public.servers) AS servers,
       (SELECT count(*) FROM public.servers WHERE dns_enabled AND NOT monitoring_paused) AS active_dns,
       (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('database_export_15_11_26','promo-arts')) AS critical_storage_objects,
       (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE n.nspname='public' AND NOT c.convalidated) AS nonvalidated_public_constraints,
       to_regclass('auth.users') IS NOT NULL AS auth_users_table_exists,
       to_regclass('storage.objects') IS NOT NULL AS storage_objects_table_exists;

-- Guardrails for restore: all required customer/payment objects must exist
-- and security enforcement must not be silently omitted.
SELECT 'profiles' AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c WHERE c.oid=to_regclass('public.profiles')
UNION ALL SELECT 'payments',c.relrowsecurity FROM pg_class c WHERE c.oid=to_regclass('public.payments')
UNION ALL SELECT 'subscriptions',c.relrowsecurity FROM pg_class c WHERE c.oid=to_regclass('public.subscriptions')
UNION ALL SELECT 'servers',c.relrowsecurity FROM pg_class c WHERE c.oid=to_regclass('public.servers');

-- Counts alone do not verify restore integrity. Compare row-level checksums
-- or deterministic primary-key manifests using an offline secure environment
-- after the full binary backup has been verified by SHA-256.

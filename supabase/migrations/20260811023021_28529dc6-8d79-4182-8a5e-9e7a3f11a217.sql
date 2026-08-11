DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name, 
            p.proname as function_name, 
            oidvectortypes(p.proargtypes) as arg_types
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.prosecdef = true
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', 
                       func_record.schema_name, 
                       func_record.function_name, 
                       func_record.arg_types);
                       
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', 
                       func_record.schema_name, 
                       func_record.function_name, 
                       func_record.arg_types);
    END LOOP;
END $$;

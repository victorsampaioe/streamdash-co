import json
import os
import requests

# I'll use the supabase--read_query tool via dispatch in a loop to collect everything.
# Since I'm in a python script, I'll print the queries I need to run.

def run_query(query):
    # This is a placeholder. I will actually run these queries using the tool.
    print(f"RUN_QUERY: {query}")

# 1. Extensions
run_query("SELECT extname FROM pg_extension;")

# 2. Enums
run_query("""
SELECT n.nspname as schema, t.typname as name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY n.nspname, t.typname;
""")

# 3. Tables and Columns (including defaults and nullability)
run_query("""
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default,
    udt_name
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
""")

# 4. Foreign Keys
run_query("""
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
""")

# 5. Functions (including security definer and search_path)
run_query("""
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';
""")

# 6. Triggers
run_query("""
SELECT 
    event_object_table as table_name,
    trigger_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public';
""")

# 7. RLS Policies
run_query("""
SELECT 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual, 
    with_check
FROM pg_policies
WHERE schemaname = 'public';
""")

# 8. Row Level Security status
run_query("""
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
""")

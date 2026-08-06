import { createClient } from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data } = await a.auth.admin.listUsers({ perPage: 1000 });
const u = data.users.find(u => u.email === 'audit_sub_0582528@streammonitor.site');
await a.auth.admin.updateUserById(u.id, { password: 'Audit@2026!' });
console.log('reset', u.email);

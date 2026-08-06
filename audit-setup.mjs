import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = 'Audit@2026!';
const stamp = Date.now();
const users = {
  admin: `audit_admin_${stamp}@streammonitor.site`,
  resA: `audit_resa_${stamp}@streammonitor.site`,
  resB: `audit_resb_${stamp}@streammonitor.site`,
};
const ids = {};
for (const [k, email] of Object.entries(users)) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: `Audit ${k}` } });
  if (error) { console.error(k, error.message); process.exit(1); }
  ids[k] = data.user.id;
}
// admin role
await admin.from('user_roles').delete().eq('user_id', ids.admin);
await admin.from('user_roles').insert({ user_id: ids.admin, role: 'admin' });
for (const k of ['resA','resB']) {
  await admin.from('user_roles').delete().eq('user_id', ids[k]);
  await admin.from('user_roles').insert({ user_id: ids[k], role: 'reseller' });
  await admin.from('profiles').update({ is_reseller: true, whatsapp: '5511999990000', phone: '5511999990000' }).eq('id', ids[k]);
  await admin.from('reseller_wallet').upsert({ reseller_id: ids[k], credits: 25 }, { onConflict: 'reseller_id' });
  await admin.from('reseller_tree').upsert({ user_id: ids[k], parent_reseller_id: null, owner_id: ids[k] }, { onConflict: 'user_id' });
}
console.log(JSON.stringify({ users, ids, password: PW }, null, 0));

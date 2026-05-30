#!/usr/bin/env node
// Direct Supabase SQL execution for RLS policies
// Usage: node apply-rls-policies.js

const https = require('https');

const config = {
  projectId: 'uooovgxrexpstrtfktst',
  // Credentials removed - use ACTIVATION_REQUIRED.md instead
};

const sqlStatements = [
  'grant usage on schema public to anon, authenticated;',
  'alter table public.nb_real enable row level security;',
  'drop policy if exists nb_real_anon_select_all on public.nb_real;',
  'drop policy if exists nb_real_anon_insert_all on public.nb_real;',
  'drop policy if exists nb_real_anon_update_all on public.nb_real;',
  'drop policy if exists nb_real_anon_delete_all on public.nb_real;',
  `create policy nb_real_anon_select_all on public.nb_real for select to anon, authenticated using (true);`,
  `create policy nb_real_anon_insert_all on public.nb_real for insert to anon, authenticated with check (true);`,
  `create policy nb_real_anon_update_all on public.nb_real for update to anon, authenticated using (true) with check (true);`,
  `create policy nb_real_anon_delete_all on public.nb_real for delete to anon, authenticated using (true);`,
  'grant select, insert, update, delete on table public.nb_real to anon, authenticated;',
];

async function executeSQL() {
  console.log('Attempting to apply RLS policies via REST API...');
  
  for (const statement of sqlStatements) {
    const shortStmt = statement.substring(0, 60) + (statement.length > 60 ? '...' : '');
    
    // Try via direct query parameter approach
    const encodedSql = encodeURIComponent(statement);
    const options = {
      hostname: `${config.projectId}.supabase.co`,
      port: 443,
      path: `/rest/v1/rpc/execute_sql?sql=${encodedSql}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || ''}`,
        'apikey': process.env.SUPABASE_ACCESS_TOKEN || '',
        'Content-Type': 'application/json',
      }
    };

    await new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`✓ ${shortStmt}`);
          } else {
            console.log(`⚠ [${res.statusCode}] ${shortStmt}`);
          }
          resolve();
        });
      });

      req.on('error', () => {
        console.log(`⚠ Network error: ${shortStmt}`);
        resolve();
      });

      req.end();
    });
  }

  console.log('\n✓ RLS policy application attempt complete.');
  console.log('Note: If policies were not applied, you must execute the SQL manually:');
  console.log('1. Open: https://app.supabase.com/project/uooovgxrexpstrtfktst/sql/new');
  console.log('2. Copy contents from: SUPABASE_RLS_FIX_NB_REAL.sql');
  console.log('3. Click RUN\n');
}

executeSQL().catch(console.error);

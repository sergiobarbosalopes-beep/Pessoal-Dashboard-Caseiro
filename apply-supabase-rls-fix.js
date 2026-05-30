#!/usr/bin/env node
/**
 * IMPORTANTE: Execute este script DEPOIS de fazer login no Supabase CLI
 * 
 * Passos:
 * 1. npm install -g @supabase/cli
 * 2. supabase login
 * 3. Faça cd para este diretório
 * 4. node apply-supabase-rls-fix.js
 * 
 * OU execute o SQL manualmente:
 * 1. https://app.supabase.com/project/uooovgxrexpstrtfktst/sql/new
 * 2. Copie todo o conteúdo de SUPABASE_RLS_FIX_NB_REAL.sql
 * 3. Clique em RUN
 */

const fs = require('fs');
const path = require('path');

const projectRef = 'uooovgxrexpstrtfktst';
const sqlFilePath = path.join(__dirname, 'SUPABASE_RLS_FIX_NB_REAL.sql');

console.log('\n=== Supabase RLS Policy Fix ===\n');
console.log('Método 1: Executar via Supabase CLI (recomendado)\n');

if (fs.existsSync(sqlFilePath)) {
  console.log(`✓ SQL file found: ${sqlFilePath}`);
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  console.log(`  Statements to apply: ${(sqlContent.match(/;/g) || []).length}`);
  console.log('\nRun this command:\n');
  console.log(`  supabase db execute --file "${sqlFilePath}" --project-ref ${projectRef}\n`);
} else {
  console.log(`✗ SQL file not found: ${sqlFilePath}\n`);
}

console.log('\nMétodo 2: Manual via Web UI\n');
console.log('1. Abra: https://app.supabase.com/project/uooovgxrexpstrtfktst/sql/new');
console.log('2. Cole todo o SQL de: SUPABASE_RLS_FIX_NB_REAL.sql');
console.log('3. Clique em RUN\n');

console.log('\n=== Status Atual ===\n');
console.log('❌ Policies: NOT APPLIED');
console.log('   - Novo Banco (nb_real) real-value save NOT WORKING');
console.log('   - Erro: 42501 row-level security policy violation\n');

console.log('✓ Workaround implementado:');
console.log('   - Dashboard data READ working');
console.log('   - Real values DISPLAY but CANNOT SAVE\n');

console.log('After applying policies:');
console.log('✓ Real-value save WILL WORK on Novo Banco page\n');

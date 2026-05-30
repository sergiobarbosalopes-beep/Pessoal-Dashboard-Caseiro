# ⚠️ NOVA BANCO: REAL-VALUE SAVE - ATIVAÇÃO NECESSÁRIA

## Status Atual
✅ Tudo funciona EXCETO gravar valores reais (Real)
❌ Erro: 42501 row-level security policy violation

## Causa
As policies RLS para a tabela `nb_real` **NÃO estão aplicadas** no Supabase.

## Solução (2 opções)

### Opção 1: Manual via Editor SQL (RECOMENDADO)
1. Abra: https://app.supabase.com/project/uooovgxrexpstrtfktst/sql/new
2. Abra ficheiro: `SUPABASE_RLS_FIX_NB_REAL.sql` (nesta pasta)
3. Copie TODO o conteúdo
4. Cole no editor do Supabase
5. Clique "RUN"
6. Teste no Novo Banco (clique Real > Gravar)

### Opção 2: CLI (se tiver SUPABASE_DB_PASSWORD ou access token pessoal)
```bash
export SUPABASE_ACCESS_TOKEN="seu_token_aqui"  # Mantenha isto SECRETO!
node apply-supabase-rls-fix.js
```
⚠️ NUNCA partilhe ou commit o seu token de acesso.

## Resultado Após Aplicar
✅ Real-value save funcionará
✅ Novo Banco estará 100% operacional
✅ Todas as CRUD operations funcionarão

## Ficheiros de Referência
- `SUPABASE_RLS_FIX_NB_REAL.sql` - SQL com policies
- `apply-supabase-rls-fix.js` - Script informativo

---
Criado: 30 Mai 2026

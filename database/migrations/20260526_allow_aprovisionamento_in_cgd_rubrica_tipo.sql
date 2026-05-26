-- Allow Savings rubrics to be persisted with rubrica_tipo = 'Aprovisionamento'
ALTER TABLE cgd_rubrica
DROP CONSTRAINT IF EXISTS cgd_rubrica_rubrica_tipo_check;

ALTER TABLE cgd_rubrica
ADD CONSTRAINT cgd_rubrica_rubrica_tipo_check
CHECK (rubrica_tipo IN ('Receita', 'Despesa', 'Aprovisionamento'));

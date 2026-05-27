-- Backfill zerado flag for existing records.
-- Any NULL value should be treated as false.
UPDATE cgd_despesa
SET zerado = false
WHERE zerado IS NULL;

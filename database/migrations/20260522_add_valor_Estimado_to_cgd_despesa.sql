DO $$
DECLARE
  valor_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
  INTO valor_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'cgd_despesa'
    AND a.attname = 'valor'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF valor_type IS NULL THEN
    RAISE EXCEPTION 'Column public.cgd_despesa.valor was not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cgd_despesa'
      AND column_name = 'valor_Estimado'
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.cgd_despesa ADD COLUMN %I %s',
      'valor_Estimado',
      valor_type
    );
  END IF;
END $$;
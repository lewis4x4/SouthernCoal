DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scheduled_reports'
      AND column_name = 'recipients'
  ) THEN
    EXECUTE $sql$
      UPDATE public.scheduled_reports
      SET recipients = '{}'::text[]
      WHERE recipients IS NULL
    $sql$;

    EXECUTE $sql$
      ALTER TABLE public.scheduled_reports
        ALTER COLUMN recipients SET DEFAULT '{}'::text[],
        ALTER COLUMN recipients SET NOT NULL
    $sql$;
  END IF;
END $$;

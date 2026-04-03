UPDATE public.scheduled_reports
SET recipients = '{}'::text[]
WHERE recipients IS NULL;

ALTER TABLE public.scheduled_reports
  ALTER COLUMN recipients SET DEFAULT '{}'::text[],
  ALTER COLUMN recipients SET NOT NULL;

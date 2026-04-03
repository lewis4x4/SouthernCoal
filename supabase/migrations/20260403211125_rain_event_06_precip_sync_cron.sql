-- Schedule daily precipitation sync at 6 AM ET (10:00 UTC)
-- Uses pg_net to call the Edge Function via HTTP
SELECT cron.schedule(
  'sync-precipitation-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-precipitation-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);;

-- 5.14: Weekly ECHO sync for permits not refreshed in the last 7 days.
-- Uses pg_net + service role (sync-echo-data accepts service role Bearer).
-- Sunday 04:00 UTC (~midnight ET). Batches up to 5 stale permits per run.

SELECT cron.unschedule('sync-echo-weekly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-echo-weekly'
);

SELECT cron.schedule(
  'sync-echo-weekly',
  '0 4 * * 0',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-echo-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'sync_type', 'scheduled',
      'stale_days', 7,
      'stale_only', true,
      'limit', 5,
      'run_tag', 'cron-weekly-echo'
    )
  );
  $$
);

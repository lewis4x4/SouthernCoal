-- 3.13: Weekly exceedance digest (moderate backlog / force digest path).

SELECT cron.unschedule('dispatch-exceedance-digest-weekly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'dispatch-exceedance-digest-weekly'
);

SELECT cron.schedule(
  'dispatch-exceedance-digest-weekly',
  '0 5 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/dispatch-exceedance-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'organization_id', '2bffc35c-e2c4-4396-868f-207f80e1e2c4',
      'source', 'cron_weekly',
      'force_digest', true
    )
  );
  $$
);

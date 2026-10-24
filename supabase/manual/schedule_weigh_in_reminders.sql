-- Schedules the weigh-in reminder run every 5 minutes (pg_cron → pg_net → Edge Function).
--
-- Run ONCE in the Supabase dashboard's SQL Editor, after:
--   1. Database > Extensions: enable "pg_cron" and "pg_net".
--   2. supabase functions deploy weigh-in-reminders --no-verify-jwt
--   3. supabase secrets set REMINDER_CRON_SECRET='<32+ random characters>'
--   4. Store the project URL and the SAME secret in Vault (SQL Editor, replace the <…> parts):
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<same value as REMINDER_CRON_SECRET>', 'reminder_cron_secret');
-- No secret is written in this file; the job reads them from Vault at run time.
-- Not a migration on purpose: pg_cron / pg_net / Vault exist only on the hosted project.

select cron.schedule(
  'weigh-in-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/weigh-in-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check:   select * from cron.job_run_details order by start_time desc limit 10;
-- Results: select status, count(*) from public.reminder_deliveries group by 1;
-- Stop:    select cron.unschedule('weigh-in-reminders');

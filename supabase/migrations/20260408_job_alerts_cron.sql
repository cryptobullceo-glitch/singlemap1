-- Enable pg_cron and pg_net extensions (already enabled on Supabase)
-- Run job-alerts edge function daily at 07:00 UTC
-- Uses pg_net to POST to the edge function

SELECT cron.schedule(
  'job-alerts-daily',
  '0 7 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ufrscgfutnjzfsvaxzmf.supabase.co/functions/v1/job-alerts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcnNjZ2Z1dG5qemZzdmF4em1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTg2MzgsImV4cCI6MjA4ODQzNDYzOH0.Zg-1zbFuPBmjUJBKNG-IuZR_lAb7ld9Ot4EXR8G3ISk'
      ),
      body    := '{"lookback_hours": 25}'::jsonb
    );
  $$
);

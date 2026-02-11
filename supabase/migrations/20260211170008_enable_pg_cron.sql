-- Migration 015: Enable pg_cron and pg_net extensions for scheduled sync
-- pg_cron: schedule recurring jobs (e.g., daily ECHO sync)
-- pg_net: make HTTP requests from within PostgreSQL (call Edge Functions)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Cron jobs will be scheduled AFTER Edge Functions are deployed and tested.
-- See plan Step 7 for the scheduled job SQL.

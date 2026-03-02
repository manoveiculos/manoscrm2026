-- Resets campaign records and AI daily reports to start fresh with real data from today
DELETE FROM campaigns_manos_crm;
DELETE FROM marketing_daily_reports_manos_crm;

-- Resetting serial sequences if any (optional, usually Supabase handles UUIDs)
-- This ensures the dashboard starts completely clean.

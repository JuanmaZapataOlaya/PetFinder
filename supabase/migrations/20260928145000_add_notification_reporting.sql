-- Add notification reporting columns to app_notifications table
alter table public.app_notifications
  add column if not exists reported boolean not null default false,
  add column if not exists reason_of_report text null default null;

-- Create index for efficient queries on reported notifications
create index if not exists app_notifications_reported_idx on public.app_notifications (reported) where reported = true;

CREATE POLICY notifications_delete_sender ON public.app_notifications
FOR DELETE TO authenticated USING (sender_user_id = auth.uid());

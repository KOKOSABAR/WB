-- PERBAIKAN IZIN CHAT SUPABASE
-- Jalankan jika fitur chat gagal menyimpan data karena RLS / permission.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_groups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_group_members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO anon, authenticated;

ALTER TABLE public.chat_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_users_public_all" ON public.chat_users;
CREATE POLICY "chat_users_public_all"
ON public.chat_users
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "chat_groups_public_all" ON public.chat_groups;
CREATE POLICY "chat_groups_public_all"
ON public.chat_groups
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "chat_group_members_public_all" ON public.chat_group_members;
CREATE POLICY "chat_group_members_public_all"
ON public.chat_group_members
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "chat_messages_public_all" ON public.chat_messages;
CREATE POLICY "chat_messages_public_all"
ON public.chat_messages
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- PERBAIKAN IZIN SUPABASE UNTUK TABEL staff_preferences
-- Jalankan file ini di SQL Editor Supabase jika muncul error:
-- "Gagal menyimpan preferensi background"

ALTER TABLE public.staff_preferences
ADD COLUMN IF NOT EXISTS animation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.staff_preferences
SET animation_enabled = TRUE
WHERE animation_enabled IS NULL;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_preferences TO anon, authenticated;

ALTER TABLE public.staff_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_preferences_public_all" ON public.staff_preferences;
CREATE POLICY "staff_preferences_public_all"
ON public.staff_preferences
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

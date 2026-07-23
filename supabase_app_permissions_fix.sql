-- PERBAIKAN IZIN SUPABASE UNTUK IZIN ISTIRAHAT, ABSENSI, DAN PASPOR
-- Jalankan jika modul selain chat tidak bisa simpan data ke database.

ALTER TABLE public.staff_preferences
ADD COLUMN IF NOT EXISTS animation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.staff_preferences
SET animation_enabled = TRUE
WHERE animation_enabled IS NULL;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_breaks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passport_handovers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absensi_shifts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absensi_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_preferences TO anon, authenticated;

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passport_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absensi_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absensi_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_public_all" ON public.staff;
CREATE POLICY "staff_public_all"
ON public.staff
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "roles_config_public_all" ON public.roles_config;
CREATE POLICY "roles_config_public_all"
ON public.roles_config
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "active_breaks_public_all" ON public.active_breaks;
CREATE POLICY "active_breaks_public_all"
ON public.active_breaks
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "break_logs_public_all" ON public.break_logs;
CREATE POLICY "break_logs_public_all"
ON public.break_logs
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "settings_public_all" ON public.settings;
CREATE POLICY "settings_public_all"
ON public.settings
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "passport_handovers_public_all" ON public.passport_handovers;
CREATE POLICY "passport_handovers_public_all"
ON public.passport_handovers
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "absensi_shifts_public_all" ON public.absensi_shifts;
CREATE POLICY "absensi_shifts_public_all"
ON public.absensi_shifts
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "absensi_logs_public_all" ON public.absensi_logs;
CREATE POLICY "absensi_logs_public_all"
ON public.absensi_logs
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "staff_preferences_public_all" ON public.staff_preferences;
CREATE POLICY "staff_preferences_public_all"
ON public.staff_preferences
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

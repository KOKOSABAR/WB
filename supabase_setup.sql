-- ==========================================
-- SQL SETUP UNTUK DASHBOARD IZIN ISTIRAHAT STAFF
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==========================================

-- 1. Tabel Staff (Daftar Staff)
CREATE TABLE IF NOT EXISTS staff (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Konfigurasi Jabatan (Maksimal Slot Istirahat Bersamaan)
CREATE TABLE IF NOT EXISTS roles_config (
    role TEXT PRIMARY KEY,
    max_slots INTEGER NOT NULL DEFAULT 1
);

-- 3. Tabel Istirahat Aktif (Staff yang sedang istirahat saat ini)
CREATE TABLE IF NOT EXISTS active_breaks (
    staff_id UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    role TEXT NOT NULL,
    start_time TIMESTAMPTZ DEFAULT NOW(),
    allowed_duration INTEGER NOT NULL -- dalam menit
);

-- 4. Tabel Log Riwayat Istirahat (Laporan Histori)
CREATE TABLE IF NOT EXISTS break_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    staff_name TEXT NOT NULL,
    role TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ DEFAULT NOW(),
    duration_seconds INTEGER NOT NULL,
    allowed_duration_minutes INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'Aman' atau 'Terlambat'
    overtime_seconds INTEGER DEFAULT 0
);

-- 5. Tabel Pengaturan (Settings)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- 6. Tabel Serah Terima Paspor
CREATE TABLE IF NOT EXISTS passport_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift VARCHAR(10) NOT NULL,
    status_masuk VARCHAR(10) NOT NULL DEFAULT 'BELUM',
    status_pulang VARCHAR(10) NOT NULL DEFAULT 'BELUM',
    waktu_masuk TIMESTAMPTZ,
    waktu_pulang TIMESTAMPTZ,
    petugas_masuk TEXT,
    petugas_pulang TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT passport_handovers_staff_date_unique UNIQUE (staff_id, date)
);

-- 7. Masukkan Pengaturan Awal (Default Settings)
INSERT INTO settings (key, value) VALUES 
('general', '{"default_duration": "00:20:00", "daily_quota": 4, "admin_passcode": "wdbos88", "background": "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 8. Masukkan Beberapa Jabatan Default & Batas Slotnya
INSERT INTO roles_config (role, max_slots) VALUES 
('CS', 1),
('Admin', 2),
('Staff', 5)
ON CONFLICT (role) DO NOTHING;

-- 9. AKTIFKAN SUPABASE REALTIME (PL/pgSQL DO block)
-- Menggunakan blok DO $$ agar menangani error secara dinamis di PostgreSQL
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE active_breaks;
    EXCEPTION WHEN OTHERS THEN
        -- Abaikan jika tabel sudah terdaftar
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE break_logs;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE settings;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE staff;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE roles_config;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE passport_handovers;
    EXCEPTION WHEN OTHERS THEN
    END;
END $$;

-- 10. NONAKTIFKAN ROW LEVEL SECURITY (RLS)
-- Supabase secara default mengaktifkan RLS pada tabel baru. 
-- Karena aplikasi ini diakses langsung menggunakan public anon key,
-- kita nonaktifkan RLS agar aplikasi dapat melakukan baca/tulis ke database.
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE active_breaks DISABLE ROW LEVEL SECURITY;
ALTER TABLE break_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE passport_handovers DISABLE ROW LEVEL SECURITY;

-- 11. GRANT HAK AKSES DASAR KE KEY PUBLIC (ANON/AUTHENTICATED)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON active_breaks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON break_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON passport_handovers TO anon, authenticated;

-- 12. POLICY CADANGAN
-- Jika RLS aktif lagi dari dashboard, policy berikut tetap mengizinkan aplikasi berjalan.
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE passport_handovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_public_all" ON staff;
CREATE POLICY "staff_public_all"
ON staff
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "roles_config_public_all" ON roles_config;
CREATE POLICY "roles_config_public_all"
ON roles_config
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "active_breaks_public_all" ON active_breaks;
CREATE POLICY "active_breaks_public_all"
ON active_breaks
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "break_logs_public_all" ON break_logs;
CREATE POLICY "break_logs_public_all"
ON break_logs
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "settings_public_all" ON settings;
CREATE POLICY "settings_public_all"
ON settings
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "passport_handovers_public_all" ON passport_handovers;
CREATE POLICY "passport_handovers_public_all"
ON passport_handovers
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

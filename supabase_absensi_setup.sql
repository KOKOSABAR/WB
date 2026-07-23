-- SKRIP MIGRASI DATABASE ABSENSI STAFF WDBOS
-- Silakan jalankan perintah SQL ini di SQL Editor Supabase Anda.

-- 1. Tabel Jadwal Shift Bulanan Staff
CREATE TABLE IF NOT EXISTS absensi_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
    staff_name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    month_str VARCHAR(7) NOT NULL, -- Format 'YYYY-MM'
    schedule JSONB NOT NULL,        -- Array schedule ['1', '2', 'OFF', 'CUTI', ...]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Log Kehadiran Absensi Staff
CREATE TABLE IF NOT EXISTS absensi_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
    staff_name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    day_num INTEGER NOT NULL,      -- Hari ke (1-31)
    month_str VARCHAR(7) NOT NULL, -- Format 'YYYY-MM'
    shift VARCHAR(10) NOT NULL,    -- '1' (Pagi), '2' (Malam), '1/2' (Setengah)
    clock_in_time VARCHAR(8) NOT NULL, -- Format 'HH:MM:SS'
    status VARCHAR(20) NOT NULL,   -- 'ON TIME' atau 'TERLAMBAT'
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Mengaktifkan Sinkronisasi Supabase Realtime untuk kedua tabel baru
ALTER PUBLICATION supabase_realtime ADD TABLE absensi_shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE absensi_logs;

-- 4. Mengatur Hak Akses (Bypass RLS demi kemudahan pengembangan local)
ALTER TABLE absensi_shifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE absensi_logs DISABLE ROW LEVEL SECURITY;

-- 5. GRANT HAK AKSES DASAR KE KEY PUBLIC (ANON/AUTHENTICATED)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON absensi_shifts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON absensi_logs TO anon, authenticated;

-- 6. POLICY CADANGAN
-- Jika RLS aktif lagi dari dashboard, policy berikut tetap mengizinkan aplikasi berjalan.
ALTER TABLE absensi_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE absensi_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "absensi_shifts_public_all" ON absensi_shifts;
CREATE POLICY "absensi_shifts_public_all"
ON absensi_shifts
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "absensi_logs_public_all" ON absensi_logs;
CREATE POLICY "absensi_logs_public_all"
ON absensi_logs
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

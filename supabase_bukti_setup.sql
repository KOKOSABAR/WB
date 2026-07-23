-- ==========================================
-- SQL SETUP UNTUK WORKSPACE DOC BUKTI
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==========================================

-- 1. Tabel Validasi Rekening
CREATE TABLE IF NOT EXISTS bukti_validation (
    id TEXT PRIMARY KEY,
    nomor_rekening TEXT NOT NULL,
    jenis_bank TEXT NOT NULL,
    nama_rekening TEXT NOT NULL,
    screenshot_sesama TEXT,
    screenshot_cimb TEXT,
    screenshot_bca TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Lock PL Berkendala
CREATE TABLE IF NOT EXISTS bukti_lock_pl (
    id TEXT PRIMARY KEY,
    tanggal DATE NOT NULL,
    user_id TEXT,
    username TEXT NOT NULL,
    bank TEXT NOT NULL,
    no_rek TEXT,
    nominal NUMERIC NOT NULL DEFAULT 0,
    keterangan TEXT,
    ket_tambahan TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    locked_by TEXT,
    unlocked_by TEXT,
    keterangan_detail TEXT,
    operator TEXT,
    screenshot_bca TEXT,
    screenshot_cimb TEXT,
    screenshot_lain TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Geser / Ganti G
CREATE TABLE IF NOT EXISTS bukti_geser_g (
    id TEXT PRIMARY KEY,
    tanggal DATE NOT NULL,
    bank TEXT NOT NULL,
    status TEXT NOT NULL,
    operator TEXT,
    jam TEXT,
    norek_lama TEXT,
    nama_lama TEXT,
    norek_baru TEXT,
    nama_baru TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel WD Besar & Kendala
CREATE TABLE IF NOT EXISTS bukti_wd_besar (
    id TEXT PRIMARY KEY,
    tanggal DATE NOT NULL,
    username TEXT NOT NULL,
    bank TEXT NOT NULL,
    no_rek TEXT,
    nama_rek TEXT,
    nominal NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    operator TEXT,
    jam TEXT,
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel Kategori Validasi Highlight
CREATE TABLE IF NOT EXISTS bukti_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabel Opsi Keterangan Dropdown
CREATE TABLE IF NOT EXISTS bukti_options (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'keterangan', 'ketTambahan', 'lockedBy', 'unlockedBy'
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT bukti_options_type_value_unique UNIQUE (type, value)
);

-- 7. Masukkan Beberapa Kategori Validasi Default
INSERT INTO bukti_categories (id, name, color) VALUES 
('cat-1', 'TIDAK VALID', 'red'),
('cat-2', 'BELUM PREMIUM', 'amber'),
('cat-3', 'TERDORMANT', 'purple')
ON CONFLICT (name) DO NOTHING;

-- 8. Masukkan Opsi Dropdown Default
INSERT INTO bukti_options (id, type, value) VALUES
-- Keterangan
('opt-ket-1', 'keterangan', 'REK TIDAK VALID'),
('opt-ket-2', 'keterangan', 'REK BEDA NAMA'),
('opt-ket-3', 'keterangan', 'KONFIRMASI NAMA REK'),
('opt-ket-4', 'keterangan', 'REVISI BEDA NAMA REK'),
('opt-ket-5', 'keterangan', 'WITHDRAW BELUM PREMIUM'),
('opt-ket-6', 'keterangan', 'WITHDRAW PL LIMIT'),
('opt-ket-7', 'keterangan', 'NAMA KURANG LENGKAP'),
('opt-ket-8', 'keterangan', 'REKENING TERDORMANT'),
('opt-ket-9', 'keterangan', 'BUTUH BUKTI'),
('opt-ket-10', 'keterangan', 'REVISI NAMA'),
('opt-ket-11', 'keterangan', 'CEK LIMIT PL'),
('opt-ket-12', 'keterangan', 'DONE'),
-- Ket Tambahan
('opt-tamb-1', 'ketTambahan', 'KENDALA PROSES'),
('opt-tamb-2', 'ketTambahan', 'KENDALA SELESAI'),
('opt-tamb-3', 'ketTambahan', 'SALDO DITURUNKAN'),
('opt-tamb-4', 'ketTambahan', 'PENDING DEPOSIT'),
-- Locked By
('opt-lock-1', 'lockedBy', 'OPERATOR 1'),
('opt-lock-2', 'lockedBy', 'OPERATOR 2'),
('opt-lock-3', 'lockedBy', 'OPERATOR 3'),
-- Unlocked By
('opt-unlock-1', 'unlockedBy', 'OPERATOR 1'),
('opt-unlock-2', 'unlockedBy', 'OPERATOR 2'),
('opt-unlock-3', 'unlockedBy', 'OPERATOR 3')
ON CONFLICT (type, value) DO NOTHING;

-- 9. AKTIFKAN SUPABASE REALTIME
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bukti_validation;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bukti_lock_pl;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bukti_geser_g;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bukti_wd_besar;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bukti_categories;
    EXCEPTION WHEN OTHERS THEN
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bukti_options;
    EXCEPTION WHEN OTHERS THEN
    END;
END $$;

-- 10. AKTIFKAN ROW LEVEL SECURITY (RLS) & BUAT POLICIES PUBLIC
ALTER TABLE bukti_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE bukti_lock_pl ENABLE ROW LEVEL SECURITY;
ALTER TABLE bukti_geser_g ENABLE ROW LEVEL SECURITY;
ALTER TABLE bukti_wd_besar ENABLE ROW LEVEL SECURITY;
ALTER TABLE bukti_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bukti_options ENABLE ROW LEVEL SECURITY;

-- Policies untuk bukti_validation
DROP POLICY IF EXISTS "bukti_validation_public_all" ON bukti_validation;
CREATE POLICY "bukti_validation_public_all" ON bukti_validation FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Policies untuk bukti_lock_pl
DROP POLICY IF EXISTS "bukti_lock_pl_public_all" ON bukti_lock_pl;
CREATE POLICY "bukti_lock_pl_public_all" ON bukti_lock_pl FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Policies untuk bukti_geser_g
DROP POLICY IF EXISTS "bukti_geser_g_public_all" ON bukti_geser_g;
CREATE POLICY "bukti_geser_g_public_all" ON bukti_geser_g FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Policies untuk bukti_wd_besar
DROP POLICY IF EXISTS "bukti_wd_besar_public_all" ON bukti_wd_besar;
CREATE POLICY "bukti_wd_besar_public_all" ON bukti_wd_besar FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Policies untuk bukti_categories
DROP POLICY IF EXISTS "bukti_categories_public_all" ON bukti_categories;
CREATE POLICY "bukti_categories_public_all" ON bukti_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Policies untuk bukti_options
DROP POLICY IF EXISTS "bukti_options_public_all" ON bukti_options;
CREATE POLICY "bukti_options_public_all" ON bukti_options FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 11. GRANT PERMISSIONS TO ANON/AUTHENTICATED
GRANT SELECT, INSERT, UPDATE, DELETE ON bukti_validation TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bukti_lock_pl TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bukti_geser_g TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bukti_wd_besar TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bukti_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bukti_options TO anon, authenticated;

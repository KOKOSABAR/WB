-- ============================================================
-- SERAH TERIMA SETUP
-- Jalankan SQL ini di Supabase SQL Editor
-- Aman dijalankan berkali-kali (idempotent)
-- ============================================================

-- 1. Tabel Serah Terima CS LINE
CREATE TABLE IF NOT EXISTS serah_terima_cs_line (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tanggal     date NOT NULL,
    shift       text NOT NULL CHECK (shift IN ('Pagi', 'Malam')),
    isi         text NOT NULL,
    petugas     text NOT NULL,
    created_by  text,
    created_at  timestamptz DEFAULT now()
);

-- 2. Tabel Serah Terima Kapten Kasir
CREATE TABLE IF NOT EXISTS serah_terima_kapten_kasir (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tanggal     date NOT NULL,
    shift       text NOT NULL CHECK (shift IN ('Pagi', 'Malam')),
    isi         text NOT NULL,
    petugas     text NOT NULL,
    created_by  text,
    created_at  timestamptz DEFAULT now()
);

-- 3. Tabel Serah Terima Kasir (ada kolom jobdesk)
CREATE TABLE IF NOT EXISTS serah_terima_kasir (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tanggal     date NOT NULL,
    shift       text NOT NULL CHECK (shift IN ('Pagi', 'Malam')),
    jobdesk     text,
    isi         text NOT NULL,
    petugas     text NOT NULL,
    created_by  text,
    created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE serah_terima_cs_line       ENABLE ROW LEVEL SECURITY;
ALTER TABLE serah_terima_kapten_kasir  ENABLE ROW LEVEL SECURITY;
ALTER TABLE serah_terima_kasir         ENABLE ROW LEVEL SECURITY;

-- Drop dulu jika sudah ada (aman untuk re-run)
DROP POLICY IF EXISTS "Read serah terima cs line"      ON serah_terima_cs_line;
DROP POLICY IF EXISTS "Read serah terima kapten kasir" ON serah_terima_kapten_kasir;
DROP POLICY IF EXISTS "Read serah terima kasir"        ON serah_terima_kasir;
DROP POLICY IF EXISTS "Write serah terima cs line"     ON serah_terima_cs_line;
DROP POLICY IF EXISTS "Write serah terima kapten kasir" ON serah_terima_kapten_kasir;
DROP POLICY IF EXISTS "Write serah terima kasir"       ON serah_terima_kasir;

-- Policy: SELECT (baca)
CREATE POLICY "Read serah terima cs line"
    ON serah_terima_cs_line FOR SELECT
    USING (true);

CREATE POLICY "Read serah terima kapten kasir"
    ON serah_terima_kapten_kasir FOR SELECT
    USING (true);

CREATE POLICY "Read serah terima kasir"
    ON serah_terima_kasir FOR SELECT
    USING (true);

-- Policy: INSERT / UPDATE / DELETE (tulis)
CREATE POLICY "Write serah terima cs line"
    ON serah_terima_cs_line FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Write serah terima kapten kasir"
    ON serah_terima_kapten_kasir FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Write serah terima kasir"
    ON serah_terima_kasir FOR ALL
    USING (true) WITH CHECK (true);

-- ============================================================
-- REALTIME (abaikan error jika tabel sudah terdaftar)
-- ============================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE serah_terima_cs_line;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE serah_terima_kapten_kasir;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE serah_terima_kasir;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

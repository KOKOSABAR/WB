-- SKRIP MIGRASI DATABASE SERAH TERIMA PASPOR
-- Jalankan skrip ini di SQL Editor Supabase Anda.

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

ALTER PUBLICATION supabase_realtime ADD TABLE passport_handovers;
ALTER TABLE passport_handovers DISABLE ROW LEVEL SECURITY;

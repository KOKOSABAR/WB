-- ============================================================
-- SETUP TABEL QRIS TRANSACTIONS
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS qris_transactions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    waktu       TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- Waktu transaksi
    user_id     TEXT NOT NULL,                        -- User ID / Member ID
    order_id    TEXT NOT NULL,                        -- Order ID
    rrn         TEXT,                                 -- Reference Retrieval Number
    jenis_qris  TEXT NOT NULL DEFAULT 'STATIS',       -- 'STATIS' atau 'DINAMIS'
    nominal     BIGINT NOT NULL DEFAULT 0,            -- Nominal dalam Rupiah
    status      TEXT NOT NULL DEFAULT 'SUKSES',       -- 'SUKSES' | 'PENDING' | 'GAGAL'
    catatan     TEXT,                                 -- Catatan tambahan
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk filter bulan (gte/lte pada kolom waktu)
CREATE INDEX IF NOT EXISTS idx_qris_waktu ON qris_transactions (waktu DESC);
CREATE INDEX IF NOT EXISTS idx_qris_status ON qris_transactions (status);

-- Aktifkan Realtime
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE qris_transactions;
    EXCEPTION WHEN OTHERS THEN END;
END $$;

-- Nonaktifkan RLS (development)
ALTER TABLE qris_transactions DISABLE ROW LEVEL SECURITY;

-- Grant akses
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qris_transactions TO anon, authenticated;

-- Re-enable RLS dengan policy permissive
ALTER TABLE qris_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qris_public_all" ON qris_transactions;
CREATE POLICY "qris_public_all"
ON qris_transactions FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

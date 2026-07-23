-- ============================================================
-- SUPABASE MIGRATION SCRIPT: DATA REKENING
-- Eksekusi skrip ini di SQL Editor Dashboard Supabase Anda
-- ============================================================

CREATE TABLE IF NOT EXISTS public.data_rekening (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    status VARCHAR(50) NOT NULL DEFAULT 'AKTIF',
    nama_bank VARCHAR(100) NOT NULL,
    nama_rekening VARCHAR(150) NOT NULL,
    no_rekening VARCHAR(100) NOT NULL,
    jenis VARCHAR(100) DEFAULT 'Utama',
    masa_aktif DATE,
    is_permanent BOOLEAN DEFAULT FALSE,
    screenshot_url TEXT,
    tanggal_input TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    input_by_staff_id UUID,
    input_by_staff_name VARCHAR(150),
    catatan TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeks untuk performa query
CREATE INDEX IF NOT EXISTS idx_data_rekening_status ON public.data_rekening(status);
CREATE INDEX IF NOT EXISTS idx_data_rekening_nama_bank ON public.data_rekening(nama_bank);
CREATE INDEX IF NOT EXISTS idx_data_rekening_masa_aktif ON public.data_rekening(masa_aktif);

-- Enable RLS
ALTER TABLE public.data_rekening ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon users (sesuai setup app restease)
CREATE POLICY "Public read data_rekening" ON public.data_rekening FOR SELECT USING (true);
CREATE POLICY "Public insert data_rekening" ON public.data_rekening FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update data_rekening" ON public.data_rekening FOR UPDATE USING (true);
CREATE POLICY "Public delete data_rekening" ON public.data_rekening FOR DELETE USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_rekening;

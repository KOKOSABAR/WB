-- ==========================================
-- SQL SETUP UNTUK FITUR SERAH TERIMA PASPOR
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==========================================

-- 1. Tambahkan kolom passport_number ke tabel staff jika belum ada
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS passport_number TEXT;

-- 2. Buat tabel passport_handovers untuk mencatat log harian serah terima
-- Menggunakan gen_random_uuid() agar tidak bergantung pada ekstensi uuid-ossp
CREATE TABLE IF NOT EXISTS public.passport_handovers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift TEXT NOT NULL,
    status_masuk TEXT DEFAULT 'BELUM',
    status_pulang TEXT DEFAULT 'BELUM',
    waktu_masuk TIMESTAMP WITH TIME ZONE,
    waktu_pulang TIMESTAMP WITH TIME ZONE,
    petugas_masuk TEXT,
    petugas_pulang TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Langkah upgrade jika tabel sudah terlanjur dibuat tanpa kolom petugas
ALTER TABLE public.passport_handovers ADD COLUMN IF NOT EXISTS petugas_masuk TEXT;
ALTER TABLE public.passport_handovers ADD COLUMN IF NOT EXISTS petugas_pulang TEXT;

-- 3. Pastikan kombinasi staff_id dan date unik agar tidak ada duplikasi data per hari
ALTER TABLE public.passport_handovers 
DROP CONSTRAINT IF EXISTS unique_staff_date;

ALTER TABLE public.passport_handovers 
ADD CONSTRAINT unique_staff_date UNIQUE (staff_id, date);

-- 4. Set RLS (Row Level Security) agar bisa diakses public (sesuaikan dengan tabel lain di project ini)
ALTER TABLE public.passport_handovers DISABLE ROW LEVEL SECURITY;

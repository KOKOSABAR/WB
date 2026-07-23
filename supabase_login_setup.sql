-- ==========================================
-- SQL SETUP UNTUK SISTEM LOGIN & REGISTRASI STAFF
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==========================================

-- 1. Tambahkan kolom email, username, dan password ke tabel staff jika belum ada
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS password TEXT;

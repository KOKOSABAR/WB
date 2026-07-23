-- ============================================================
-- SERAH TERIMA: ADD is_read COLUMN MIGRATION
-- ============================================================
-- This migration adds the is_read column to all 3 Serah Terima tables
-- to track whether the data has been marked as read by the next staff
-- 
-- Run this AFTER supabase_serah_terima_setup.sql
-- ============================================================

-- 1. Add is_read column to CS LINE table
ALTER TABLE serah_terima_cs_line 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- 2. Add is_read column to KAPTEN KASIR table
ALTER TABLE serah_terima_kapten_kasir 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- 3. Add is_read column to KASIR table
ALTER TABLE serah_terima_kasir 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- Set existing records to FALSE (in case column already existed with NULL values)
UPDATE serah_terima_cs_line SET is_read = FALSE WHERE is_read IS NULL;
UPDATE serah_terima_kapten_kasir SET is_read = FALSE WHERE is_read IS NULL;
UPDATE serah_terima_kasir SET is_read = FALSE WHERE is_read IS NULL;

-- Done! The is_read column is now available in all 3 tables

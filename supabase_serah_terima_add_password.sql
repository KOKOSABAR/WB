-- ============================================================
-- MIGRATION: Add password column to Serah Terima tables
-- Add password field for CS LINE and KAPTEN KASIR
-- KASIR table does not need password field
-- ============================================================

-- Add password column to serah_terima_cs_line
ALTER TABLE serah_terima_cs_line 
ADD COLUMN IF NOT EXISTS password TEXT;

-- Add password column to serah_terima_kapten_kasir
ALTER TABLE serah_terima_kapten_kasir 
ADD COLUMN IF NOT EXISTS password TEXT;

-- Add comment to explain password field
COMMENT ON COLUMN serah_terima_cs_line.password IS 'Password manually entered by staff for security verification';
COMMENT ON COLUMN serah_terima_kapten_kasir.password IS 'Password manually entered by staff for security verification';

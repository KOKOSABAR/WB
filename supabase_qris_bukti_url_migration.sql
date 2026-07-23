-- Migration: Add bukti_url column to qris_transactions table
-- Date: 2026-07-17

-- Add bukti_url column to existing qris_transactions table
ALTER TABLE qris_transactions 
ADD COLUMN IF NOT EXISTS bukti_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN qris_transactions.bukti_url IS 'URL bukti transfer/pembayaran QRIS (optional)';

-- Create index for faster searches if needed
CREATE INDEX IF NOT EXISTS idx_qris_transactions_bukti_url 
ON qris_transactions USING btree (bukti_url) 
WHERE bukti_url IS NOT NULL;

-- Verify the change
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'qris_transactions' 
AND table_schema = 'public'
ORDER BY ordinal_position;
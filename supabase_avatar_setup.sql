-- Add avatar_url column to staff table
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS avatar_url TEXT;

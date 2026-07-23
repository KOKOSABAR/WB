-- ==========================================================================
-- SUPABASE SETUP: BANDING KESALAHAN CS TABLE
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.bukti_banding_kesalahan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tanggal DATE DEFAULT CURRENT_DATE,
    nama_staff TEXT NOT NULL,
    nama_situs TEXT NOT NULL,
    bukti_ss_auditor TEXT,
    bukti_banding TEXT,
    keterangan_banding TEXT,
    keterangan TEXT DEFAULT 'PENDING',
    keterangan_tolak TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bukti_banding_kesalahan ENABLE ROW LEVEL SECURITY;

-- Enable Realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bukti_banding_kesalahan;

-- Create Permissive Access Policies
DROP POLICY IF EXISTS "banding_public_all" ON public.bukti_banding_kesalahan;
CREATE POLICY "banding_public_all" ON public.bukti_banding_kesalahan
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Grant Permissions to all roles
GRANT ALL ON public.bukti_banding_kesalahan TO anon, authenticated, service_role;

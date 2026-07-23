-- ================================================================
-- STAFF PREFERENCES TABLE SETUP
-- Untuk menyimpan preferensi personal staff (background, theme, dll)
-- ================================================================

-- Buat tabel staff_preferences
CREATE TABLE IF NOT EXISTS public.staff_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    background_type VARCHAR(20) DEFAULT 'preset' CHECK (background_type IN ('preset', 'gradient', 'image', 'custom')),
    background_value TEXT,
    animation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(staff_id)
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_staff_preferences_staff_id ON public.staff_preferences(staff_id);

-- Nonaktifkan RLS agar konsisten dengan pola akses aplikasi lain
-- karena aplikasi menggunakan public anon key langsung dari client.
ALTER TABLE public.staff_preferences DISABLE ROW LEVEL SECURITY;

-- Function untuk auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_staff_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_staff_preferences_updated_at ON public.staff_preferences;
CREATE TRIGGER trigger_update_staff_preferences_updated_at
    BEFORE UPDATE ON public.staff_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_staff_preferences_updated_at();

-- Insert default presets untuk testing (optional)
COMMENT ON TABLE public.staff_preferences IS 'Menyimpan preferensi personal staff termasuk background choice';
COMMENT ON COLUMN public.staff_preferences.background_type IS 'Tipe background: preset (default backgrounds), gradient (custom gradients), image (uploaded image URL), custom (CSS value)';
COMMENT ON COLUMN public.staff_preferences.background_value IS 'Value sesuai background_type: preset name, gradient CSS, image URL, atau custom CSS';
COMMENT ON COLUMN public.staff_preferences.animation_enabled IS 'Status animasi background bergerak untuk tiap staff: true = aktif, false = nonaktif';

-- Grant permissions untuk akses aplikasi
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_preferences TO anon, authenticated;

-- Policy cadangan jika RLS aktif lagi dari dashboard
ALTER TABLE public.staff_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_preferences_public_all" ON public.staff_preferences;
CREATE POLICY "staff_preferences_public_all"
    ON public.staff_preferences
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- ================================================================
-- STORAGE BUCKET SETUP FOR BACKGROUND IMAGES
-- ================================================================
/*
IMPORTANT: Storage buckets harus dibuat melalui Supabase Dashboard > Storage

1. Buka Supabase Dashboard
2. Pergi ke Storage > Create Bucket
3. Nama bucket: 'staff-backgrounds'
4. Public bucket: Yes (centang)
5. Allowed MIME types: image/jpeg, image/png, image/webp
6. Max file size: 2MB

Atau gunakan SQL berikut (jika ada akses):

-- Create storage bucket (may require admin privileges)
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-backgrounds', 'staff-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies untuk staff-backgrounds bucket
CREATE POLICY "Staff can upload own background"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'staff-backgrounds' 
    AND auth.uid() IS NOT NULL
);

CREATE POLICY "Anyone can view backgrounds"
ON storage.objects FOR SELECT
USING (bucket_id = 'staff-backgrounds');

CREATE POLICY "Staff can update own background"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'staff-backgrounds'
    AND auth.uid() IS NOT NULL
);

CREATE POLICY "Staff can delete own background"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'staff-backgrounds'
    AND auth.uid() IS NOT NULL
);
*/

-- ================================================================
-- PRESET BACKGROUND OPTIONS (untuk reference)
-- ================================================================
/*
Preset backgrounds yang tersedia:
1. 'cosmic-purple' - Default cosmic purple gradient
2. 'ocean-blue' - Deep ocean blue gradient
3. 'forest-green' - Forest green gradient
4. 'sunset-orange' - Warm sunset gradient
5. 'midnight-dark' - Ultra dark minimal
6. 'royal-gold' - Luxury gold accent
7. 'cyber-neon' - Cyberpunk neon style
8. 'aurora-sky' - Aurora borealis colors
9. 'rose-pink' - Soft rose pink gradient
10. 'steel-gray' - Professional steel gray

Format background_value untuk setiap type:
- preset: 'cosmic-purple', 'ocean-blue', etc
- gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
- image: 'https://example.com/image.jpg' atau Supabase storage URL
- custom: Any valid CSS background value

Format animation_enabled:
- true: animasi background bergerak tampil
- false: animasi background bergerak disembunyikan
*/

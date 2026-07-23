-- ============================================================
-- SLOT ENFORCEMENT TRIGGER (LAPISAN KEAMANAN TAMBAHAN)
-- Jalankan di Supabase SQL Editor setelah supabase_atomic_break.sql
-- ============================================================
-- Trigger ini adalah "last resort" — memblokir INSERT ke
-- active_breaks di level database jika slot sudah penuh,
-- BAHKAN jika ada yang bypass RPC function dari luar.
-- ============================================================

-- 1. Fungsi trigger penjaga slot per role
CREATE OR REPLACE FUNCTION check_role_slot_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_slots INTEGER;
    v_current   INTEGER;
BEGIN
    -- Ambil max_slots dari roles_config untuk role ini
    SELECT max_slots INTO v_max_slots
    FROM roles_config
    WHERE upper(trim(role)) = upper(trim(NEW.role))
    LIMIT 1;

    -- Jika role tidak ditemukan di config, default ke 1
    IF v_max_slots IS NULL THEN
        v_max_slots := 1;
    END IF;

    -- Hitung berapa yang sudah aktif untuk role ini
    SELECT COUNT(*) INTO v_current
    FROM active_breaks
    WHERE upper(trim(role)) = upper(trim(NEW.role));

    -- Tolak jika sudah penuh
    IF v_current >= v_max_slots THEN
        RAISE EXCEPTION 'SLOT_FULL: Slot istirahat untuk jabatan % sudah penuh (% / %).', 
            NEW.role, v_current, v_max_slots;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Pasang trigger BEFORE INSERT pada tabel active_breaks
DROP TRIGGER IF EXISTS trg_check_role_slot ON active_breaks;
CREATE TRIGGER trg_check_role_slot
    BEFORE INSERT ON active_breaks
    FOR EACH ROW
    EXECUTE FUNCTION check_role_slot_limit();

-- Grant eksekusi fungsi ke service role (sudah otomatis untuk TRIGGER)
-- Tidak perlu GRANT karena trigger berjalan di server-side context

-- ============================================================
-- SETELAH MENJALANKAN:
-- Bahkan jika seseorang INSERT langsung ke tabel active_breaks
-- (bukan lewat RPC), trigger ini akan menolak jika slot penuh.
-- Error 'SLOT_FULL' akan dikirim ke client sebagai exception.
-- ============================================================

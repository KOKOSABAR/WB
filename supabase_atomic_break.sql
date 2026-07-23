-- ============================================================
-- ATOMIC BREAK SLOT ENFORCEMENT
-- Jalankan script ini di Supabase SQL Editor
-- ============================================================
-- Tujuan: Mencegah race condition saat banyak staff dari jabatan
-- yang sama menekan tombol izin bersamaan.
-- Cara kerja: Semua validasi (quota + slot) + INSERT dilakukan
-- dalam SATU transaction dengan advisory lock per role, sehingga
-- request yang datang bersamaan harus antri — tidak bisa tembus
-- batas slot.
-- ============================================================

-- 1. Pastikan kolom allowed_duration di active_breaks bertipe INTEGER (detik)
--    (sudah sesuai schema awal, ini hanya penegasan)

-- 2. Fungsi atomic: mencoba mulai istirahat, return status
CREATE OR REPLACE FUNCTION atomic_start_break(
    p_staff_id        UUID,
    p_staff_name      TEXT,
    p_role            TEXT,
    p_allowed_duration INTEGER,   -- dalam detik
    p_max_slots       INTEGER,
    p_daily_quota     INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_role_count  INTEGER;
    v_today_log_count     INTEGER;
    v_lock_key            BIGINT;
    v_result              JSON;
    v_inserted            active_breaks%ROWTYPE;
BEGIN
    -- ── Advisory lock per role ────────────────────────────────
    -- Menghasilkan angka unik dari nama role agar lock per-jabatan
    -- (bukan lock global seluruh tabel).
    v_lock_key := abs(hashtext(upper(trim(p_role))));
    PERFORM pg_advisory_xact_lock(v_lock_key);
    -- Lock dilepas otomatis saat transaction selesai.
    -- Semua request dengan role yang sama harus antri di sini.

    -- ── Cek: staff sudah sedang istirahat? ───────────────────
    IF EXISTS (
        SELECT 1 FROM active_breaks WHERE staff_id = p_staff_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'code',    'ALREADY_ACTIVE',
            'message', 'Kamu sudah sedang dalam sesi istirahat.'
        );
    END IF;

    -- ── Cek: quota harian ────────────────────────────────────
    SELECT COUNT(*) INTO v_today_log_count
    FROM break_logs
    WHERE staff_id   = p_staff_id
      AND start_time >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Makassar');

    IF v_today_log_count >= p_daily_quota THEN
        RETURN json_build_object(
            'success', false,
            'code',    'QUOTA_EXCEEDED',
            'message', 'Kuota izin harian sudah habis.'
        );
    END IF;

    -- ── Cek: slot role masih tersedia? ────────────────────────
    SELECT COUNT(*) INTO v_current_role_count
    FROM active_breaks
    WHERE upper(trim(role)) = upper(trim(p_role));

    IF v_current_role_count >= p_max_slots THEN
        RETURN json_build_object(
            'success', false,
            'code',    'SLOT_FULL',
            'message', 'Slot istirahat untuk jabatan ' || p_role || ' sudah penuh (' || p_max_slots || '/' || p_max_slots || ').'
        );
    END IF;

    -- ── Semua cek lolos → INSERT ──────────────────────────────
    INSERT INTO active_breaks (staff_id, staff_name, role, start_time, allowed_duration)
    VALUES (p_staff_id, p_staff_name, p_role, NOW(), p_allowed_duration)
    RETURNING * INTO v_inserted;

    RETURN json_build_object(
        'success',          true,
        'code',             'OK',
        'message',          'Selamat beristirahat!',
        'staff_id',         v_inserted.staff_id,
        'staff_name',       v_inserted.staff_name,
        'role',             v_inserted.role,
        'start_time',       v_inserted.start_time,
        'allowed_duration', v_inserted.allowed_duration
    );

EXCEPTION
    WHEN unique_violation THEN
        -- Staff mencoba double-insert (sangat jarang tapi aman ditangkap)
        RETURN json_build_object(
            'success', false,
            'code',    'ALREADY_ACTIVE',
            'message', 'Kamu sudah tercatat sedang istirahat.'
        );
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'code',    'DB_ERROR',
            'message', SQLERRM
        );
END;
$$;

-- 3. Grant akses ke anon & authenticated (Supabase public key)
GRANT EXECUTE ON FUNCTION atomic_start_break(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER)
    TO anon, authenticated;

-- ============================================================
-- SETELAH MENJALANKAN SCRIPT INI:
-- Buka Supabase Dashboard → SQL Editor → jalankan file ini.
-- Kemudian test di aplikasi — slot CS LC tidak akan bisa > 2
-- meskipun 10 staff menekan tombol bersamaan.
-- ============================================================

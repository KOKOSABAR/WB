-- ============================================================
-- SUPABASE FULL REALTIME SETUP (SEMUA TABEL)
-- Jalankan SQL ini di Supabase SQL Editor (Project Dashboard)
-- Aman dijalankan berkali-kali (Idempotent)
-- ============================================================

-- 1. UTILITY FUNCTION: TAMBAH TABEL KE SUPABASE_REALTIME PUBLICATION
DO $$
DECLARE
    tbl text;
    tables_to_add text[] := ARRAY[
        'active_breaks',
        'break_logs',
        'settings',
        'staff',
        'roles_config',
        'absensi_shifts',
        'absensi_logs',
        'bukti_banding_kesalahan',
        'qris_transactions',
        'serah_terima_cs_line',
        'serah_terima_kapten_kasir',
        'serah_terima_kasir',
        'chat_messages',
        'chat_groups',
        'chat_users',
        'chat_group_members'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables_to_add LOOP
        -- Set Replica Identity Full agar payload Realtime membawa data lengkap (old & new)
        BEGIN
            EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', tbl);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping REPLICA IDENTITY for %: %', tbl, SQLERRM;
        END;

        -- Tambahkan tabel ke publication supabase_realtime jika belum ada
        IF EXISTS (
            SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl
        ) THEN
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables 
                WHERE pubname = 'supabase_realtime' 
                AND schemaname = 'public' 
                AND tablename = tbl
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
                RAISE NOTICE 'Tabel % berhasil ditambahkan ke publication supabase_realtime.', tbl;
            ELSE
                RAISE NOTICE 'Tabel % sudah ada di publication supabase_realtime.', tbl;
            END IF;
        END IF;
    END LOOP;
END $$;

-- 2. VERIFIKASI TABEL REALTIME
SELECT pubname, schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND schemaname = 'public';

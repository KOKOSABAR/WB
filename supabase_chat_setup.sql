-- ==========================================
-- SQL SETUP UNTUK FITUR GROUP CHAT (TEAM MESSENGER)
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==========================================

-- 1. Tabel Chat Users (Penyimpanan Profil + Avatar)
CREATE TABLE IF NOT EXISTS chat_users (
    id UUID PRIMARY KEY,  -- sama dengan staff.id
    name TEXT NOT NULL,
    avatar_url TEXT,      -- base64 atau URL foto profil
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Chat Groups (Grup Obrolan + Direct Messages)
CREATE TABLE IF NOT EXISTS chat_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    is_dm BOOLEAN DEFAULT false,        -- true = direct message antara 2 orang
    last_message TEXT DEFAULT '',       -- preview pesan terakhir
    created_by UUID REFERENCES chat_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Chat Group Members (Anggota Grup)
CREATE TABLE IF NOT EXISTS chat_group_members (
    group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES chat_users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',         -- 'admin' | 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- 4. Tabel Chat Messages (Pesan Obrolan)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES chat_users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,          -- cache nama pengirim
    sender_avatar TEXT,                 -- cache avatar pengirim
    content TEXT,                       -- teks pesan (nullable jika hanya gambar)
    attachment_url TEXT,                -- URL gambar atau base64
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Migrasi kolom untuk tabel yang sudah ada (jalankan jika tabel lama sudah dibuat)
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS is_dm BOOLEAN DEFAULT false;
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS last_message TEXT DEFAULT '';
ALTER TABLE chat_users  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 6. AKTIFKAN SUPABASE REALTIME
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
    EXCEPTION WHEN OTHERS THEN END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_groups;
    EXCEPTION WHEN OTHERS THEN END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_users;
    EXCEPTION WHEN OTHERS THEN END;

    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_members;
    EXCEPTION WHEN OTHERS THEN END;
END $$;

-- 7. NONAKTIFKAN RLS (development)
ALTER TABLE chat_users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups        DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      DISABLE ROW LEVEL SECURITY;

-- 8. GRANT HAK AKSES DASAR
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_users         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_groups        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_group_members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages      TO anon, authenticated;

-- 9. RE-ENABLE RLS DENGAN POLICY PERMISSIVE
ALTER TABLE chat_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_users_public_all"         ON chat_users;
DROP POLICY IF EXISTS "chat_groups_public_all"        ON chat_groups;
DROP POLICY IF EXISTS "chat_group_members_public_all" ON chat_group_members;
DROP POLICY IF EXISTS "chat_messages_public_all"      ON chat_messages;

CREATE POLICY "chat_users_public_all"
    ON chat_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "chat_groups_public_all"
    ON chat_groups FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "chat_group_members_public_all"
    ON chat_group_members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "chat_messages_public_all"
    ON chat_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==========================================
-- MIGRASI: Kolom baru untuk fitur reply, pin, seen_by
-- Jalankan di SQL Editor Supabase
-- ==========================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id   UUID REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_name TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_preview TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_pinned     BOOLEAN DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS seen_by       JSONB DEFAULT '[]'::jsonb;

-- Migrasi: tambah avatar_url ke chat_groups
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS avatar_url TEXT;

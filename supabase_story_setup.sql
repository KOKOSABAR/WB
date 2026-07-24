-- 1. Create staff_stories table
CREATE TABLE IF NOT EXISTS public.staff_stories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT, -- Base64 encoded image string
    likes JSONB DEFAULT '[]'::jsonb, -- Array of staff_ids who liked the post
    comments JSONB DEFAULT '[]'::jsonb -- Array of comment objects (with nested replies)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.staff_stories ENABLE ROW LEVEL SECURITY;

-- 3. Create simple permissive policies for local and easy development
CREATE POLICY "Allow read stories" ON public.staff_stories FOR SELECT USING (true);
CREATE POLICY "Allow insert stories" ON public.staff_stories FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update stories" ON public.staff_stories FOR UPDATE USING (true);
CREATE POLICY "Allow delete stories" ON public.staff_stories FOR DELETE USING (true);

-- 4. Add table to supabase_realtime publication
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = 'staff_stories'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_stories;
        END IF;
    END IF;
END $$;

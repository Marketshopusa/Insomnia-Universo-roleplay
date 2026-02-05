-- Create enum for story types
CREATE TYPE public.story_type AS ENUM ('adventure', 'roleplay', 'real_sex');

-- Create enum for story source
CREATE TYPE public.story_source AS ENUM ('crafted', 'custom');

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    username TEXT,
    avatar_url TEXT,
    credits INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create categories table
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on categories (public read)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly viewable"
ON public.categories FOR SELECT
USING (true);

-- Create stories table
CREATE TABLE public.stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    cover_image TEXT,
    story_type story_type NOT NULL DEFAULT 'roleplay',
    source story_source NOT NULL DEFAULT 'crafted',
    player_role TEXT DEFAULT 'man',
    character_role TEXT,
    has_explicit_images BOOLEAN DEFAULT false,
    video_count INTEGER DEFAULT 0,
    image_count INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on stories
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories are publicly viewable"
ON public.stories FOR SELECT
USING (true);

CREATE POLICY "Users can create their own stories"
ON public.stories FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own stories"
ON public.stories FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own stories"
ON public.stories FOR DELETE
USING (auth.uid() = created_by);

-- Create story_categories junction table
CREATE TABLE public.story_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES public.stories(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
    UNIQUE(story_id, category_id)
);

-- Enable RLS on story_categories
ALTER TABLE public.story_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story categories are publicly viewable"
ON public.story_categories FOR SELECT
USING (true);

-- Create user_stories (saved stories / my stories)
CREATE TABLE public.user_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    story_type story_type NOT NULL DEFAULT 'roleplay',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on user_stories
ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stories"
ON public.user_stories FOR SELECT
USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create their own stories"
ON public.user_stories FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stories"
ON public.user_stories FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stories"
ON public.user_stories FOR DELETE
USING (auth.uid() = user_id);

-- Create novel_projects table for Novel Studio
CREATE TABLE public.novel_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL DEFAULT 'Untitled Project',
    description TEXT,
    content TEXT,
    outline TEXT,
    chapter_count INTEGER DEFAULT 7,
    language TEXT DEFAULT 'English',
    model TEXT DEFAULT 'Apprentice 6',
    creativity TEXT DEFAULT 'Balanced',
    is_safe_for_work BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on novel_projects
ALTER TABLE public.novel_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own novel projects"
ON public.novel_projects FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own novel projects"
ON public.novel_projects FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own novel projects"
ON public.novel_projects FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own novel projects"
ON public.novel_projects FOR DELETE
USING (auth.uid() = user_id);

-- Create voice_settings table
CREATE TABLE public.voice_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    voice_name TEXT DEFAULT 'Scarlett HD',
    gender_filter TEXT DEFAULT 'All',
    style_filter TEXT DEFAULT 'All',
    is_muted BOOLEAN DEFAULT false,
    autoplay BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS on voice_settings
ALTER TABLE public.voice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voice settings"
ON public.voice_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own voice settings"
ON public.voice_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice settings"
ON public.voice_settings FOR UPDATE
USING (auth.uid() = user_id);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER handle_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_stories_updated_at
    BEFORE UPDATE ON public.stories
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_user_stories_updated_at
    BEFORE UPDATE ON public.user_stories
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_novel_projects_updated_at
    BEFORE UPDATE ON public.novel_projects
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_voice_settings_updated_at
    BEFORE UPDATE ON public.voice_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, username)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Insert default categories
INSERT INTO public.categories (name, slug) VALUES
    ('Adventure', 'adventure'),
    ('Romance', 'romance'),
    ('Fantasy', 'fantasy'),
    ('Thriller', 'thriller'),
    ('Mystery', 'mystery'),
    ('Drama', 'drama'),
    ('Comedy', 'comedy'),
    ('Horror', 'horror'),
    ('Sci-Fi', 'sci-fi'),
    ('Historical', 'historical'),
    ('Action', 'action'),
    ('Suspense', 'suspense');

-- Insert sample stories for demo
INSERT INTO public.stories (title, description, story_type, source, player_role, character_role, has_explicit_images, video_count, image_count, is_featured) VALUES
    ('Early Arrival', 'An unexpected encounter that changes everything', 'roleplay', 'crafted', 'woman', 'man', false, 5, 0, true),
    ('Mysterious Stranger', 'A chance meeting with a mysterious figure', 'adventure', 'crafted', 'man', 'woman', false, 0, 17, true),
    ('Gradual Descent', 'A journey into the unknown depths', 'roleplay', 'crafted', 'man', 'woman', false, 25, 0, true),
    ('Midnight Encounter', 'When the clock strikes twelve, magic happens', 'roleplay', 'crafted', 'man', 'woman', true, 0, 33, true),
    ('Natural Connection', 'Finding love in unexpected places', 'roleplay', 'crafted', 'man', 'woman', false, 2, 0, true),
    ('Late-night Adventure', 'The night is young and full of possibilities', 'adventure', 'crafted', 'man', 'man', false, 91, 0, true),
    ('Sweet Desires', 'Indulging in the sweeter things in life', 'roleplay', 'crafted', 'woman', 'man', false, 21, 0, false),
    ('Photo Session', 'Capturing moments that last forever', 'roleplay', 'crafted', 'man', 'woman', true, 92, 0, false),
    ('Power Play', 'Who holds the power in this game?', 'roleplay', 'crafted', 'man', 'woman', false, 45, 0, false),
    ('Hidden Desires', 'Exploring what lies beneath the surface', 'roleplay', 'crafted', 'man', 'woman', false, 9, 0, false),
    ('Sisterhood', 'Bonds that can never be broken', 'roleplay', 'crafted', 'woman', 'woman', false, 17, 0, false),
    ('Festival Dreams', 'Under the stars at the festival of a lifetime', 'adventure', 'crafted', 'man', 'woman', true, 0, 105, false);
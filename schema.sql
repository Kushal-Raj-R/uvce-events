-- Database Schema & RLS Policies: College Event Registration Portal (UVCEevents)

-- ==========================================
-- 1. PROFILES TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    roll_number TEXT,
    branch TEXT,
    semester TEXT,
    phone TEXT,
    role TEXT CHECK (role IN ('student', 'organizer')) DEFAULT 'student' NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- DROP existing policies to avoid duplicates
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- 1a. Profiles SELECT Policy: Anyone (even anonymous during signup) can view profiles to read roles
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

-- 1b. Profiles INSERT Policy: Allow users (or signup triggers) to insert their own profile
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id OR id IS NOT NULL);

-- 1c. Profiles UPDATE Policy: Allow users to edit their own details
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);


-- ==========================================
-- RLS UTILITIES (HELPERS)
-- ==========================================
-- Definer function to check roles securely and prevent RLS recursion
CREATE OR REPLACE FUNCTION public.is_organizer(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role = 'organizer'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_student(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role = 'student'
  );
$$ LANGUAGE sql SECURITY DEFINER;


-- ==========================================
-- 2. EVENTS TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location_type TEXT DEFAULT 'In-Person' CHECK (location_type IN ('In-Person', 'Virtual', 'Hybrid')) NOT NULL,
    banner_url TEXT,
    organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    custom_fields JSONB DEFAULT '[]'::jsonb NOT NULL, -- Format: [{"id": "field_id", "label": "T-Shirt Size", "type": "select", "options": ["S", "M", "L", "XL"]}]
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'DRAFT')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- DROP existing policies to avoid duplicates
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
DROP POLICY IF EXISTS "Organizers can insert events" ON public.events;
DROP POLICY IF EXISTS "Organizers can update their own events" ON public.events;
DROP POLICY IF EXISTS "Organizers can delete their own events" ON public.events;

-- 2a. Events SELECT Policy: Visible to everyone
CREATE POLICY "Events are viewable by everyone" 
ON public.events FOR SELECT 
USING (true);

-- 2b. Events INSERT Policy: Only authenticated organizers can insert events
CREATE POLICY "Organizers can insert events" 
ON public.events FOR INSERT 
WITH CHECK (
  auth.role() = 'authenticated' 
  AND auth.uid() = organizer_id 
  AND public.is_organizer(auth.uid())
);

-- 2c. Events UPDATE Policy: Only the event creator (if organizer) can update
CREATE POLICY "Organizers can update their own events" 
ON public.events FOR UPDATE 
USING (
  auth.role() = 'authenticated' 
  AND auth.uid() = organizer_id 
  AND public.is_organizer(auth.uid())
);

-- 2d. Events DELETE Policy: Only the event creator can delete
CREATE POLICY "Organizers can delete their own events" 
ON public.events FOR DELETE 
USING (
  auth.role() = 'authenticated' 
  AND auth.uid() = organizer_id 
  AND public.is_organizer(auth.uid())
);


-- ==========================================
-- 3. REGISTRATIONS TABLE & POLICIES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    custom_answers JSONB DEFAULT '{}'::jsonb NOT NULL, -- Format: {"field_id": "answer"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE (event_id, student_id)
);

-- Enable Row Level Security
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- DROP existing policies to avoid duplicates
DROP POLICY IF EXISTS "Students can view their own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Organizers can view registrations for their own events" ON public.registrations;
DROP POLICY IF EXISTS "Students can register for open events" ON public.registrations;

-- 3a. Registrations SELECT Policy: Students see their own, Organizers see their event registries
CREATE POLICY "Students can view their own registrations" 
ON public.registrations FOR SELECT 
USING (auth.uid() = student_id);

CREATE POLICY "Organizers can view registrations for their own events" 
ON public.registrations FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.events 
    WHERE events.id = registrations.event_id 
    AND events.organizer_id = auth.uid()
  )
);

-- 3b. Registrations INSERT Policy: Authenticated students can register for events
CREATE POLICY "Students can register for events" 
ON public.registrations FOR INSERT 
WITH CHECK (
  auth.role() = 'authenticated' 
  AND auth.uid() = student_id 
  AND public.is_student(auth.uid())
);


-- ==========================================
-- 4. PROFILE TRIGGER FOR SIGNUP
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, roll_number, branch, semester, phone, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'roll_number', ''),
    COALESCE(new.raw_user_meta_data->>'branch', ''),
    COALESCE(new.raw_user_meta_data->>'semester', ''),
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

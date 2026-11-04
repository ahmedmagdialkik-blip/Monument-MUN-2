-- =====================================================================
-- MONUMENT MODEL UNITED NATIONS 2027 — TEAM APPLICATIONS SCHEMA & RLS
-- Run this in your Supabase Project: SQL Editor -> New Query -> Run
-- =====================================================================

-- 1. Create team_applications table
CREATE TABLE IF NOT EXISTS public.team_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team TEXT NOT NULL CHECK (team IN ('volunteer', 'security')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT
);

-- Unique index to block duplicate applications for the same team from the same email
CREATE UNIQUE INDEX IF NOT EXISTS team_applications_email_team_idx 
ON public.team_applications (lower(trim(email)), team);

-- Index for speedy filtering on staff portal
CREATE INDEX IF NOT EXISTS team_applications_status_team_idx
ON public.team_applications (status, team, created_at DESC);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.team_applications ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if current authenticated user is staff (eb, head, security, admin)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('eb', 'head', 'security', 'admin')
  );
$$;

-- Helper function: Check if current authenticated user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- RLS Policy: Anyone can submit team applications (volunteer or security only; forced pending)
DROP POLICY IF EXISTS "Anyone can submit team applications" ON public.team_applications;
CREATE POLICY "Anyone can submit team applications"
ON public.team_applications
FOR INSERT
TO public
WITH CHECK (
  status = 'pending'
  AND team IN ('volunteer', 'security')
  AND length(trim(full_name)) > 0
  AND length(trim(email)) > 0
  AND length(trim(phone)) > 0
);

-- RLS Policy: Only signed-in staff (eb, head, security, admin) can SELECT team applications
DROP POLICY IF EXISTS "Only staff can view team applications" ON public.team_applications;
CREATE POLICY "Only staff can view team applications"
ON public.team_applications
FOR SELECT
TO authenticated
USING (public.is_staff());

-- RLS Policy: Only signed-in staff can UPDATE team applications (accept or deny)
DROP POLICY IF EXISTS "Only staff can update team applications" ON public.team_applications;
CREATE POLICY "Only staff can update team applications"
ON public.team_applications
FOR UPDATE
TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 3. ENFORCE DELEGATE PERMISSIONS ON REGISTRATIONS TABLE
-- Staff must NOT be able to accept or deny delegate applications.
-- Only admins keep the right to accept or reject delegates.
ALTER TABLE IF EXISTS public.registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can update registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admins and staff can update registrations" ON public.registrations;
DROP POLICY IF EXISTS "Only admins can update registrations" ON public.registrations;

CREATE POLICY "Only admins can update registrations"
ON public.registrations
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Staff and admins may still view delegate registrations
DROP POLICY IF EXISTS "Staff and admins can view registrations" ON public.registrations;
CREATE POLICY "Staff and admins can view registrations"
ON public.registrations
FOR SELECT
TO authenticated
USING (public.is_staff());

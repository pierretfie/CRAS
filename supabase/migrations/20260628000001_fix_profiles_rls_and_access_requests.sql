-- Fix 1: Allow all authenticated users to read any profile (name, department).
-- Previously "auth.uid() = id" meant users could only read their own profile,
-- which broke the AccessRequestManager (owner couldn't see the requester's name)
-- and any other peer-to-peer lookup.
-- Sensitive fields (email, must_change_password) are not exposed in the UI.
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (true);  -- every authenticated user can read any profile row
                 -- the UI only ever shows name + department to peers

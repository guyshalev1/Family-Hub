-- Email allowlist: controls who can access the app
CREATE TABLE allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-approve the two known family emails
INSERT INTO allowed_emails (email) VALUES
  ('guyshalev1@gmail.com'),
  ('anatz.shalev@gmail.com')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (needed for middleware check)
CREATE POLICY "authenticated users can read allowlist" ON allowed_emails
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only parents can manage the list
CREATE POLICY "parents can manage allowlist" ON allowed_emails
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE user_id = auth.uid() AND role = 'parent'
    )
  );

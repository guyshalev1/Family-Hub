-- Families
CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('parent', 'child')) DEFAULT 'child',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Google accounts (for Calendar API)
CREATE TABLE google_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly schedules
CREATE TABLE weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  status TEXT CHECK (status IN ('home', 'school', 'vacation')) DEFAULT 'home',
  UNIQUE(member_id, day_of_week)
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES members(id),
  due_date DATE,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'done')) DEFAULT 'pending',
  type TEXT CHECK (type IN ('homework', 'chore', 'appointment', 'other')) DEFAULT 'other',
  created_by UUID REFERENCES auth.users(id),
  gcal_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task activity log
CREATE TABLE task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tasks_family_id ON tasks(family_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_members_family_id ON members(family_id);
CREATE INDEX idx_members_user_id ON members(user_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);

-- Row Level Security
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper: get family_id for current user
CREATE OR REPLACE FUNCTION get_user_family_id()
RETURNS UUID AS $$
  SELECT family_id FROM members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- RLS Policies
CREATE POLICY "family members can view their family" ON families
  FOR SELECT USING (id = get_user_family_id());

CREATE POLICY "family members can view members" ON members
  FOR SELECT USING (family_id = get_user_family_id());

CREATE POLICY "parents can manage members" ON members
  FOR ALL USING (
    family_id = get_user_family_id() AND
    EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND role = 'parent')
  );

CREATE POLICY "users manage own google account" ON google_accounts
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "family members can view schedules" ON weekly_schedules
  FOR SELECT USING (family_id = get_user_family_id());

CREATE POLICY "parents can manage schedules" ON weekly_schedules
  FOR ALL USING (
    family_id = get_user_family_id() AND
    EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND role = 'parent')
  );

CREATE POLICY "family members can view tasks" ON tasks
  FOR SELECT USING (family_id = get_user_family_id());

CREATE POLICY "family members can manage tasks" ON tasks
  FOR ALL USING (family_id = get_user_family_id());

CREATE POLICY "family members can view activity" ON task_activity
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks WHERE id = task_id AND family_id = get_user_family_id())
  );

CREATE POLICY "users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid() OR family_id = get_user_family_id());

CREATE POLICY "users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Smart assignment suggestion function
CREATE OR REPLACE FUNCTION suggest_task_assignee(p_family_id UUID, p_due_date DATE)
RETURNS UUID AS $$
DECLARE
  v_day_of_week INT;
  v_member_id UUID;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_due_date);

  -- Find member who is home on that day with fewest tasks
  SELECT m.id INTO v_member_id
  FROM members m
  LEFT JOIN weekly_schedules ws ON ws.member_id = m.id AND ws.day_of_week = v_day_of_week
  LEFT JOIN tasks t ON t.assigned_to = m.id AND t.due_date = p_due_date AND t.status != 'done'
  WHERE m.family_id = p_family_id
    AND (ws.status = 'home' OR ws.status IS NULL)
  GROUP BY m.id
  ORDER BY COUNT(t.id) ASC
  LIMIT 1;

  RETURN v_member_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

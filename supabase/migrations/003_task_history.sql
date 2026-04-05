-- Add 'deleted' status to tasks (soft delete)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'deleted'));

-- Task status history log
CREATE TABLE IF NOT EXISTS task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members can view task history" ON task_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN members m ON m.family_id = t.family_id
      WHERE t.id = task_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "family members can insert task history" ON task_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN members m ON m.family_id = t.family_id
      WHERE t.id = task_id AND m.user_id = auth.uid()
    )
  );

-- Allow service role to insert history (for cron jobs)
CREATE POLICY "service role can manage task history" ON task_history
  FOR ALL USING (true);

-- Calendar incremental sync token (avoids full re-scan on every cron run)
ALTER TABLE google_accounts
  ADD COLUMN IF NOT EXISTS calendar_sync_token TEXT;

-- WhatsApp last poll timestamp
ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ;

-- Index for history lookups
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

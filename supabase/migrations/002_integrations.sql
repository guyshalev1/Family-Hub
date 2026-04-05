-- WhatsApp connections per user (via Green API)
CREATE TABLE whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL,
  api_token TEXT NOT NULL,
  phone_number TEXT,
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- WhatsApp groups to monitor per connection
CREATE TABLE whatsapp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,  -- WhatsApp chat ID (ends with @g.us)
  group_name TEXT NOT NULL,
  is_monitored BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, group_id)
);

-- Add source and external_id to tasks for deduplication
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('manual', 'calendar', 'whatsapp')) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Add calendar pull tracking to google_accounts
ALTER TABLE google_accounts
  ADD COLUMN IF NOT EXISTS last_calendar_pull TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT true;

-- Indexes
CREATE INDEX idx_tasks_external_id ON tasks(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_whatsapp_connections_user ON whatsapp_connections(user_id);
CREATE INDEX idx_whatsapp_groups_connection ON whatsapp_groups(connection_id);

-- RLS
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own whatsapp connection" ON whatsapp_connections
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "users manage own whatsapp groups" ON whatsapp_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM whatsapp_connections
      WHERE id = connection_id AND user_id = auth.uid()
    )
  );

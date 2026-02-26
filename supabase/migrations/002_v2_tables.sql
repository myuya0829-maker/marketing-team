-- 002_v2_tables.sql
-- Marketing Team AI v2 - Schema Extensions
-- Adds client management, projects, reports, messages, templates, recurring tasks, archives

-- ======================
-- クライアント
-- ======================
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  name TEXT NOT NULL,
  url TEXT,
  services JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- 案件（プロジェクト）
-- ======================
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  name TEXT NOT NULL,
  category TEXT,
  services JSONB DEFAULT '["SEO"]',
  tasks JSONB DEFAULT '[]',
  memos JSONB DEFAULT '[]',
  article_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- レポート
-- ======================
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  task_title TEXT,
  client_name TEXT,
  final_output TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- メッセージスタイル
-- ======================
CREATE TABLE IF NOT EXISTS msg_styles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  target TEXT NOT NULL,
  styles JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, target)
);

-- ======================
-- テンプレート
-- ======================
CREATE TABLE IF NOT EXISTS templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  client_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- 定期タスク
-- ======================
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  name TEXT NOT NULL,
  project TEXT,
  estimate_sec INT DEFAULT 1800,
  day_of_week INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- アーカイブ済みタスク
-- ======================
CREATE TABLE IF NOT EXISTS archived_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  link_id TEXT,
  title TEXT,
  client_name TEXT,
  project_name TEXT,
  completed_at TIMESTAMPTZ,
  result TEXT,
  original_data JSONB,
  archived_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- tasks テーブルにv2カラム追加
-- ======================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='project') THEN
    ALTER TABLE tasks ADD COLUMN project TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='task_type') THEN
    ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'daily';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='assignee') THEN
    ALTER TABLE tasks ADD COLUMN assignee TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='deadline') THEN
    ALTER TABLE tasks ADD COLUMN deadline TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='deadline_time') THEN
    ALTER TABLE tasks ADD COLUMN deadline_time TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='memo') THEN
    ALTER TABLE tasks ADD COLUMN memo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='ball_holder') THEN
    ALTER TABLE tasks ADD COLUMN ball_holder TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='subtasks') THEN
    ALTER TABLE tasks ADD COLUMN subtasks JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='link_id') THEN
    ALTER TABLE tasks ADD COLUMN link_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='client_name') THEN
    ALTER TABLE tasks ADD COLUMN client_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='status') THEN
    ALTER TABLE tasks ADD COLUMN status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='month') THEN
    ALTER TABLE tasks ADD COLUMN month TEXT;
  END IF;
END $$;

-- ======================
-- インデックス
-- ======================
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(user_id, task_type);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_archived_user ON archived_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_tasks(user_id);

-- 001_initial.sql
-- Marketing Team AI - Initial Schema
-- 認証なし版: user_id は固定値 'anonymous' を使用
-- Supabase Auth 導入後に UUID REFERENCES auth.users に変更予定

-- ======================
-- エージェントルール
-- ======================
CREATE TABLE IF NOT EXISTS agent_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  agent_id TEXT NOT NULL,
  rules TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

-- ======================
-- 知見（ナレッジベース）
-- ======================
CREATE TABLE IF NOT EXISTS knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  assigned_agents JSONB DEFAULT '["all"]',
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- フィードバック
-- ======================
CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  task_title TEXT,
  client_name TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  good TEXT,
  bad TEXT,
  lesson TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- タスク（日次管理）
-- ======================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  task_date DATE NOT NULL,
  name TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  estimate_sec INT DEFAULT 1800,
  elapsed_sec INT DEFAULT 0,
  timer_running BOOLEAN DEFAULT false,
  timer_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- ジョブ（AI実行タスク）
-- ======================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  task TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  plan JSONB,
  result JSONB,
  chat JSONB DEFAULT '[]',
  phase TEXT,
  current_step INT,
  outputs JSONB DEFAULT '[]',
  web_search BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- 設定
-- ======================
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous' UNIQUE,
  netlify_url TEXT,
  gas_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- RLS ポリシー（認証導入時に有効化）
-- ======================
-- 現在は認証なしのため RLS は無効
-- ALTER TABLE agent_rules ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ======================
-- インデックス
-- ======================
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_rules_user ON agent_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);

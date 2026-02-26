-- 003_article_checker.sql
-- SEO記事チェックエージェント用スキーマ拡張

-- ======================
-- projectsテーブルにスプレッドシート関連カラム追加
-- ======================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='spreadsheet_url') THEN
    ALTER TABLE projects ADD COLUMN spreadsheet_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='site_url') THEN
    ALTER TABLE projects ADD COLUMN site_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='sheet_name') THEN
    ALTER TABLE projects ADD COLUMN sheet_name TEXT DEFAULT 'シート1';
  END IF;
END $$;

-- ======================
-- 記事チェック結果テーブル
-- ======================
CREATE TABLE IF NOT EXISTS article_check_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  project_name TEXT NOT NULL,
  keyword TEXT NOT NULL,
  title TEXT,
  doc_url TEXT,
  month TEXT,
  article_type TEXT DEFAULT '新規',
  -- ファクトチェック結果
  factcheck_critical INT DEFAULT 0,
  factcheck_warning INT DEFAULT 0,
  factcheck_info INT DEFAULT 0,
  factcheck_detail TEXT,
  -- 最終チェック結果
  finalcheck_typos INT DEFAULT 0,
  finalcheck_verdict TEXT,  -- 'GO' or 'NO_GO'
  finalcheck_detail TEXT,
  -- コメント挿入
  comments_inserted INT DEFAULT 0,
  -- メタ
  status TEXT DEFAULT 'pending',  -- pending/checking/done/error
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================
-- インデックス
-- ======================
CREATE INDEX IF NOT EXISTS idx_acr_user ON article_check_results(user_id);
CREATE INDEX IF NOT EXISTS idx_acr_project ON article_check_results(user_id, project_name);
CREATE INDEX IF NOT EXISTS idx_acr_month ON article_check_results(user_id, month);

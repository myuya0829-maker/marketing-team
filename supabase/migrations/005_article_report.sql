-- 005_article_report.sql
-- Phase K/L: 記事管理シート + レポート管理シート 同期用カラム追加
-- 2026-04-10
--
-- task_type 拡張:
--   'article' : 記事管理シート由来 (view-only, sheet が真実)
--   'report'  : レポート管理シート由来 (Stack 編集可、EOD writeback 想定)
--
-- 全カラム nullable・既存データへの影響ゼロ。

DO $$
BEGIN
  -- 記事管理: KW (タスク名は施策と同じ name 列を使う)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='kw') THEN
    ALTER TABLE tasks ADD COLUMN kw TEXT;
  END IF;

  -- 記事管理: 構成案 URL
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='outline_url') THEN
    ALTER TABLE tasks ADD COLUMN outline_url TEXT;
  END IF;

  -- 記事管理: 記事 URL
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='article_url') THEN
    ALTER TABLE tasks ADD COLUMN article_url TEXT;
  END IF;

  -- 記事管理: 構成指示
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='outline_instructions') THEN
    ALTER TABLE tasks ADD COLUMN outline_instructions TEXT;
  END IF;

  -- レポート管理: 4 ステージ (データ取得 / レポート生成 / レビュー / 送信)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='report_data') THEN
    ALTER TABLE tasks ADD COLUMN report_data TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='report_gen') THEN
    ALTER TABLE tasks ADD COLUMN report_gen TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='report_review_url') THEN
    ALTER TABLE tasks ADD COLUMN report_review_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='report_send') THEN
    ALTER TABLE tasks ADD COLUMN report_send TEXT;
  END IF;

  -- レポート備考
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='report_note') THEN
    ALTER TABLE tasks ADD COLUMN report_note TEXT;
  END IF;
END $$;

-- インデックス: task_type で絞り込みが多いので
CREATE INDEX IF NOT EXISTS idx_tasks_type_user ON tasks(user_id, task_type) WHERE task_type IN ('article', 'report');

-- 004_sheet_sync.sql
-- Stack ← 施策管理シート 同期用カラム追加
-- 2026-04-10 Phase E-I (Stage 1: Sheet → Supabase 一方向同期)
--
-- 追加カラムは全て nullable・既存データへの影響ゼロ。
-- task_type の値規約:
--   'daily'        : 既存の日次タスク (デフォルト)
--   'sheet'        : 施策管理シートから同期されたタスク (new)
--   'sheet_orphan' : シートから削除された孤児タスク (論理削除, new)

DO $$
BEGIN
  -- 自然キー: "{月}::{クライアント名}::{施策内容}" のハッシュ化前の生値
  -- シートで名前変更 = 別タスク扱い (シンプルな運用ルール)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='sheet_key') THEN
    ALTER TABLE tasks ADD COLUMN sheet_key TEXT;
  END IF;

  -- 現在のシート行番号 (参考値、変動する)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='sheet_row_num') THEN
    ALTER TABLE tasks ADD COLUMN sheet_row_num INT;
  END IF;

  -- 最後に sync した時刻 (orphan 検出にも使用)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='sheet_synced_at') THEN
    ALTER TABLE tasks ADD COLUMN sheet_synced_at TIMESTAMPTZ;
  END IF;

  -- シート固有メタデータ (Stack 既存カラムにマッピング先がない列)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='sheet_category') THEN
    ALTER TABLE tasks ADD COLUMN sheet_category TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='sheet_priority') THEN
    ALTER TABLE tasks ADD COLUMN sheet_priority TEXT;
  END IF;

  -- シートの「出典」列 (既存の source 用カラムと混同しないよう明示)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='sheet_source_col') THEN
    ALTER TABLE tasks ADD COLUMN sheet_source_col TEXT;
  END IF;
END $$;

-- インデックス: sync 処理で大量に sheet_key と task_type で検索するため
CREATE INDEX IF NOT EXISTS idx_tasks_sheet_key ON tasks(user_id, sheet_key) WHERE sheet_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_sheet_synced ON tasks(user_id, task_type, sheet_synced_at) WHERE task_type IN ('sheet', 'sheet_orphan');

# マーケティングチーム管理システム — 移行ガイド

## プロジェクト概要

美容クリニック・医療機関向けマーケティングチームのAI業務管理システム。
現在 Claude.ai Artifact（単一 `.jsx`、約6,500行）で稼働中。
これを **Vite + React + Tailwind CSS** のプロジェクトに分割・移行する。

### 現在の技術スタック
- React（CDN経由、ビルドツールなし）
- 単一ファイル: `marketing-team.jsx`（約6,500行、500KB超）
- ストレージ: `window.storage`（Claude Artifact専用API）
- AI API: Anthropic Messages API（直接fetch）
- スタイル: inline style 1,300箇所超（テーマ変数 `T` 経由）
- ES5風の `var` / `function` 宣言（Artifact制約のため）

### 移行先スタック
- Vite + React 18
- Tailwind CSS v4
- Supabase（ストレージ・認証）
- Vercel or Netlify（デプロイ）

---

## ファイル分割計画

### ディレクトリ構成

```
marketing-team/
├── public/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── App.jsx              ← メインルーター・データロード
│   │   │   ├── NavBar.jsx           ← 下部ナビ・バックグラウンド通知
│   │   │   └── Toast.jsx            ← トースト通知
│   │   ├── daily/
│   │   │   ├── DailyView.jsx        ← 日次ビュー（メイン画面）
│   │   │   ├── TaskCard.jsx         ← タスクカード（タイマー付き）
│   │   │   ├── ProjTaskCard.jsx     ← 案件タスクカード
│   │   │   ├── DelegationCard.jsx   ← 依頼タスクカード
│   │   │   ├── InProgressCard.jsx   ← 進行中タスクカード
│   │   │   ├── TimerButton.jsx      ← ▶/⏸ タイマーボタン
│   │   │   ├── TaskAddForm.jsx      ← タスク追加フォーム（1件・まとめて）
│   │   │   ├── TaskEditPanel.jsx    ← タスク編集パネル
│   │   │   └── StatsBar.jsx         ← 日次統計（完了数・作業時間）
│   │   ├── workspace/
│   │   │   ├── WorkspaceView.jsx    ← AI実行ワークスペース（最重要）
│   │   │   ├── JobCard.jsx          ← ジョブカード
│   │   │   ├── PlanDisplay.jsx      ← プラン表示・承認UI
│   │   │   ├── ResultDisplay.jsx    ← 実行結果表示
│   │   │   ├── ChatInterface.jsx    ← 完了後チャットUI
│   │   │   └── FileUpload.jsx       ← 📎ファイルアップロード
│   │   ├── tasks/
│   │   │   ├── TaskManagementView.jsx  ← フルタスク管理
│   │   │   ├── MonthlyCalendar.jsx     ← 月間カレンダー
│   │   │   ├── RecurringTasks.jsx      ← 繰返しタスク管理
│   │   │   ├── SubtaskList.jsx         ← サブタスク一覧（期限付き）
│   │   │   └── ArticleTracker.jsx      ← 記事管理
│   │   ├── clients/
│   │   │   ├── ClientDashboardView.jsx ← クライアント管理
│   │   │   ├── ClientDetail.jsx        ← クライアント詳細
│   │   │   ├── ProjectPanel.jsx        ← 案件パネル
│   │   │   └── ArchiveExportPanel.jsx  ← アーカイブ・エクスポート
│   │   ├── knowledge/
│   │   │   ├── KnowledgeView.jsx       ← 知見管理
│   │   │   └── KnowledgeCard.jsx       ← 知見カード（ExpandCard）
│   │   ├── settings/
│   │   │   └── SettingsView.jsx        ← 設定・エージェントルール
│   │   ├── messages/
│   │   │   └── MessageComposerView.jsx ← メッセージ作成
│   │   └── ui/
│   │       ├── Card.jsx
│   │       ├── Btn.jsx
│   │       └── AgentAvatar.jsx
│   ├── hooks/
│   │   ├── useStorage.js       ← Supabase CRUD（旧 storeGet/storeSet）
│   │   ├── useTasks.js         ← タスクCRUD・タイマーロジック
│   │   ├── useJobs.js          ← ジョブ管理・実行状態
│   │   ├── useProjects.js      ← 案件管理
│   │   ├── useClients.js       ← クライアント管理
│   │   ├── useTimer.js         ← タイマーロジック（interval管理）
│   │   └── useSync.js          ← タスク同期（syncTaskStatus）
│   ├── lib/
│   │   ├── api.js              ← callAPI / Anthropic API呼び出し
│   │   ├── agents.js           ← AGENTSデータ・buildAgentSys
│   │   ├── constants.js        ← テーマ(T)、ストレージキー(SK)、カテゴリ(KCATS)
│   │   ├── prompts.js          ← PM/エージェント用プロンプト構築
│   │   ├── knowledge.js        ← buildKnowledgeIndex / buildAgentSysFiltered
│   │   ├── dates.js            ← 日付ヘルパー群
│   │   ├── format.js           ← truncate, fmtDate, makeStars, fmtSec等
│   │   └── migration.js        ← 旧キーからの移行ロジック
│   ├── contexts/
│   │   └── AppContext.jsx      ← グローバル状態（agents, knowledge等）
│   └── main.jsx
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
├── package.json
├── vite.config.js
├── tailwind.config.js
└── .env
```

---

## 現ファイルの構造マッピング

### 行番号 → コンポーネント対応表

| 行範囲 | 現在の関数/セクション | 移行先ファイル |
|---------|----------------------|---------------|
| 1-13 | テーマ定数 `T` | `lib/constants.js` |
| 15-37 | ストレージキー `SK`、旧キー | `lib/constants.js` |
| 39-65 | KCATS, AGENTS | `lib/constants.js`, `lib/agents.js` |
| 68-71 | REPORT_FRAMEWORK | `lib/agents.js` |
| 76-100 | storeGet/storeSet/migrateKey | `hooks/useStorage.js` |
| 101-175 | ヘルパー関数群 | `lib/dates.js`, `lib/format.js` |
| 160-265 | buildAgentSys, buildKnowledgeIndex | `lib/knowledge.js` |
| 277-296 | Toast, AgentAvatar, Card, Btn | `components/ui/` |
| 298-3226 | **TaskManagementView** (2,900行) | `components/tasks/` 全体 |
| 3227-3492 | **KnowledgeView** | `components/knowledge/` |
| 3493-4489 | **WorkspaceView** (1,000行) | `components/workspace/` 全体 |
| 4490-4536 | ExpandCard | `components/knowledge/KnowledgeCard.jsx` |
| 4537-5293 | **ClientDashboardView** | `components/clients/` 全体 |
| 5294-5419 | ArchiveExportPanel | `components/clients/ArchiveExportPanel.jsx` |
| 5420-5622 | **SettingsView** | `components/settings/SettingsView.jsx` |
| 5623-5801 | **MessageComposerView** | `components/messages/MessageComposerView.jsx` |
| 5802-6568 | **MarketingTeamAI**（App） | `components/layout/App.jsx` |

---

## データモデル（Supabase テーブル設計）

### 現在のストレージキーとデータ形式

```
SK.agents     → "mkt-team:agents"       → { [agentId]: rulesString }
SK.knowledge  → "mkt-team:knowledge"    → [ { id, cat, title, content, agentId?, createdAt } ]
SK.feedbacks  → "mkt-team:feedbacks"    → [ { id, taskTitle, clientName, rating, good, bad, lesson, createdAt } ]
SK.tasks      → "mkt-team:tasks"        → { [dateKey]: [...tasks], __delegations: [...], __inprog: [...] }
SK.reports    → "mkt-team:reports"       → [ { id, title, content, createdAt, clientName? } ]
SK.clients    → "mkt-team:clients"      → [ { id, name, industry?, note? } ]
SK.projects   → "mkt-team:projects"     → [ { id, name, clientId, siteUrl?, tasks: [...], status } ]
SK.jobs       → "mkt-team:jobs"         → [ { id, task, status, plan, result, chat, attachments, ... } ]
SK.msgStyles  → "mkt-team:msg-styles"   → { [key]: styleConfig }
SK.templates  → "mkt-team:templates"    → [ { id, name, content, category } ]
SK.recurring  → "mkt-team:recurring"    → [ { id, text, interval, projectId?, lastGen, nextGen } ]
SK.archivedTasks → "mkt-team:archived-tasks" → [ { linkId, title, clientName, archivedAt, ... } ]
SK.netlifyUrl → "mkt-team:netlify-url"  → string (URL)
SK.gasUrl     → "mkt-team:gas-url"      → string (URL)
```

### Supabase テーブル案

```sql
-- 001_initial.sql

-- ユーザー（Supabase Auth連携）
-- auth.users は Supabase が自動管理

-- エージェントルール（ユーザーごとのカスタマイズ）
CREATE TABLE agent_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  agent_id TEXT NOT NULL,        -- 'pm', 'seo', 'director' etc.
  rules TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

-- 知見（ナレッジベース）
CREATE TABLE knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL,         -- KCATS.id
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_id TEXT,                   -- 紐づくエージェント
  source TEXT,                     -- 'manual' | 'feedback' | 'auto'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- フィードバック
CREATE TABLE feedbacks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  task_title TEXT,
  client_name TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  good TEXT,
  bad TEXT,
  lesson TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- クライアント
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- プロジェクト（案件）
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  client_id UUID REFERENCES clients,
  name TEXT NOT NULL,
  site_url TEXT,
  status TEXT DEFAULT 'active',    -- 'active' | 'completed' | 'archived'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- タスク（日次・依頼・進行中すべて統合）
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  link_id TEXT,                    -- 同期用の一意ID
  task_date DATE NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  project_id UUID REFERENCES projects,
  client_name TEXT,
  task_type TEXT DEFAULT 'daily',  -- 'daily' | 'delegation' | 'inprog' | 'project'
  subtasks JSONB DEFAULT '[]',     -- [{id, text, done, deadline?}]
  elapsed_sec INT DEFAULT 0,       -- タイマー実績
  timer_running BOOLEAN DEFAULT false,
  timer_started_at TIMESTAMPTZ,
  ball_holder TEXT,                 -- 依頼タスク: 'self' | 'other'
  deadline TIMESTAMPTZ,
  memo TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ジョブ（AI実行タスク）
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  task TEXT NOT NULL,
  status TEXT DEFAULT 'idle',      -- idle/planning/clarification/user_review/executing/done/error
  plan JSONB,
  result JSONB,
  chat JSONB DEFAULT '[]',
  phase TEXT,
  current_step INT,
  outputs JSONB DEFAULT '[]',
  web_search BOOLEAN DEFAULT false,
  project_id UUID REFERENCES projects,
  client_name TEXT,
  site_url TEXT,
  attachments JSONB DEFAULT '[]',  -- [{name, type, base64}] ← base64は一時的
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- レポート
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  client_name TEXT,
  project_id UUID REFERENCES projects,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- メッセージスタイル
CREATE TABLE msg_styles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- テンプレート
CREATE TABLE templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 繰返しタスク
CREATE TABLE recurring_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  text TEXT NOT NULL,
  interval TEXT NOT NULL,          -- 'daily' | 'weekday' | 'weekly' | 'monthly'
  project_id UUID REFERENCES projects,
  last_generated DATE,
  next_generate DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- アーカイブ
CREATE TABLE archived_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  link_id TEXT,
  title TEXT,
  client_name TEXT,
  project_name TEXT,
  result TEXT,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

-- 設定
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users UNIQUE NOT NULL,
  netlify_url TEXT,
  gas_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS ポリシー（全テーブル共通パターン）
ALTER TABLE knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own data" ON knowledge
  FOR ALL USING (auth.uid() = user_id);
-- ↑ 全テーブルに同様のポリシーを適用
```

---

## 重要な実装パターン

### 1. AI API 呼び出し（`lib/api.js`）

```javascript
// 現在の実装（line 142-158）
// AbortController + 120秒タイムアウト
// モデル: claude-sonnet-4-5-20250929（メイン）
//        claude-haiku-4-5-20251001（軽量判定用）

export async function callAPI(sys, msgs, maxTok = 4000, useSearch = false) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  
  const body = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTok,
    system: sys,
    messages: msgs,
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    return data.content?.map(c => c.text || "").join("\n") || "エラー";
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") return "エラー: タイムアウト（120秒）";
    return "エラー: " + e.message;
  }
}
```

**注意**: 移行後は Supabase Edge Functions 経由でAPI呼び出しするのが理想（APIキーをクライアントに露出しない）。ただし初期段階では現在と同じ直接呼び出しでもOK。

### 2. ワークフロー実行（最重要ロジック）

WorkspaceView 内の `processJob` は以下のフローで動く：

```
1. PM計画 (planning)
   └→ 確認事項あり → clarification → ユーザー回答 → 再計画
   └→ 確認事項なし → プラン提示
2. ユーザー承認 (user_review)
   └→ 修正依頼 → PM再計画
   └→ 承認 → 実行開始
3. 各エージェント実行 (executing)
   └→ アサインされたエージェント順次実行
   └→ クライアント目線レビュー
   └→ ユーザー目線レビュー
   └→ ディレクターレビュー
   └→ ファクトチェック
   └→ ディスカッション
   └→ 最終成果物作成
   └→ 最終検証（hallucination check）
4. 完了 (done)
   └→ チャットで追加質問可能
```

**各ステップの詳細は元ファイルの line 3667-3930 を参照。**

### 3. タスク同期（`syncTaskStatus`）

3つのシステム間でタスク完了状態を同期:
- タスク管理（日次タスク）
- タスク管理（依頼タスク `__delegations`）
- プロジェクトタスク（`projects[].tasks`）

`linkId` で横串検索し、一箇所で完了したら全箇所に反映。

### 4. 知見システム

```javascript
// buildKnowledgeIndex: ローカル知見 + Netlify外部知見をマージ
// buildAgentSysFiltered: エージェントに関連知見のみ注入
// 知見カテゴリ（KCATS）: 業界知識, 用語, 医療, SEO, 社内ルール, 文章スタイル等
```

### 5. バックグラウンド実行

現在は `display: none` でWorkspaceViewを常時マウントして実現。
移行後は状態管理（Context or Zustand）で実行状態を保持すればよい。

---

## inline style → Tailwind 変換ガイド

### テーマ変数 T の対応

```
T.bg       "#0A0E1A"     → bg-[#0A0E1A]  or カスタムカラー定義
T.bgCard   "#111827"     → bg-gray-900
T.text     "#F1F5F9"     → text-slate-100
T.textDim  "#94A3B8"     → text-slate-400
T.textMuted "#64748B"    → text-slate-500
T.accent   "#3B82F6"     → text-blue-500 / bg-blue-500
T.success  "#10B981"     → text-emerald-500
T.warning  "#F59E0B"     → text-amber-500
T.error    "#EF4444"     → text-red-500
T.border   "#1E293B"     → border-slate-800
T.radius   "12px"        → rounded-xl
T.radiusSm "8px"         → rounded-lg
T.font     'Noto Sans JP' → font-sans (tailwind.config.jsで定義)
```

### tailwind.config.js

```javascript
export default {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Noto Sans JP'", "-apple-system", "sans-serif"],
      },
      colors: {
        app: {
          bg: "#0A0E1A",
          card: "#111827",
          hover: "#1A2236",
          input: "#0D1220",
          border: "#1E293B",
          "border-focus": "#3B82F6",
          "border-subtle": "#162032",
          glass: "rgba(17,24,39,0.85)",
          overlay: "rgba(0,0,0,0.6)",
        }
      }
    }
  }
}
```

---

## 移行手順（Claude Code 用ステップバイステップ）

### Phase 1: プロジェクト初期化

```bash
npm create vite@latest marketing-team -- --template react
cd marketing-team
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install @supabase/supabase-js
```

### Phase 2: 定数・ヘルパー抽出（まず動かないコードを移す）

1. `src/lib/constants.js` ← T, SK, KCATS, AGENTS, REPORT_FRAMEWORK
2. `src/lib/dates.js` ← todayKey, dateLabel, dlDate, dlTime, dlJoin, toISO, fmtDateInput, curMonth, monthLabel, prevMonthKey, nextMonthKey, toMMDD, toShortDate
3. `src/lib/format.js` ← truncate, fmtDate, makeStars, fmtSec, stripHtml, parseJSON
4. `src/lib/agents.js` ← buildAgentSys, buildAgentSysFiltered, buildKnowledgeIndex
5. `src/lib/api.js` ← callAPI
6. `src/lib/prompts.js` ← プロンプト構築ロジック（planPrompt, revPrompt等）

### Phase 3: UIコンポーネント抽出

1. `src/components/ui/` ← Toast, AgentAvatar, Card, Btn
2. 各ビューを順番に抽出（小さいものから）:
   - MessageComposerView（180行）
   - SettingsView（200行）
   - KnowledgeView（265行）
   - ClientDashboardView + ArchiveExportPanel（900行）
   - TaskManagementView（2,900行 → さらに分割）
   - WorkspaceView（1,000行 → さらに分割）

### Phase 4: 状態管理

1. `src/contexts/AppContext.jsx` で全グローバル状態を管理
2. 各コンポーネントは `useContext(AppContext)` で参照
3. 将来的には Zustand 等への移行も可能

### Phase 5: ストレージ移行

1. まず `useStorage.js` で `window.storage` 互換のラッパーを作る（ローカル動作確認用）
2. Supabase プロジェクト作成 → テーブル作成
3. `useStorage.js` を Supabase クライアントに差し替え
4. データ移行スクリプト（旧 window.storage → Supabase）

### Phase 6: デプロイ

```bash
# Vercel
npm i -g vercel
vercel

# 環境変数
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 特に注意すべき点

### 1. var → const/let 変換
現在すべて `var` で宣言。`const`/`let` に変換する際、スコープの違いに注意。特にループ内のクロージャ。

### 2. Object.assign → スプレッド構文
`Object.assign({}, obj, { key: val })` → `{ ...obj, key: val }`

### 3. function宣言 → アロー関数
`function(x) { return x; }` → `(x) => x`
ただし `this` を使っている箇所は注意（現在はなし）。

### 4. ジョブの attachments
`base64` フィールドはストレージ永続化時に除去される設計。ページリロード後は base64 なしになる。移行後は Supabase Storage にファイルを保存し、URLで参照する形にすべき。

### 5. バックアップ機能（line 5535-5575）
現在は `window.storage` のキープレフィックス `mkt-team:backup:` で管理。Supabase移行後は DB のバックアップ機能を使うか、エクスポート機能を別途実装。

### 6. GAS（Google Apps Script）連携
`gasUrl` にGASのWebアプリURLを設定し、メッセージ送信等で使用。この連携は移行後もそのまま維持可能。

### 7. Netlify知見同期
`netlifyUrl` から外部知見JSONを取得してマージする機能あり。移行後も同様に維持。

---

## 元ファイルの所在

ソースファイル `marketing-team.jsx` をこのリポジトリのルートに `legacy/marketing-team.jsx` として配置してください。
Claude Code は分割作業時にこのファイルを参照します。

---

## Claude Code への指示例

### 初回セットアップ
```
このリポジトリのlegacy/marketing-team.jsxを、MIGRATION-GUIDE.mdに従って
Vite + React + Tailwind CSSプロジェクトに分割してください。
Phase 2（定数・ヘルパー抽出）から始めてください。
```

### 個別修正
```
src/components/workspace/WorkspaceView.jsx の
processJob関数でタイムアウトエラーが出ます。
タイムアウトを180秒に延長してください。
```

### 機能追加
```
知見の自動保存機能を追加してください。
フィードバック送信時、lesson フィールドの内容を
自動的に knowledge テーブルに保存するようにしてください。
```

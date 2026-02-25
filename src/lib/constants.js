// Theme constants
export const T = {
  bg: "#0A0E1A",
  bgCard: "#111827",
  bgHover: "#1A2236",
  bgInput: "#0D1220",
  border: "#1E293B",
  borderFocus: "#3B82F6",
  borderSubtle: "#162032",
  text: "#F1F5F9",
  textDim: "#94A3B8",
  textMuted: "#64748B",
  accent: "#3B82F6",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  purple: "#A78BFA",
  cyan: "#22D3EE",
  green: "#4ADE80",
  glass: "rgba(17,24,39,0.85)",
  overlay: "rgba(0,0,0,0.6)",
  font: "'Noto Sans JP', -apple-system, sans-serif",
  radius: "12px",
  radiusSm: "8px",
  radiusXs: "6px",
  shadow: "0 4px 24px rgba(0,0,0,0.3)",
};

// Storage keys
export const SK = {
  agents: "mkt-team:agents-v3",
  knowledge: "mkt-team:knowledge-v4",
  feedbacks: "mkt-team:fb-v1",
  tasks: "mkt-team:tasks-v1",
  history: "mkt-team:history-v1",
};

// Migration keys
export const OLD_KNOWLEDGE_KEYS = ["mkt-team:knowledge-v3", "ai-emp:knowledge-v1"];
export const OLD_FEEDBACK_KEYS = ["mkt-team:feedbacks-v1", "ai-emp:feedbacks-v2"];

// Knowledge categories
export const KCATS = [
  { id: "rule", label: "社内ルール", icon: "📏", color: "#F87171" },
  { id: "term", label: "用語・定義", icon: "📖", color: "#FBBF24" },
  { id: "industry", label: "業界知識", icon: "🏢", color: "#60A5FA" },
  { id: "style", label: "文章スタイル", icon: "✍️", color: "#A78BFA" },
  { id: "medical", label: "医療・薬機法", icon: "⚕️", color: "#EF4444" },
  { id: "seo", label: "SEO・LLMO", icon: "🔍", color: "#10B981" },
  { id: "other", label: "その他", icon: "💡", color: "#34D399" },
];

export const getCat = (id) => KCATS.find((c) => c.id === id) || KCATS[6];

// Agent definitions
export const AGENTS = [
  { id: "pm", name: "PM", fullName: "プロジェクトマネージャー", icon: "👔", color: "#6366F1", role: "全体統括・タスク分析・アサイン・最終成果物の統合", defaultRules: "## PMの役割\n- タスクを分析し最適なチームメンバーをアサイン\n- 各メンバーへの具体的な指示を作成\n- 全アウトプットを統合して最終成果物を作成\n- 不要なメンバーにはアサインしない\n\n## アサイン判断\n- SEO関連→SEOマーケター\n- HP/LP→HP制作マーケター\n- LINE→LINEマーケター\n- 美容業界→美容マーケター\n- 医療系→医療広告GLチェッカー\n- 事実確認→ファクトチェッカー\n- 品質→ディレクター" },
  { id: "director", name: "ディレクター", fullName: "クオリティディレクター", icon: "🎯", color: "#EC4899", role: "品質チェック・整合性確認・改善提案", defaultRules: "## 役割\n- 各メンバーのアウトプットを横断レビュー\n- 正確性・実用性・整合性・独自性・読みやすさ\n- 具体的な改善提案\n- メンバー間の矛盾を指摘" },
  { id: "seo", name: "SEOマーケター", fullName: "SEOスペシャリスト", icon: "🔍", color: "#10B981", role: "SEO戦略・KW分析・記事構成・競合分析", defaultRules: "## 専門領域\n- KW調査・分析\n- 記事構成設計（LLMO対策）\n- 競合分析\n- E-E-A-T\n- LLMO構造" },
  { id: "hp", name: "HP制作マーケター", fullName: "Web制作スペシャリスト", icon: "🖥️", color: "#3B82F6", role: "HP/LP制作・UI/UX改善・CVR最適化", defaultRules: "## 専門領域\n- LP/HP構成設計\n- UI/UX改善\n- CVR最適化\n- CTA設計\n- モバイル最適化" },
  { id: "line", name: "LINEマーケター", fullName: "LINEスペシャリスト", icon: "💬", color: "#06D001", role: "LINE戦略・配信企画・シナリオ設計", defaultRules: "## 専門領域\n- LINE公式アカウント運用\n- 配信企画・文面作成\n- ステップ配信シナリオ\n- リッチメニュー\n- Lステップ/エルメ" },
  { id: "beauty", name: "美容マーケター", fullName: "美容業界スペシャリスト", icon: "💄", color: "#F472B6", role: "美容業界トレンド・施策提案", defaultRules: "## 専門領域\n- トレンド分析\n- ペルソナ設計\n- 集客施策\n- 競合差別化\n- 価格戦略" },
  { id: "medical", name: "医療広告GLチェッカー", fullName: "医療広告GLチェッカー", icon: "⚕️", color: "#EF4444", role: "薬機法・医療広告GL遵守チェック", defaultRules: "## チェック項目\n- 薬機法: 効果表現→期待表現\n- 安全表現→リスク併記\n- 自由診療: 費用・リスク明記\n- 体験談の効果保証禁止\n- 不当比較禁止" },
  { id: "factcheck", name: "ファクトチェッカー", fullName: "ファクトチェッカー", icon: "✅", color: "#F59E0B", role: "事実検証・データ正確性確認", defaultRules: "## 信頼性ランク\n- A: 政府機関\n- B: 学会\n- C: 企業公式\n- D: 大手メディア\n- E: 個人ブログ（不適切）" },
];

// Workflow phases
export const PHASES = [
  { id: "idle", label: "待機中", icon: "⏸" },
  { id: "planning", label: "PM分析中", icon: "🧠" },
  { id: "user_review", label: "承認待ち", icon: "👤" },
  { id: "executing", label: "実行中", icon: "⚡" },
  { id: "reviewing", label: "レビュー中", icon: "🔍" },
  { id: "discussing", label: "議論中", icon: "💬" },
  { id: "finalizing", label: "最終確認", icon: "✨" },
  { id: "complete", label: "完了", icon: "✅" },
];

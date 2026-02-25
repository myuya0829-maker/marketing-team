import { useState } from "react";
import { T } from "../../lib/constants";
import { useApp } from "../../contexts/AppContext";
import Btn from "../ui/Btn";
import Toast from "../ui/Toast";
import WorkspaceView from "../workspace/WorkspaceView";
import TaskManagementView from "../tasks/TaskManagementView";
import KnowledgeView from "../knowledge/KnowledgeView";
import TeamSettingsView from "../settings/SettingsView";

const TABS = [
  { id: "workspace", label: "🏢 ワークスペース" },
  { id: "task", label: "⏱ タスク管理" },
  { id: "learning", label: "📚 学習" },
  { id: "team", label: "👥 チーム設定" },
];

export default function MarketingTeamAI() {
  const [view, setView] = useState("workspace");
  const {
    agents,
    agentRules,
    knowledge,
    feedbacks,
    tasks,
    toast,
    loading,
    setToast,
    saveAgentRules,
    addKnowledge,
    deleteKnowledge,
    addFeedback,
    saveTasks,
  } = useApp();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: T.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.textMuted,
          fontFamily: T.font,
        }}
      >
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: `1px solid ${T.border}`,
          background: T.glass,
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          gap: 8,
          overflowX: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>🏢</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Marketing Team AI</span>
          <span
            style={{
              fontSize: 9,
              color: T.textMuted,
              padding: "2px 6px",
              borderRadius: 4,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
            }}
          >
            Opus 4.6
          </span>
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {TABS.map((t) => (
            <Btn
              key={t.id}
              variant={view === t.id ? "primary" : "ghost"}
              onClick={() => setView(t.id)}
              style={{ fontSize: 11, padding: "6px 10px", whiteSpace: "nowrap" }}
            >
              {t.label}
            </Btn>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "20px 24px", maxWidth: 900, width: "100%", margin: "0 auto" }}>
        {view === "workspace" && (
          <WorkspaceView
            agents={agents}
            agentRules={agentRules}
            knowledge={knowledge}
            feedbacks={feedbacks}
            onAddFeedback={addFeedback}
            onToast={(m) => setToast(m)}
          />
        )}
        {view === "task" && <TaskManagementView />}
        {view === "learning" && (
          <KnowledgeView knowledge={knowledge} onAdd={addKnowledge} onDelete={deleteKnowledge} agents={agents} />
        )}
        {view === "team" && (
          <TeamSettingsView
            agents={agents}
            agentRules={agentRules}
            knowledge={knowledge}
            feedbacks={feedbacks}
            onSaveRules={saveAgentRules}
          />
        )}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

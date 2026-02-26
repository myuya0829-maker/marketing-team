import { useState } from "react";
import { T } from "../../lib/constants";
import { useApp } from "../../contexts/AppContext";
import Toast from "../ui/Toast";
import WorkspaceView from "../workspace/WorkspaceView";
import TaskManagementView from "../tasks/TaskManagementView";
import ClientDashboardView from "../clients/ClientDashboardView";
import MessageComposerView from "../messages/MessageComposerView";
import SettingsView from "../settings/SettingsView";

const TABS = [
  { id: "workspace", label: "🏢 ワークスペース" },
  { id: "task", label: "⏱ タスク管理" },
  { id: "clients", label: "🏥 クライアント" },
  { id: "message", label: "✉️ メッセージ" },
  { id: "settings", label: "📚 ナレッジ・設定" },
];

export default function MarketingTeamAI() {
  const [view, setView] = useState("workspace");
  const {
    agents,
    agentRules,
    knowledge,
    feedbacks,
    toast,
    loading,
    setToast,
    addFeedback,
    bgJobLabel,
    pendingExec,
    clearPendingExec,
    handleTaskExecute,
  } = useApp();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontFamily: T.font }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", padding: "8px 16px",
        borderBottom: `1px solid ${T.border}`, background: T.glass, backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100, gap: 6, overflowX: "auto",
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, marginRight: 8, flexShrink: 0 }}>🏢 MKT AI</span>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {TABS.map((t) => {
            const isBg = t.id === "workspace" && view !== "workspace" && bgJobLabel;
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                padding: "6px 12px", fontSize: 11, fontWeight: view === t.id ? 600 : 400,
                color: view === t.id ? T.accent : T.textMuted,
                background: view === t.id ? T.accent + "12" : "transparent",
                border: "none", borderRadius: 6, cursor: "pointer", fontFamily: T.font,
                whiteSpace: "nowrap", transition: "all 0.15s", position: "relative",
              }}>
                {t.label}
                {isBg && <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: T.accent, animation: "pulse 1.5s infinite" }} />}
              </button>
            );
          })}
        </div>
        {view !== "workspace" && bgJobLabel && (
          <div onClick={() => setView("workspace")} style={{
            fontSize: 10, color: T.accent, cursor: "pointer", animation: "pulse 1.5s infinite",
            flexShrink: 0, padding: "3px 8px", background: T.accent + "10", borderRadius: 99,
          }}>
            ⚙️ {bgJobLabel}
          </div>
        )}
      </div>

      {/* Main content - workspace uses display:none/block to keep it mounted (preserves bg job state) */}
      <div style={{ flex: 1, padding: "12px 16px", maxWidth: 860, width: "100%", margin: "0 auto" }}>
        <div style={{ display: view === "workspace" ? "block" : "none" }}>
          <WorkspaceView
            agents={agents}
            agentRules={agentRules}
            knowledge={knowledge}
            feedbacks={feedbacks}
            onAddFeedback={addFeedback}
            onToast={(m) => setToast(m)}
          />
        </div>
        {view === "task" && <TaskManagementView />}
        {view === "clients" && <ClientDashboardView />}
        {view === "message" && <MessageComposerView />}
        {view === "settings" && <SettingsView />}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

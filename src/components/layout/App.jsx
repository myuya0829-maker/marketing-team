import { useState, useCallback } from "react";
import { T } from "../../lib/constants";
import { useApp } from "../../contexts/AppContext";
import Toast from "../ui/Toast";
import QuickTaskFab from "../ui/QuickTaskFab";
import SheetSyncBadge from "../ui/SheetSyncBadge";
import TaskManagementView from "../tasks/TaskManagementView";
import ClientDashboardView from "../clients/ClientDashboardView";
import SettingsView from "../settings/SettingsView";

const TABS = [
  { id: "task", label: "⏱ タスク管理" },
  { id: "clients", label: "🏥 クライアント" },
  { id: "settings", label: "⚙️ 設定" },
];

export default function Stack() {
  const [view, setView] = useState("task");
  const [initialClientName, setInitialClientName] = useState(null);
  const {
    toast,
    loading,
    loadError,
    reloadData,
    setToast,
  } = useApp();

  const navigateToClient = useCallback((clientName) => {
    setInitialClientName(clientName);
    setView("clients");
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontFamily: T.font }}>
        読み込み中...
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: T.font }}>
        <div style={{ fontSize: 16, color: T.error, fontWeight: 600 }}>⚠️ データの取得に失敗しました</div>
        <div style={{ fontSize: 13, color: T.textMuted }}>ネットワーク接続を確認してください</div>
        <button onClick={reloadData} style={{
          padding: "10px 24px", fontSize: 14, fontWeight: 600,
          background: T.accent, color: "#fff", border: "none",
          borderRadius: 8, cursor: "pointer", fontFamily: T.font,
        }}>
          再読み込み
        </button>
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
        <span style={{ fontSize: 15, fontWeight: 700, marginRight: 8, flexShrink: 0 }}>📚 Stack</span>
        <SheetSyncBadge />
        <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 4 }}>
          {TABS.map((t) => {
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                padding: "6px 12px", fontSize: 11, fontWeight: view === t.id ? 600 : 400,
                color: view === t.id ? T.accent : T.textMuted,
                background: view === t.id ? T.accent + "12" : "transparent",
                border: "none", borderRadius: 6, cursor: "pointer", fontFamily: T.font,
                whiteSpace: "nowrap", transition: "all 0.15s",
              }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "12px 16px", maxWidth: 860, width: "100%", margin: "0 auto" }}>
        {view === "task" && <TaskManagementView onNavigateToClient={navigateToClient} />}
        {view === "clients" && <ClientDashboardView initialClientName={initialClientName} onClearInitial={() => setInitialClientName(null)} />}
        {view === "settings" && <SettingsView />}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      <QuickTaskFab />
    </div>
  );
}

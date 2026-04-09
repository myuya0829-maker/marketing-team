import { useState, useEffect } from "react";
import { T } from "../../lib/constants";
import { todayKey } from "../../lib/dates";
import { toISO } from "../../lib/dates";
import { useApp } from "../../contexts/AppContext";
import { fetchTasksByType, fetchTasksByProject, fetchTaskCountsByClient, upsertProject, deleteProject as deleteProjectDb, insertTask as insertTaskDB, updateTask as updateTaskDb, deleteTask as deleteTaskDb } from "../../hooks/useStorage";
import Card from "../ui/Card";
import Btn from "../ui/Btn";

// ── Service category colors ──
const CAT_COLORS = {
  "制作": { color: "#3B82F6", bg: "#3B82F610", icon: "🖥️" },
  "SEO": { color: "#10B981", bg: "#10B98110", icon: "🔍" },
  "広告": { color: "#F59E0B", bg: "#F59E0B10", icon: "📢" },
  "LINE": { color: "#06D001", bg: "#06D00110", icon: "💬" },
};
const BALL_HOLDERS = [
  { id: "self", label: "自分", color: "#3B82F6" },
  { id: "worker", label: "作業者", color: "#22D3EE" },
  { id: "client", label: "クライアント", color: "#A855F7" },
  { id: "engineer", label: "エンジニア", color: "#F59E0B" },
  { id: "designer", label: "デザイナー", color: "#F472B6" },
];
const CAT_LIST = [
  { id: "all", label: "すべて", icon: "📋", color: "#9CA3AF" },
  { id: "制作", label: "制作", icon: "🖥️", color: "#3B82F6" },
  { id: "SEO", label: "SEO", icon: "🔍", color: "#10B981" },
  { id: "広告", label: "広告", icon: "📢", color: "#F59E0B" },
  { id: "LINE", label: "LINE", icon: "💬", color: "#06D001" },
];
const ART_STEPS = [
  { id: "kw_select", label: "KW選定", self: false },
  { id: "kw_review", label: "KW確認", self: true },
  { id: "structure", label: "構成作成", self: false },
  { id: "structure_review", label: "構成確認", self: true },
  { id: "writing", label: "執筆", self: false },
  { id: "writing_review", label: "執筆確認", self: true },
  { id: "submit", label: "コンテンツ提出", self: false },
];
const ART_STEP_IDS = ART_STEPS.map((s) => s.id);

// ── Archive Export Panel ──
function ArchiveExportPanel({ archivedTasks, projectFilter }) {
  const { setToast } = useApp();
  const [selectedMonth, setSelectedMonth] = useState("");
  const [showAll, setShowAll] = useState(false);

  const months = {};
  (archivedTasks || []).forEach((a) => {
    const d = (a.completedAt || a.archivedAt || "").slice(0, 7);
    if (d && (!projectFilter || a.projectName === projectFilter || a.clientName === projectFilter)) {
      months[d] = (months[d] || 0) + 1;
    }
  });
  const monthList = Object.keys(months).sort().reverse();
  const curSel = selectedMonth || (monthList.length > 0 ? monthList[0] : "");

  const filtered = (archivedTasks || []).filter((a) => {
    if (projectFilter && a.projectName !== projectFilter && a.clientName !== projectFilter) return false;
    if (curSel) return (a.completedAt || a.archivedAt || "").slice(0, 7) === curSel;
    return true;
  }).sort((a, b) => (a.completedAt || a.archivedAt || "") > (b.completedAt || b.archivedAt || "") ? 1 : -1);

  const exportCSV = () => {
    if (filtered.length === 0) { setToast("⚠️ エクスポートするタスクがありません"); return; }
    const header = "完了日\t案件名\tタスク内容\tアーカイブ日";
    const rows = filtered.map((a) => [
      (a.completedAt || "").slice(0, 10),
      a.projectName || a.clientName || "",
      (a.title || "").replace(/\t/g, " ").replace(/\n/g, " "),
      (a.archivedAt || "").slice(0, 10),
    ].join("\t"));
    navigator.clipboard.writeText(header + "\n" + rows.join("\n")).then(() => {
      setToast(`📋 ${filtered.length}件をコピーしました（スプレッドシートに貼り付けできます）`);
    });
  };

  const displayTasks = showAll ? filtered : filtered.slice(0, 20);

  return (
    <Card style={{ borderLeft: "4px solid #7C3AED", marginTop: 8 }}>
      <details>
        <summary style={{ fontSize: 14, fontWeight: 700, color: T.text, cursor: "pointer" }}>
          📦 {projectFilter ? "アーカイブ" : "全体アーカイブ"}（{(archivedTasks || []).length}件の実績）
        </summary>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={curSel} onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
              <option value="">全期間</option>
              {monthList.map((m) => <option key={m} value={m}>{m}（{months[m]}件）</option>)}
            </select>
            <Btn onClick={exportCSV} style={{ fontSize: 10, background: "#7C3AED", borderColor: "#7C3AED" }}>📋 スプシ用コピー</Btn>
            <span style={{ fontSize: 10, color: T.textMuted }}>絞り込み: {filtered.length}件</span>
          </div>
          {filtered.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: T.textMuted, fontWeight: 600, fontSize: 10 }}>完了日</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: T.textMuted, fontWeight: 600, fontSize: 10 }}>案件</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: T.textMuted, fontWeight: 600, fontSize: 10 }}>タスク</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTasks.map((a, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}44` }}>
                      <td style={{ padding: "5px 8px", color: T.textDim, whiteSpace: "nowrap" }}>{(a.completedAt || a.archivedAt || "").slice(0, 10)}</td>
                      <td style={{ padding: "5px 8px", color: T.primary }}>{a.projectName || a.clientName || "-"}</td>
                      <td style={{ padding: "5px 8px", color: T.text }}>{a.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 20 && !showAll && (
                <button onClick={() => setShowAll(true)} style={{ width: "100%", padding: 6, background: "none", border: `1px solid ${T.border}`, borderRadius: T.radiusXs, cursor: "pointer", fontSize: 10, color: T.textMuted, fontFamily: T.font, marginTop: 4 }}>
                  残り{filtered.length - 20}件を表示
                </button>
              )}
            </div>
          )}
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: "12px 0", color: T.textDim, fontSize: 12 }}>この期間のアーカイブはありません</div>}
        </div>
      </details>
    </Card>
  );
}

// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════
export default function ClientDashboardView({ initialClientName, onClearInitial }) {
  const {
    projects, archivedTasks,
    saveProjects, syncTaskStatus, archiveTask, setToast,
  } = useApp();

  const [selected, setSelected] = useState(null);

  // Auto-select client when navigated from another view
  useEffect(() => {
    if (initialClientName && projects.length > 0) {
      const match = projects.find((p) => p.name === initialClientName);
      if (match) setSelected(match.id);
      if (onClearInitial) onClearInitial();
    }
  }, [initialClientName, projects, onClearInitial]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [newTask, setNewTask] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newSvc, setNewSvc] = useState("");
  const [svcFilter, setSvcFilter] = useState("");
  const [editCT, setEditCT] = useState(null);
  const [newMemo, setNewMemo] = useState("");
  const [editingName, setEditingName] = useState(null);
  const [editName, setEditName] = useState("");
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjSvcs, setNewProjSvcs] = useState(["SEO"]);
  const [inprogTasks, setInprogTasks] = useState([]);
  const [clientTasks, setClientTasks] = useState([]);
  const [clientTasksLoading, setClientTasksLoading] = useState(false);
  const [taskCounts, setTaskCounts] = useState({});

  // Load task counts from tasks table (source of truth)
  useEffect(() => {
    fetchTaskCountsByClient().then(setTaskCounts).catch(() => setTaskCounts({}));
  }, []);

  // Load in-progress tasks
  useEffect(() => {
    fetchTasksByType("inprogress").then(setInprogTasks).catch(() => setInprogTasks([]));
  }, []);

  // Load tasks from tasks table when a project is selected
  const sel = selected ? (projects || []).find((p) => p.id === selected) : null;
  const refreshClientTasks = async (projName) => {
    if (!projName) { setClientTasks([]); return; }
    setClientTasksLoading(true);
    try {
      const tasks = await fetchTasksByProject(projName);
      setClientTasks(tasks);
    } catch { setClientTasks([]); }
    setClientTasksLoading(false);
  };
  useEffect(() => {
    if (sel) refreshClientTasks(sel.name);
    else setClientTasks([]);
  }, [selected, sel?.name]);

  const list = projects || [];

  // Filter & sort
  const filtered = list.filter((p) => {
    const matchCat = catFilter === "all" || (p.services || [p.category]).includes(catFilter);
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const getLatestActivity = (p) => {
    let latest = p.updatedAt || 0;
    (p.tasks || []).forEach((t) => {
      if (t.completedAt) { const d = new Date(t.completedAt).getTime(); if (d > latest) latest = d; }
      if (t.createdAt && t.createdAt > latest) latest = t.createdAt;
    });
    (p.memos || []).forEach((m) => { if (m.date) { const d = new Date(m.date).getTime(); if (d > latest) latest = d; } });
    if (!latest && p.id) { const idTs = parseInt(p.id.replace(/[^0-9]/g, "")); if (idTs > 1700000000000 && idTs < 2000000000000) latest = idTs; }
    return latest || 0;
  };
  filtered.sort((a, b) => getLatestActivity(b) - getLatestActivity(a));

  // Stats
  const catCounts = {};
  list.forEach((p) => (p.services || [p.category]).forEach((svc) => { catCounts[svc] = (catCounts[svc] || 0) + 1; }));
  const totalOpen = list.reduce((sum, p) => sum + ((taskCounts[p.name] || {}).open || 0), 0);

  // ── Update project helper ──
  const updateProject = async (id, updates) => {
    const n = list.map((p) => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p);
    saveProjects(n);
    const updated = n.find((p) => p.id === id);
    if (updated) await upsertProject(updated);
  };

  const parseMmdd = (v) => {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    return toISO(v);
  };

  // ── Task actions (tasks table = source of truth) ──
  const addTask = async () => {
    if (!newTask.trim() || !sel) return;
    const lid = "link-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const svcs = sel.services || [sel.category];
    const svc = newSvc || svcs[0] || "";
    const dl = parseMmdd(newDeadline);
    const today = new Date().toISOString().slice(0, 10);
    await insertTaskDB(today, {
      name: newTask.trim(),
      linkId: lid,
      clientName: sel.name,
      project: sel.name,
      deadline: dl || null,
      service: svc || null,
      taskType: "daily",
    });
    setNewTask(""); setNewDeadline("");
    await refreshClientTasks(sel.name);
    fetchTaskCountsByClient().then(setTaskCounts).catch(() => {});
    setToast("✅ タスク追加");
  };

  const addBulkTasks = async () => {
    if (!bulkText.trim() || !sel) return;
    const lines = bulkText.split("\n").map((l) => l.replace(/^[\s\-*・●◯◎▶▷►→＞>☐☑✓✔︎\d+.)）]+/, "").trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;
    const svcs = sel.services || [sel.category];
    const svc = newSvc || svcs[0] || "";
    const dl = parseMmdd(newDeadline);
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < lines.length; i++) {
      const lid = "link-" + Date.now() + "-" + i + "-" + Math.random().toString(36).slice(2, 6);
      await insertTaskDB(today, {
        name: lines[i],
        linkId: lid,
        clientName: sel.name,
        project: sel.name,
        deadline: dl || null,
        service: svc || null,
        taskType: "daily",
      });
    }
    setBulkText(""); setBulkMode(false); setNewDeadline("");
    await refreshClientTasks(sel.name);
    fetchTaskCountsByClient().then(setTaskCounts).catch(() => {});
    setToast(`✅ ${lines.length} 件追加`);
  };

  const toggleTask = async (taskId) => {
    const target = clientTasks.find((t) => t.id === taskId);
    if (!target) return;
    const newDone = !target.done;
    const completedAt = newDone ? new Date().toISOString() : null;
    // Optimistic update (detail view)
    setClientTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, done: newDone, completedAt } : t));
    // Persist to tasks table (source of truth)
    await updateTaskDb(taskId, { done: newDone, completedAt });
    // Refresh task counts for client cards
    fetchTaskCountsByClient().then(setTaskCounts).catch(() => {});
    // Notify other views via in-memory tasks state sync
    if (target.linkId) syncTaskStatus(target.linkId, newDone);
  };

  const archiveTaskAction = (task) => {
    if (!task?.linkId) return;
    archiveTask(task.linkId, { title: task.text, clientName: sel.name, projectName: sel.name, completedAt: new Date().toISOString() });
    setClientTasks((prev) => prev.filter((t) => t.id !== task.id));
  };

  const handleDeleteTask = async (taskId) => {
    setClientTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteTaskDb(taskId);
    fetchTaskCountsByClient().then(setTaskCounts).catch(() => {});
  };

  const saveEditCT = async () => {
    if (!editCT) return;
    // Persist to tasks table (source of truth)
    await updateTaskDb(editCT.id, {
      name: editCT.text,
      deadline: parseMmdd(editCT.deadline) || null,
      service: editCT.service || null,
      memo: editCT.memo || null,
    });
    // Optimistic update (detail view)
    setClientTasks((prev) => prev.map((t) => t.id !== editCT.id ? t : {
      ...t, text: editCT.text, deadline: parseMmdd(editCT.deadline), service: editCT.service, memo: editCT.memo || "",
    }));
    setEditCT(null);
    setToast("✅ タスク更新");
  };

  // ── Memo actions ──
  const addMemo = () => {
    if (!newMemo.trim() || !sel) return;
    const memos = [{ id: "m-" + Date.now(), text: newMemo.trim(), date: new Date().toISOString().slice(0, 10) }].concat(sel.memos || []);
    updateProject(sel.id, { memos });
    setNewMemo("");
    setToast("✅ メモ追加");
  };

  const deleteMemo = (memoId) => {
    updateProject(sel.id, { memos: (sel.memos || []).filter((m) => m.id !== memoId) });
  };

  // ── Project actions ──
  const addProject = async () => {
    if (!newProjName.trim() || newProjSvcs.length === 0) return;
    const np = { id: "proj-" + Date.now(), name: newProjName.trim(), category: newProjSvcs[0], services: [...newProjSvcs], tasks: [], memos: [], articleEnabled: newProjSvcs.includes("SEO"), updatedAt: Date.now() };
    const n = [...list, np];
    saveProjects(n);
    await upsertProject(np);
    setNewProjName(""); setNewProjSvcs(["SEO"]); setAddingProject(false);
    setToast("✅ 案件追加: " + newProjName.trim());
  };

  const deleteProjectAction = async (id) => {
    saveProjects(list.filter((p) => p.id !== id));
    await deleteProjectDb(id);
    setSelected(null);
    setToast("🗑 案件削除");
  };

  // ══════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════
  if (sel) {
    const cc = CAT_COLORS[(sel.services || [sel.category])[0]] || CAT_COLORS["SEO"];
    const svcs = sel.services || [sel.category];
    const openTasks = clientTasks.filter((t) => !t.done).sort((a, b) => (a.deadline || "9999") > (b.deadline || "9999") ? 1 : -1);
    const doneTasks = clientTasks.filter((t) => t.done);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setSelected(null)} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, color: T.textMuted, fontFamily: T.font }}>←</button>
          {editingName === sel.id ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === "Escape") setEditingName(null); }}
                style={{ flex: 1, padding: "4px 10px", background: T.bg, border: `2px solid ${cc.color}`, borderRadius: T.radiusXs, color: T.text, fontSize: 14, fontWeight: 700, fontFamily: T.font, outline: "none" }} />
              <Btn onClick={() => { const nn = editName.trim(); if (nn) { updateProject(sel.id, { name: nn }); setEditingName(null); } }} style={{ fontSize: 10 }}>保存</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{sel.name}</span>
              <button onClick={() => { setEditingName(sel.id); setEditName(sel.name); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.textDim }}>✏️</button>
            </div>
          )}
        </div>

        {/* Service toggles */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textDim }}>対応領域:</span>
          {["SEO", "制作", "広告", "LINE"].map((svc) => {
            const sc = CAT_COLORS[svc] || CAT_COLORS["SEO"];
            const active = svcs.includes(svc);
            return (
              <button key={svc} onClick={() => {
                const newSvcs = active ? svcs.filter((s) => s !== svc) : [...svcs, svc];
                if (newSvcs.length === 0) return;
                updateProject(sel.id, { services: newSvcs, category: newSvcs[0] });
              }} style={{ padding: "3px 10px", borderRadius: 99, border: `1px solid ${active ? sc.color + "66" : T.border}`, background: active ? sc.color + "15" : "transparent", color: active ? sc.color : T.textDim, fontSize: 9, cursor: "pointer", fontFamily: T.font, fontWeight: active ? 600 : 400 }}>
                {sc.icon} {svc}
              </button>
            );
          })}
        </div>

        {/* Site URL */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
          <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>🌐 URL:</span>
          <input value={sel.siteUrl || ""} onChange={(e) => updateProject(sel.id, { siteUrl: e.target.value })} placeholder="https://example.com"
            style={{ flex: 1, padding: "3px 8px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 10, fontFamily: T.font, outline: "none", maxWidth: 300 }} />
          {sel.siteUrl && <a href={sel.siteUrl.startsWith("http") ? sel.siteUrl : "https://" + sel.siteUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: T.accent, textDecoration: "none", flexShrink: 0 }}>↗ 開く</a>}
        </div>

        {/* Spreadsheet URL (for SEO article checker) */}
        {(svcs.includes("SEO") || sel.articleEnabled) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>📊 記事管理シート:</span>
            <input value={sel.spreadsheetUrl || ""} onChange={(e) => updateProject(sel.id, { spreadsheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/..."
              style={{ flex: 1, minWidth: 180, padding: "3px 8px", background: T.bgInput, border: `1px solid ${sel.spreadsheetUrl ? T.accent + "44" : T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 10, fontFamily: T.font, outline: "none" }} />
            <input value={sel.sheetName || "シート1"} onChange={(e) => updateProject(sel.id, { sheetName: e.target.value })} placeholder="シート名"
              style={{ width: 80, padding: "3px 8px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 10, fontFamily: T.font, outline: "none", textAlign: "center" }} />
            {sel.spreadsheetUrl && <a href={sel.spreadsheetUrl.startsWith("http") ? sel.spreadsheetUrl : "https://" + sel.spreadsheetUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: T.accent, textDecoration: "none", flexShrink: 0 }}>↗ 開く</a>}
          </div>
        )}

        {/* Compact stats */}
        <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 11, color: T.textMuted, flexWrap: "wrap" }}>
          {openTasks.length > 0 && <span style={{ color: cc.color, fontWeight: 600 }}>📌 未完了 {openTasks.length}</span>}
          {doneTasks.length > 0 && <span style={{ color: T.success }}>✅ 完了 {doneTasks.length}</span>}
          {(sel.memos || []).length > 0 && <span>📝 メモ {(sel.memos || []).length}</span>}
        </div>

        {/* Tasks */}
        <Card style={{ borderLeft: `3px solid ${cc.color}`, padding: 12 }}>
          {svcs.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <button onClick={() => setSvcFilter("")} style={{ padding: "3px 8px", borderRadius: 99, border: `1px solid ${svcFilter === "" ? cc.color + "44" : T.border}`, background: svcFilter === "" ? cc.color + "10" : "transparent", color: svcFilter === "" ? cc.color : T.textMuted, fontSize: 9, cursor: "pointer", fontFamily: T.font }}>全て</button>
              {svcs.map((svc) => { const sc = CAT_COLORS[svc] || CAT_COLORS["SEO"]; return <button key={svc} onClick={() => setSvcFilter(svc)} style={{ padding: "3px 8px", borderRadius: 99, border: `1px solid ${svcFilter === svc ? sc.color + "44" : T.border}`, background: svcFilter === svc ? sc.color + "10" : "transparent", color: svcFilter === svc ? sc.color : T.textMuted, fontSize: 9, cursor: "pointer", fontFamily: T.font }}>{sc.icon}{svc}</button>; })}
            </div>
          )}

          {/* Add task form */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6, alignItems: "center" }}>
              <button onClick={() => setBulkMode(false)} style={{ padding: "2px 8px", borderRadius: 99, border: `1px solid ${bulkMode ? T.border : cc.color + "44"}`, background: bulkMode ? "transparent" : cc.color + "10", color: bulkMode ? T.textMuted : cc.color, fontSize: 9, cursor: "pointer", fontFamily: T.font }}>1件ずつ</button>
              <button onClick={() => setBulkMode(true)} style={{ padding: "2px 8px", borderRadius: 99, border: `1px solid ${bulkMode ? cc.color + "44" : T.border}`, background: bulkMode ? cc.color + "10" : "transparent", color: bulkMode ? cc.color : T.textMuted, fontSize: 9, cursor: "pointer", fontFamily: T.font }}>一括追加</button>
              <div style={{ flex: 1 }} />
              <input value={newDeadline} onChange={(e) => {
                let v = e.target.value.replace(/[^\d/]/g, "");
                if (v.length === 2 && !v.includes("/") && newDeadline.length < 2) v += "/";
                if (v.length > 5) v = v.slice(0, 5);
                setNewDeadline(v);
              }} placeholder="MM/DD" style={{ width: 60, padding: "3px 6px", background: T.bg, border: `1px solid ${newDeadline ? T.accent + "44" : T.border}`, borderRadius: T.radiusXs, color: newDeadline ? T.text : T.textDim, fontSize: 9, outline: "none", fontFamily: T.font, textAlign: "center" }} />
              {svcs.length > 1 && <select value={newSvc} onChange={(e) => setNewSvc(e.target.value)} style={{ padding: "3px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 9, fontFamily: T.font }}>
                {svcs.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>}
            </div>
            {bulkMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"1行1タスク\n例:\nバナー作成\nLP修正"} rows={4}
                  style={{ width: "100%", padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, outline: "none", fontFamily: T.font, resize: "vertical", boxSizing: "border-box" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: T.textDim }}>{bulkText.trim() ? bulkText.split("\n").filter((l) => l.trim()).length + " 件" : "0 件"}</span>
                  <div style={{ flex: 1 }} />
                  <Btn onClick={addBulkTasks} disabled={!bulkText.trim()} style={{ fontSize: 10, padding: "4px 10px", background: cc.color, borderColor: cc.color }}>一括追加</Btn>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="タスクを追加..."
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newTask.trim()) addTask(); }}
                  style={{ flex: 1, minWidth: 120, padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, outline: "none", fontFamily: T.font }} />
                <Btn onClick={addTask} disabled={!newTask.trim()} style={{ fontSize: 10, padding: "4px 10px", background: cc.color, borderColor: cc.color }}>追加</Btn>
              </div>
            )}
          </div>

          {clientTasksLoading && <div style={{ textAlign: "center", padding: "8px 0", color: T.textDim, fontSize: 11 }}>読み込み中...</div>}
          {!clientTasksLoading && openTasks.length === 0 && doneTasks.length === 0 && <div style={{ textAlign: "center", padding: "8px 0", color: T.textDim, fontSize: 11 }}>タスクなし</div>}

          {/* Open tasks */}
          {(svcFilter ? openTasks.filter((t) => t.service === svcFilter) : openTasks).map((t) => {
            const isOverdue = t.deadline && t.deadline < todayKey();
            const isToday = t.deadline && t.deadline === todayKey();
            const isEditing = editCT && editCT.id === t.id;
            return (
              <div key={t.id} style={{ borderBottom: `1px solid ${T.border}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0" }}>
                  <button onClick={() => toggleTask(t.id)} style={{ background: "none", border: `2px solid ${cc.color}`, borderRadius: "50%", width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                  {t.service && svcs.length > 1 && <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 99, background: (CAT_COLORS[t.service] || CAT_COLORS["SEO"]).color + "12", color: (CAT_COLORS[t.service] || CAT_COLORS["SEO"]).color, fontWeight: 600, flexShrink: 0 }}>{t.service}</span>}
                  <span style={{ flex: 1, fontSize: 11, color: T.text }}>{t.text}</span>
                  {t.memo && <span style={{ fontSize: 9, color: T.textDim, flexShrink: 0 }} title={t.memo}>📝</span>}
                  {t.deadline && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: isOverdue ? T.error + "15" : isToday ? T.warning + "15" : "transparent", color: isOverdue ? T.error : isToday ? T.warning : T.textDim, fontWeight: isOverdue || isToday ? 600 : 400, flexShrink: 0 }}>{t.deadline.slice(5)}</span>}
                  <button onClick={() => setEditCT(isEditing ? null : { id: t.id, text: t.text, deadline: t.deadline ? t.deadline.slice(5).replace("-", "/") : "", service: t.service || "", memo: t.memo || "" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: T.textDim, opacity: 0.4, fontFamily: T.font, flexShrink: 0 }}>✏️</button>
                </div>
                {isEditing && (
                  <div style={{ padding: "6px 0 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <input value={editCT.text} onChange={(e) => setEditCT({ ...editCT, text: e.target.value })} autoFocus
                      style={{ width: "100%", padding: "5px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, outline: "none", fontFamily: T.font, boxSizing: "border-box" }} />
                    <input value={editCT.memo || ""} onChange={(e) => setEditCT({ ...editCT, memo: e.target.value })} placeholder="メモ..."
                      style={{ width: "100%", padding: "5px 8px", background: T.bg, border: `1px solid ${editCT.memo ? T.accent + "44" : T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 10, outline: "none", fontFamily: T.font, boxSizing: "border-box" }} />
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input value={editCT.deadline} onChange={(e) => {
                        let v = e.target.value.replace(/[^\d/]/g, "");
                        if (v.length === 2 && !v.includes("/") && editCT.deadline.length < 2) v += "/";
                        if (v.length > 5) v = v.slice(0, 5);
                        setEditCT({ ...editCT, deadline: v });
                      }} placeholder="MM/DD" style={{ width: 65, padding: "3px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 10, fontFamily: T.font, textAlign: "center" }} />
                      <div style={{ flex: 1 }} />
                      <button onClick={() => { handleDeleteTask(t.id); setEditCT(null); }} style={{ padding: "2px 6px", borderRadius: T.radiusXs, border: `1px solid ${T.error}33`, background: T.error + "08", color: T.error, fontSize: 9, cursor: "pointer", fontFamily: T.font }}>🗑 削除</button>
                      <Btn variant="ghost" onClick={() => setEditCT(null)} style={{ fontSize: 9, padding: "2px 6px" }}>取消</Btn>
                      <Btn onClick={saveEditCT} style={{ fontSize: 9, padding: "2px 8px" }}>保存</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Done tasks */}
          {doneTasks.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 10, color: T.textMuted, cursor: "pointer", padding: "3px 0" }}>✅ 完了（{doneTasks.length}）</summary>
              {doneTasks.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", opacity: 0.6 }}>
                  <button onClick={() => toggleTask(t.id)} style={{ background: T.success, border: "none", borderRadius: "50%", width: 16, height: 16, cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
                  <span style={{ flex: 1, fontSize: 11, color: T.textDim, textDecoration: "line-through" }}>{t.text}</span>
                  <button onClick={() => archiveTaskAction(t)} title="アーカイブ" style={{ background: "none", border: "1px solid #7C3AED22", borderRadius: 3, padding: "1px 4px", cursor: "pointer", fontSize: 8, color: "#7C3AED", fontFamily: T.font, flexShrink: 0 }}>📦</button>
                </div>
              ))}
              {doneTasks.length > 1 && (
                <button onClick={() => doneTasks.forEach((t) => archiveTaskAction(t))} style={{ marginTop: 4, background: "none", border: "1px solid #7C3AED22", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 9, color: "#7C3AED", fontFamily: T.font, width: "100%" }}>📦 全てアーカイブ</button>
              )}
            </details>
          )}
        </Card>

        {/* In-progress tasks for this client */}
        {(() => {
          const clientInprog = inprogTasks.filter(t => t.project === sel.name && !t.done);
          if (clientInprog.length === 0) return null;
          return (
            <Card style={{ borderLeft: `3px solid ${T.cyan}`, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>🔄 進行中タスク（{clientInprog.length}）</div>
              {clientInprog.map(t => {
                const bh = BALL_HOLDERS.find(b => b.id === t.ballHolder) || BALL_HOLDERS[0];
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: `1px solid ${T.border}22` }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: bh.color + "22", color: bh.color, fontWeight: 600, flexShrink: 0 }}>{bh.label}</span>
                    <span style={{ flex: 1, fontSize: 11, color: T.text }}>{t.name}</span>
                    {t.deadline && <span style={{ fontSize: 8, color: t.deadline <= todayKey() ? "#EF4444" : T.textDim }}>{t.deadline.slice(5)}</span>}
                  </div>
                );
              })}
            </Card>
          );
        })()}

        {/* Memos */}
        <Card style={{ borderLeft: "3px solid #8B5CF6", padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>📝 メモ</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)} placeholder="メモを追加... (Ctrl+Enter)" rows={2}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addMemo(); }}
              style={{ flex: 1, padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, outline: "none", fontFamily: T.font, resize: "vertical", lineHeight: 1.5 }} />
            <Btn onClick={addMemo} disabled={!newMemo.trim()} style={{ fontSize: 10, alignSelf: "flex-end", padding: "4px 10px" }}>追加</Btn>
          </div>
          {(sel.memos || []).map((m) => (
            <div key={m.id} style={{ padding: "10px 12px", background: T.bg, borderRadius: T.radiusXs, marginBottom: 6, border: "1px solid #8B5CF622" }}>
              <div style={{ fontSize: 12, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.text}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 9, color: T.textDim }}>{m.date}</span>
                <button onClick={() => deleteMemo(m.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: T.error, opacity: 0.4, fontFamily: T.font }}>🗑</button>
              </div>
            </div>
          ))}
          {(sel.memos || []).length === 0 && <div style={{ textAlign: "center", padding: "12px 0", color: T.textDim, fontSize: 12 }}>メモなし</div>}
        </Card>

        {/* Archive History */}
        {(() => {
          const projArchived = (archivedTasks || []).filter((a) => a.projectName === sel.name || a.clientName === sel.name);
          if (projArchived.length === 0) return null;
          return <ArchiveExportPanel archivedTasks={archivedTasks} projectFilter={sel.name} />;
        })()}

        <div style={{ textAlign: "right" }}>
          <button onClick={() => { if (confirm("「" + sel.name + "」を削除しますか？")) deleteProjectAction(sel.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: T.error, opacity: 0.4, fontFamily: T.font }}>🗑 この案件を削除</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>🏥 案件管理</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {totalOpen > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: T.warning + "18", color: T.warning, fontWeight: 600 }}>📌 {totalOpen}</span>}
          <Btn onClick={() => setAddingProject(true)} style={{ fontSize: 10, padding: "4px 10px" }}>＋ 追加</Btn>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 検索..."
        style={{ padding: "8px 12px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 11, outline: "none", fontFamily: T.font }} />

      {/* Category filter */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {CAT_LIST.map((c) => {
          const active = catFilter === c.id;
          const cnt = c.id === "all" ? list.length : (catCounts[c.id] || 0);
          return (
            <button key={c.id} onClick={() => setCatFilter(c.id)}
              style={{ padding: "4px 10px", borderRadius: 99, border: `1px solid ${active ? c.color + "66" : T.border}`, background: active ? c.color + "12" : "transparent", color: active ? c.color : T.textMuted, fontSize: 10, cursor: "pointer", fontFamily: T.font, fontWeight: active ? 600 : 400 }}>
              {c.icon} {c.label}{cnt > 0 ? " " + cnt : ""}
            </button>
          );
        })}
      </div>

      {/* Add project form */}
      {addingProject && (
        <Card style={{ border: `2px solid ${T.primary}66`, background: T.primary + "08" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>✨ 新規案件追加</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <input value={newProjName} onChange={(e) => setNewProjName(e.target.value)} placeholder="案件名" autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") { setAddingProject(false); setNewProjName(""); } }}
              style={{ flex: 1, minWidth: 200, padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, outline: "none", fontFamily: T.font }} />
            <Btn onClick={addProject} disabled={!newProjName.trim() || newProjSvcs.length === 0} style={{ fontSize: 11 }}>追加</Btn>
            <Btn variant="ghost" onClick={() => { setAddingProject(false); setNewProjName(""); }} style={{ fontSize: 11 }}>キャンセル</Btn>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.textDim }}>対応領域:</span>
            {["SEO", "制作", "広告", "LINE"].map((svc) => {
              const sc = CAT_COLORS[svc] || CAT_COLORS["SEO"];
              const active = newProjSvcs.includes(svc);
              return (
                <button key={svc} onClick={() => {
                  const ns = active ? newProjSvcs.filter((s) => s !== svc) : [...newProjSvcs, svc];
                  setNewProjSvcs(ns);
                }} style={{ padding: "3px 10px", borderRadius: 99, border: `1px solid ${active ? sc.color + "66" : T.border}`, background: active ? sc.color + "15" : "transparent", color: active ? sc.color : T.textDim, fontSize: 9, cursor: "pointer", fontFamily: T.font, fontWeight: active ? 600 : 400 }}>
                  {sc.icon} {svc}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Project cards grid */}
      {filtered.length === 0 && <Card><div style={{ textAlign: "center", padding: "20px 0", color: T.textMuted, fontSize: 13 }}>該当する案件がありません</div></Card>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 6 }}>
        {filtered.map((p) => {
          const cc = CAT_COLORS[(p.services || [p.category])[0]] || CAT_COLORS["SEO"];
          const tc = taskCounts[p.name] || {};
          const openCount = tc.open || 0;
          const doneCount = tc.done || 0;
          return (
            <button key={p.id} onClick={() => setSelected(p.id)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: T.radiusSm, border: `1px solid ${cc.color}22`, borderLeft: `3px solid ${cc.color}`, background: T.bgCard, cursor: "pointer", fontFamily: T.font }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.3, marginBottom: 4 }}>{p.name}</div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                {(p.services || [p.category]).map((svc) => { const sc = CAT_COLORS[svc] || CAT_COLORS["SEO"]; return <span key={svc} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 99, background: sc.color + "12", color: sc.color, fontWeight: 600 }}>{sc.icon}{svc}</span>; })}
                {openCount > 0 && <span style={{ fontSize: 9, color: T.warning, fontWeight: 600 }}>📌{openCount}</span>}
                {doneCount > 0 && <span style={{ fontSize: 9, color: T.success }}>✅{doneCount}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Global Archive Summary */}
      {(archivedTasks || []).length > 0 && <ArchiveExportPanel archivedTasks={archivedTasks} />}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "../../lib/constants";
import { todayKey, dateLabel, dlDate, dlTime, dlJoin, dlDisplay, toMMDD, curMonth, monthLabel, prevMonthKey, nextMonthKey, toISO, fmtDateInput } from "../../lib/dates";
import { fmtSec, truncate } from "../../lib/format";
import { callAPIQuick } from "../../lib/api";
import {
  fetchTasksByDate,
  fetchTasksByType,
  insertTask as insertTaskDB,
  updateTask as updateTaskDB,
  deleteTask as deleteTaskDB,
} from "../../hooks/useStorage";
import { useApp } from "../../contexts/AppContext";
import Card from "../ui/Card";
import Btn from "../ui/Btn";

// Article pipeline statuses
const ART_STEPS = [
  { id: "not_started", label: "未着手", color: T.textMuted },
  { id: "kw_done", label: "KW選定済", color: "#60A5FA" },
  { id: "writing", label: "執筆中", color: T.warning },
  { id: "review", label: "確認待ち", color: T.purple },
  { id: "fix", label: "修正中", color: "#F472B6" },
  { id: "submit", label: "提出済", color: T.success },
  { id: "published", label: "公開済", color: T.cyan },
];

const BALL_HOLDERS = [
  { id: "self", label: "自分", color: T.accent },
  { id: "worker", label: "作業者", color: T.cyan },
  { id: "client", label: "クライアント", color: T.purple },
  { id: "engineer", label: "エンジニア", color: T.warning },
  { id: "designer", label: "デザイナー", color: "#F472B6" },
];

export default function TaskManagementView() {
  const { projects, saveProjects, syncTaskStatus, handleTaskExecute, setToast } = useApp();

  const [tmTab, setTmTab] = useState("today");
  const [date, setDate] = useState(todayKey());
  const [dayTasks, setDayTasks] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [inprogress, setInprogress] = useState([]);
  const [articles, setArticles] = useState([]);
  const [, setTicker] = useState(0);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Add form state
  const [adding, setAdding] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEst, setNewEst] = useState(30);
  const [newProject, setNewProject] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [aiEstLoading, setAiEstLoading] = useState(false);

  // Delegation form
  const [addingDeleg, setAddingDeleg] = useState(false);
  const [delegName, setDelegName] = useState("");
  const [delegProject, setDelegProject] = useState("");
  const [delegAssignee, setDelegAssignee] = useState("");
  const [delegDeadline, setDelegDeadline] = useState("");
  const [delegMemo, setDelegMemo] = useState("");

  // In-progress form
  const [addingInprog, setAddingInprog] = useState(false);
  const [ipName, setIpName] = useState("");
  const [ipProject, setIpProject] = useState("");
  const [ipBall, setIpBall] = useState("self");
  const [ipDeadline, setIpDeadline] = useState("");

  // Article state
  const [artMonthFilter, setArtMonthFilter] = useState(curMonth());
  const [expandedArt, setExpandedArt] = useState(null);

  // Editing states
  const [editingTask, setEditingTask] = useState(null);
  const [editingMemo, setEditingMemo] = useState(null);
  const [memoText, setMemoText] = useState("");

  // Quick timer
  const [qtRunning, setQtRunning] = useState(false);
  const [qtStartedAt, setQtStartedAt] = useState(null);

  // ── Data loading ──
  const loadDayTasks = useCallback(async () => {
    setLoadingTasks(true);
    const tasks = await fetchTasksByDate(date);
    setDayTasks(tasks);
    setLoadingTasks(false);
  }, [date]);

  const loadSpecialTasks = useCallback(async () => {
    try {
      const [del, inp, art] = await Promise.all([
        fetchTasksByType("delegation").catch(() => []),
        fetchTasksByType("inprogress").catch(() => []),
        fetchTasksByType("article").catch(() => []),
      ]);
      setDelegations(del);
      setInprogress(inp);
      setArticles(art);
    } catch (e) {
      console.error("loadSpecialTasks:", e);
    }
  }, []);

  useEffect(() => { loadDayTasks(); }, [loadDayTasks]);
  useEffect(() => { loadSpecialTasks(); }, [loadSpecialTasks]);

  // Tick every second for live stopwatch
  useEffect(() => {
    const t = setInterval(() => setTicker((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Helpers ──
  const getElapsed = (task) => {
    let base = task.elapsedSec || 0;
    if (task.running && task.runStartedAt) base += Math.floor((Date.now() - task.runStartedAt) / 1000);
    return base;
  };

  const completed = dayTasks.filter((t) => t.done).length;
  const total = dayTasks.length;
  const totalEstimate = dayTasks.reduce((s, t) => s + (t.estimateSec || 0), 0);
  const totalElapsed = dayTasks.reduce((s, t) => s + getElapsed(t), 0);
  const pendingDelegCount = delegations.filter((d) => !d.done && d.status !== "done").length;

  // ── Daily Task CRUD ──
  const addTask = async () => {
    if (!newName.trim()) return;
    const task = { name: newName.trim(), estimateSec: newEst * 60, project: newProject || null, taskType: "daily" };
    await insertTaskDB(date, task);
    await loadDayTasks();
    setNewName(""); setNewEst(30); setNewProject(""); setAdding(false);
  };

  const addBulkTasks = async () => {
    const lines = bulkText.split("\n").map((l) => l.replace(/^[\s\-\*•\d.)\]]+/, "").trim()).filter(Boolean);
    if (lines.length === 0) return;
    for (const line of lines) {
      await insertTaskDB(date, { name: line, estimateSec: newEst * 60, project: newProject || null, taskType: "daily" });
    }
    await loadDayTasks();
    setBulkText(""); setBulkMode(false); setAdding(false);
    setToast(`✅ ${lines.length}件追加`);
  };

  const startStop = async (id) => {
    const updated = dayTasks.map((t) => {
      if (t.id === id) {
        if (t.running) {
          const extra = t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
          const u = { ...t, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null };
          updateTaskDB(id, u);
          return u;
        } else {
          const u = { ...t, running: true, runStartedAt: Date.now() };
          updateTaskDB(id, u);
          return u;
        }
      }
      if (t.running && !t.done) {
        const extra = t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
        const u = { ...t, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null };
        updateTaskDB(t.id, u);
        return u;
      }
      return t;
    });
    setDayTasks(updated);
  };

  const markDone = async (id) => {
    const updated = dayTasks.map((t) => {
      if (t.id !== id) return t;
      if (!t.done) {
        const extra = t.running && t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
        const u = { ...t, done: true, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null };
        updateTaskDB(id, u);
        if (u.linkId) syncTaskStatus(u.linkId, true);
        return u;
      }
      const u = { ...t, done: false };
      updateTaskDB(id, u);
      if (u.linkId) syncTaskStatus(u.linkId, false);
      return u;
    });
    setDayTasks(updated);
  };

  const handleDeleteTask = async (id) => {
    setDayTasks((prev) => prev.filter((t) => t.id !== id));
    await deleteTaskDB(id);
  };

  const resetTimer = async (id) => {
    const updates = { elapsedSec: 0, running: false, runStartedAt: null, done: false };
    setDayTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    await updateTaskDB(id, updates);
  };

  const saveTaskEdit = async () => {
    if (!editingTask) return;
    const { id, name, project, estimateMin, elapsedMin } = editingTask;
    const updates = { name, project, estimateSec: (estimateMin || 0) * 60, elapsedSec: (elapsedMin || 0) * 60 };
    setDayTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    await updateTaskDB(id, updates);
    setEditingTask(null);
  };

  const saveMemo = async (id) => {
    const updates = { memo: memoText || null };
    setDayTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    await updateTaskDB(id, updates);
    setEditingMemo(null);
    setMemoText("");
  };

  // AI Estimate
  const aiEstimate = async (taskName) => {
    setAiEstLoading(true);
    try {
      const res = await callAPIQuick(
        "タスクの所要時間を分単位で推定。数字のみ回答。",
        [{ role: "user", content: `タスク: ${taskName}\n推定時間(分):` }],
        50
      );
      const num = parseInt(res);
      if (num > 0) setNewEst(num);
    } catch (e) { /* ignore */ }
    setAiEstLoading(false);
  };

  // Quick timer
  const qtToggle = async () => {
    if (qtRunning) {
      const elapsed = qtStartedAt ? Math.floor((Date.now() - qtStartedAt) / 1000) : 0;
      setQtRunning(false); setQtStartedAt(null);
      if (elapsed > 60) {
        await insertTaskDB(date, { name: "💬 チャット・雑務", estimateSec: elapsed, elapsedSec: elapsed, done: true, taskType: "daily" });
        await loadDayTasks();
      }
    } else {
      setQtRunning(true); setQtStartedAt(Date.now());
    }
  };

  // ── Delegation CRUD ──
  const addDelegTask = async () => {
    if (!delegName.trim()) return;
    await insertTaskDB(todayKey(), {
      name: delegName.trim(), project: delegProject || null, assignee: delegAssignee || null,
      deadline: delegDeadline ? toISO(delegDeadline) : null, memo: delegMemo || null,
      taskType: "delegation", status: "pending", linkId: "link-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    });
    await loadSpecialTasks();
    setDelegName(""); setDelegProject(""); setDelegAssignee(""); setDelegDeadline(""); setDelegMemo("");
    setAddingDeleg(false);
    setToast("✅ 委任タスク追加");
  };

  const cycleDelegStatus = async (id) => {
    const cycle = ["pending", "inprogress", "waiting", "done"];
    const task = delegations.find((d) => d.id === id);
    if (!task) return;
    const idx = cycle.indexOf(task.status || "pending");
    const next = cycle[(idx + 1) % cycle.length];
    const updates = { status: next, done: next === "done" };
    setDelegations((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    await updateTaskDB(id, updates);
    if (task.linkId) syncTaskStatus(task.linkId, next === "done");
  };

  const deleteDelegTask = async (id) => {
    setDelegations((prev) => prev.filter((d) => d.id !== id));
    await deleteTaskDB(id);
  };

  // ── In-Progress CRUD ──
  const addInprogTask = async () => {
    if (!ipName.trim()) return;
    await insertTaskDB(todayKey(), {
      name: ipName.trim(), project: ipProject || null, ballHolder: ipBall,
      deadline: ipDeadline ? toISO(ipDeadline) : null, taskType: "inprogress",
      linkId: "link-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      subtasks: [],
    });
    await loadSpecialTasks();
    setIpName(""); setIpProject(""); setIpBall("self"); setIpDeadline("");
    setAddingInprog(false);
    setToast("✅ 進行中タスク追加");
  };

  const toggleInprogDone = async (id) => {
    const task = inprogress.find((t) => t.id === id);
    if (!task) return;
    const updates = { done: !task.done };
    setInprogress((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    await updateTaskDB(id, updates);
    if (task.linkId) syncTaskStatus(task.linkId, !task.done);
  };

  const updateInprogBall = async (id, ballHolder) => {
    setInprogress((prev) => prev.map((t) => (t.id === id ? { ...t, ballHolder } : t)));
    await updateTaskDB(id, { ballHolder });
  };

  const deleteInprogTask = async (id) => {
    setInprogress((prev) => prev.filter((t) => t.id !== id));
    await deleteTaskDB(id);
  };

  // ── Article CRUD ──
  const addArticle = async (projectName) => {
    await insertTaskDB(todayKey(), {
      name: projectName, project: projectName, month: artMonthFilter,
      status: "not_started", taskType: "article",
    });
    await loadSpecialTasks();
  };

  const advanceArticle = async (id) => {
    const art = articles.find((a) => a.id === id);
    if (!art) return;
    const idx = ART_STEPS.findIndex((s) => s.id === art.status);
    if (idx < ART_STEPS.length - 1) {
      const next = ART_STEPS[idx + 1].id;
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, status: next } : a)));
      await updateTaskDB(id, { status: next });
    }
  };

  const revertArticle = async (id) => {
    const art = articles.find((a) => a.id === id);
    if (!art) return;
    const idx = ART_STEPS.findIndex((s) => s.id === art.status);
    if (idx > 0) {
      const prev = ART_STEPS[idx - 1].id;
      setArticles((p) => p.map((a) => (a.id === id ? { ...a, status: prev } : a)));
      await updateTaskDB(id, { status: prev });
    }
  };

  const deleteArticle = async (id) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    await deleteTaskDB(id);
  };

  // ── Navigation ──
  const prevDay = () => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); };
  const nextDay = () => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0, 10)); };

  // Sorted project list for dropdowns
  const projectNames = useMemo(() => (projects || []).map((p) => p.name).sort(), [projects]);
  const filteredArticles = useMemo(() => articles.filter((a) => a.month === artMonthFilter), [articles, artMonthFilter]);

  // ── Status helpers ──
  const delegStatusLabel = (s) => ({ pending: "📋 未着手", inprogress: "⚡ 進行中", waiting: "⏳ 待ち", done: "✅ 完了" }[s] || "📋 未着手");
  const delegStatusColor = (s) => ({ pending: T.textMuted, inprogress: T.accent, waiting: T.warning, done: T.success }[s] || T.textMuted);
  const getBallHolder = (id) => BALL_HOLDERS.find((b) => b.id === id) || BALL_HOLDERS[0];

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header + Tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>⏱ タスク管理</div>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {[
            { id: "today", label: "📅 今日" },
            { id: "list", label: "📋 一覧" },
            { id: "inprog", label: "🔄 進行中", badge: inprogress.filter((t) => !t.done).length },
            { id: "deleg", label: "👥 依頼", badge: pendingDelegCount },
            { id: "articles", label: "📝 記事" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTmTab(t.id)} style={{
              padding: "6px 10px", fontSize: 11, fontWeight: tmTab === t.id ? 600 : 400,
              color: tmTab === t.id ? T.accent : T.textMuted,
              background: tmTab === t.id ? T.accent + "12" : "transparent",
              border: "none", borderRadius: 6, cursor: "pointer", fontFamily: T.font,
              whiteSpace: "nowrap", position: "relative",
            }}>
              {t.label}
              {t.badge > 0 && <span style={{ position: "absolute", top: 0, right: 0, background: T.error, color: "#fff", fontSize: 8, borderRadius: 99, padding: "1px 4px", fontWeight: 700 }}>{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ TODAY TAB ═══ */}
      {tmTab === "today" && <>
        {/* Date navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Btn variant="ghost" onClick={prevDay} style={{ fontSize: 16, padding: "4px 8px" }}>←</Btn>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text, minWidth: 120, textAlign: "center" }}>{dateLabel(date)}</span>
          <Btn variant="ghost" onClick={nextDay} style={{ fontSize: 16, padding: "4px 8px" }}>→</Btn>
          {date !== todayKey() && <Btn variant="secondary" onClick={() => setDate(todayKey())} style={{ fontSize: 11 }}>今日</Btn>}
          <div style={{ flex: 1 }} />
          {/* Quick timer */}
          <button onClick={qtToggle} style={{
            padding: "4px 12px", borderRadius: T.radiusSm, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: qtRunning ? T.warning + "22" : "transparent", color: qtRunning ? T.warning : T.textMuted,
            border: `1px solid ${qtRunning ? T.warning + "44" : T.border}`, fontFamily: T.font,
          }}>
            {qtRunning ? `💬 ${fmtSec(qtStartedAt ? Math.floor((Date.now() - qtStartedAt) / 1000) : 0)}` : "💬 雑務"}
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Card style={{ padding: "8px 14px", flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 10, color: T.textMuted }}>進捗</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: completed === total && total > 0 ? T.success : T.text }}>{completed}<span style={{ fontSize: 12, color: T.textDim }}>/{total}</span></div>
            {total > 0 && <div style={{ height: 3, borderRadius: 2, background: T.border, marginTop: 3 }}><div style={{ height: 3, borderRadius: 2, background: T.success, width: `${(completed / total) * 100}%`, transition: "width 0.3s" }} /></div>}
          </Card>
          <Card style={{ padding: "8px 14px", flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 10, color: T.textMuted }}>見積</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtSec(totalEstimate)}</div>
          </Card>
          <Card style={{ padding: "8px 14px", flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 10, color: T.textMuted }}>実績</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: totalElapsed > totalEstimate && totalEstimate > 0 ? T.error : T.success, fontVariantNumeric: "tabular-nums" }}>{fmtSec(totalElapsed)}</div>
          </Card>
        </div>

        {loadingTasks && <div style={{ textAlign: "center", color: T.textMuted, fontSize: 13, padding: 16 }}>読み込み中...</div>}

        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dayTasks.map((task) => {
            const elapsed = getElapsed(task);
            const pct = task.estimateSec > 0 ? Math.min(elapsed / task.estimateSec, 1) : 0;
            const over = elapsed > task.estimateSec && task.estimateSec > 0;
            const isRunning = task.running && !task.done;
            const barColor = task.done ? T.success : over ? T.error : isRunning ? T.accent : T.textMuted;

            return (
              <Card key={task.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${isRunning ? T.accent + "55" : T.border}`, background: isRunning ? T.accent + "06" : T.bgCard }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                  {/* Done checkbox */}
                  <button onClick={() => markDone(task.id)} style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${task.done ? T.success : T.border}`, background: task.done ? T.success + "22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.success, flexShrink: 0 }}>
                    {task.done ? "✓" : ""}
                  </button>

                  {/* Task info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {task.project && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.accent + "15", color: T.accent }}>{truncate(task.project, 12)}</span>}
                      <span style={{ fontSize: 13, fontWeight: 500, color: task.done ? T.textMuted : T.text, textDecoration: task.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: T.textMuted }}>見積: {fmtSec(task.estimateSec || 0)}</span>
                      {task.memo && <span style={{ fontSize: 10, color: T.warning }}>📝</span>}
                    </div>
                  </div>

                  {/* Timer */}
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: `'SF Mono', monospace`, color: task.done ? T.success : over ? T.error : isRunning ? T.accent : T.text }}>{fmtSec(elapsed)}</div>
                    {over && !task.done && <div style={{ fontSize: 9, color: T.error }}>+{fmtSec(elapsed - task.estimateSec)}</div>}
                  </div>

                  {/* Controls */}
                  {!task.done ? (
                    <button onClick={() => startStop(task.id)} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${isRunning ? T.error : T.success}`, background: isRunning ? T.error + "15" : T.success + "15", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{isRunning ? "⏸" : "▶"}</button>
                  ) : (
                    <button onClick={() => resetTimer(task.id)} title="リセット" style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${T.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, color: T.textMuted }}>↺</button>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={() => setEditingTask({ id: task.id, name: task.name, project: task.project, estimateMin: Math.round((task.estimateSec || 0) / 60), elapsedMin: Math.round(elapsed / 60) })} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.5 }}>✏️</button>
                    <button onClick={() => { setEditingMemo(task.id); setMemoText(task.memo || ""); }} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.5 }}>📝</button>
                    <button onClick={() => handleDeleteTask(task.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                  </div>
                </div>

                {/* Inline edit */}
                {editingTask?.id === task.id && (
                  <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, background: T.bg, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <input value={editingTask.name} onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })} style={{ flex: 1, minWidth: 120, padding: "5px 8px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                    <select value={editingTask.project || ""} onChange={(e) => setEditingTask({ ...editingTask, project: e.target.value || null })} style={{ padding: "5px 8px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                      <option value="">案件なし</option>
                      {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <input type="number" value={editingTask.estimateMin} onChange={(e) => setEditingTask({ ...editingTask, estimateMin: parseInt(e.target.value) || 0 })} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                    <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                    <Btn onClick={saveTaskEdit} style={{ fontSize: 10, padding: "4px 10px" }}>保存</Btn>
                    <Btn variant="ghost" onClick={() => setEditingTask(null)} style={{ fontSize: 10, padding: "4px 8px" }}>✕</Btn>
                  </div>
                )}

                {/* Inline memo */}
                {editingMemo === task.id && (
                  <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
                    <textarea value={memoText} onChange={(e) => setMemoText(e.target.value)} rows={2} placeholder="メモ..." style={{ width: "100%", padding: "6px 8px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, resize: "vertical", boxSizing: "border-box" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <Btn onClick={() => saveMemo(task.id)} style={{ fontSize: 10, padding: "3px 10px" }}>保存</Btn>
                      <Btn variant="ghost" onClick={() => setEditingMemo(null)} style={{ fontSize: 10, padding: "3px 8px" }}>✕</Btn>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                <div style={{ height: 3, background: T.border }}>
                  <div style={{ height: 3, background: barColor, width: `${Math.min(pct * 100, 100)}%`, transition: "width 0.5s", opacity: 0.7 }} />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Add task form */}
        {adding ? (
          <Card style={{ border: `1px solid ${T.accent}33` }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={() => setBulkMode(false)} style={{ fontSize: 11, color: !bulkMode ? T.accent : T.textMuted, background: !bulkMode ? T.accent + "12" : "transparent", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: T.font }}>単体</button>
              <button onClick={() => setBulkMode(true)} style={{ fontSize: 11, color: bulkMode ? T.accent : T.textMuted, background: bulkMode ? T.accent + "12" : "transparent", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: T.font }}>📋 一括</button>
            </div>
            {!bulkMode ? (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} autoFocus placeholder="タスク名..." style={{ width: "100%", padding: "7px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font, boxSizing: "border-box" }} />
                </div>
                <select value={newProject} onChange={(e) => setNewProject(e.target.value)} style={{ padding: "7px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                  <option value="">案件</option>
                  {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" value={newEst} onChange={(e) => setNewEst(parseInt(e.target.value) || 0)} min={1} style={{ width: 50, padding: "7px 4px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                  <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                  {newName.trim() && <button onClick={() => aiEstimate(newName)} disabled={aiEstLoading} style={{ fontSize: 9, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>{aiEstLoading ? "..." : "🤖"}</button>}
                </div>
                <Btn onClick={addTask} disabled={!newName.trim()}>追加</Btn>
                <Btn variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>✕</Btn>
              </div>
            ) : (
              <div>
                <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} placeholder={"- タスク1\n- タスク2\n- タスク3"} style={{ width: "100%", padding: "8px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, lineHeight: 1.6, fontFamily: T.font, resize: "vertical", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  <select value={newProject} onChange={(e) => setNewProject(e.target.value)} style={{ padding: "5px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                    <option value="">案件</option>
                    {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <input type="number" value={newEst} onChange={(e) => setNewEst(parseInt(e.target.value) || 0)} style={{ width: 50, padding: "5px 4px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                  <span style={{ fontSize: 10, color: T.textMuted }}>分/件</span>
                  <Btn onClick={addBulkTasks} disabled={!bulkText.trim()}>一括追加</Btn>
                  <Btn variant="ghost" onClick={() => { setAdding(false); setBulkMode(false); setBulkText(""); }}>✕</Btn>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Btn variant="secondary" onClick={() => setAdding(true)} style={{ alignSelf: "flex-start" }}>+ タスクを追加</Btn>
        )}
      </>}

      {/* ═══ LIST TAB ═══ */}
      {tmTab === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: T.textDim }}>全タスク一覧（今日のタスク + 委任 + 進行中）</div>

          {/* Daily tasks summary */}
          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>📅 {dateLabel(date)} のタスク ({dayTasks.length}件)</div>
            {dayTasks.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.borderSubtle}` }}>
                <span style={{ fontSize: 12, color: t.done ? T.success : T.textMuted }}>{t.done ? "✅" : "⬜"}</span>
                {t.project && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: T.accent + "15", color: T.accent }}>{truncate(t.project, 10)}</span>}
                <span style={{ fontSize: 12, color: t.done ? T.textMuted : T.text, textDecoration: t.done ? "line-through" : "none" }}>{t.name}</span>
              </div>
            ))}
            {dayTasks.length === 0 && <div style={{ fontSize: 11, color: T.textMuted }}>タスクなし</div>}
          </Card>

          {/* Delegations summary */}
          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>👥 委任タスク ({delegations.length}件)</div>
            {delegations.slice(0, 10).map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.borderSubtle}` }}>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: delegStatusColor(d.status) + "22", color: delegStatusColor(d.status) }}>{delegStatusLabel(d.status)}</span>
                {d.project && <span style={{ fontSize: 9, color: T.textMuted }}>[{truncate(d.project, 10)}]</span>}
                <span style={{ fontSize: 12, color: T.text }}>{d.name}</span>
                {d.assignee && <span style={{ fontSize: 9, color: T.purple }}>→ {d.assignee}</span>}
              </div>
            ))}
          </Card>

          {/* In-progress summary */}
          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>🔄 進行中タスク ({inprogress.length}件)</div>
            {inprogress.slice(0, 10).map((t) => {
              const bh = getBallHolder(t.ballHolder);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: bh.color + "22", color: bh.color }}>{bh.label}</span>
                  {t.project && <span style={{ fontSize: 9, color: T.textMuted }}>[{truncate(t.project, 10)}]</span>}
                  <span style={{ fontSize: 12, color: t.done ? T.textMuted : T.text }}>{t.name}</span>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* ═══ IN-PROGRESS TAB ═══ */}
      {tmTab === "inprog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {inprogress.map((task) => {
            const bh = getBallHolder(task.ballHolder);
            const subs = task.subtasks || [];
            const subDone = subs.filter((s) => s.done).length;
            return (
              <Card key={task.id} style={{ border: `1px solid ${task.done ? T.success + "44" : bh.color + "33"}`, opacity: task.done ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <button onClick={() => toggleInprogDone(task.id)} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${task.done ? T.success : T.border}`, background: task.done ? T.success + "22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.success, flexShrink: 0 }}>{task.done ? "✓" : ""}</button>
                  <button onClick={() => updateInprogBall(task.id, BALL_HOLDERS[(BALL_HOLDERS.findIndex((b) => b.id === task.ballHolder) + 1) % BALL_HOLDERS.length].id)} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: bh.color + "22", color: bh.color, border: `1px solid ${bh.color}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600 }}>{bh.label}</button>
                  {task.project && <span style={{ fontSize: 9, color: T.textMuted }}>[{truncate(task.project, 15)}]</span>}
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>{task.name}</span>
                  {subs.length > 0 && <span style={{ fontSize: 9, color: T.textMuted }}>{subDone}/{subs.length}</span>}
                  {task.deadline && <span style={{ fontSize: 9, color: T.warning }}>〆 {dlDisplay(task.deadline)}</span>}
                  <button onClick={() => deleteInprogTask(task.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                </div>
                {/* Subtasks */}
                {subs.length > 0 && (
                  <div style={{ marginLeft: 30, borderLeft: `2px solid ${T.border}`, paddingLeft: 10 }}>
                    {subs.map((sub, si) => (
                      <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                        <input type="checkbox" checked={sub.done} onChange={() => {
                          const newSubs = [...subs]; newSubs[si] = { ...sub, done: !sub.done };
                          setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t)));
                          updateTaskDB(task.id, { subtasks: newSubs });
                        }} style={{ cursor: "pointer" }} />
                        <span style={{ fontSize: 11, color: sub.done ? T.textMuted : T.text, textDecoration: sub.done ? "line-through" : "none" }}>{sub.text || sub.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Add in-progress */}
          {addingInprog ? (
            <Card style={{ border: `1px solid ${T.cyan}33` }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={ipName} onChange={(e) => setIpName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addInprogTask(); }} autoFocus placeholder="タスク名..." style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                <select value={ipProject} onChange={(e) => setIpProject(e.target.value)} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                  <option value="">案件</option>
                  {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={ipBall} onChange={(e) => setIpBall(e.target.value)} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                  {BALL_HOLDERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <Btn onClick={addInprogTask} disabled={!ipName.trim()}>追加</Btn>
                <Btn variant="ghost" onClick={() => setAddingInprog(false)}>✕</Btn>
              </div>
            </Card>
          ) : (
            <Btn variant="secondary" onClick={() => setAddingInprog(true)} style={{ alignSelf: "flex-start" }}>+ 進行中タスクを追加</Btn>
          )}
        </div>
      )}

      {/* ═══ DELEGATION TAB ═══ */}
      {tmTab === "deleg" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {delegations.map((d) => (
            <Card key={d.id} style={{ border: `1px solid ${delegStatusColor(d.status)}33`, opacity: d.done ? 0.5 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => cycleDelegStatus(d.id)} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: delegStatusColor(d.status) + "22", color: delegStatusColor(d.status), border: `1px solid ${delegStatusColor(d.status)}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, whiteSpace: "nowrap" }}>{delegStatusLabel(d.status)}</button>
                {d.project && <span style={{ fontSize: 9, color: T.textMuted }}>[{truncate(d.project, 12)}]</span>}
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>{d.name}</span>
                {d.assignee && <span style={{ fontSize: 10, color: T.purple }}>→ {d.assignee}</span>}
                {d.deadline && <span style={{ fontSize: 9, color: T.warning }}>〆 {dlDisplay(d.deadline)}</span>}
                <button onClick={() => deleteDelegTask(d.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
              </div>
              {d.memo && <div style={{ marginTop: 4, fontSize: 11, color: T.textDim, paddingLeft: 8 }}>📝 {d.memo}</div>}
            </Card>
          ))}

          {/* Add delegation */}
          {addingDeleg ? (
            <Card style={{ border: `1px solid ${T.purple}33` }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={delegName} onChange={(e) => setDelegName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addDelegTask(); }} autoFocus placeholder="依頼内容..." style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                <select value={delegProject} onChange={(e) => setDelegProject(e.target.value)} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                  <option value="">案件</option>
                  {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <input value={delegAssignee} onChange={(e) => setDelegAssignee(e.target.value)} placeholder="担当者" style={{ width: 80, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                <input value={delegDeadline} onChange={(e) => setDelegDeadline(fmtDateInput(e.target.value))} placeholder="MM/DD" style={{ width: 60, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                <Btn onClick={addDelegTask} disabled={!delegName.trim()}>追加</Btn>
                <Btn variant="ghost" onClick={() => setAddingDeleg(false)}>✕</Btn>
              </div>
              <textarea value={delegMemo} onChange={(e) => setDelegMemo(e.target.value)} placeholder="メモ（任意）" rows={2} style={{ width: "100%", marginTop: 6, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, resize: "vertical", boxSizing: "border-box" }} />
            </Card>
          ) : (
            <Btn variant="secondary" onClick={() => setAddingDeleg(true)} style={{ alignSelf: "flex-start" }}>+ 委任タスクを追加</Btn>
          )}
        </div>
      )}

      {/* ═══ ARTICLES TAB ═══ */}
      {tmTab === "articles" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setArtMonthFilter(prevMonthKey(artMonthFilter))} style={{ fontSize: 14, padding: "4px 8px" }}>←</Btn>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{monthLabel(artMonthFilter)}</span>
            <Btn variant="ghost" onClick={() => setArtMonthFilter(nextMonthKey(artMonthFilter))} style={{ fontSize: 14, padding: "4px 8px" }}>→</Btn>
            {artMonthFilter !== curMonth() && <Btn variant="secondary" onClick={() => setArtMonthFilter(curMonth())} style={{ fontSize: 10 }}>今月</Btn>}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: T.textMuted }}>{filteredArticles.length}件</span>
          </div>

          {/* Pipeline summary */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {ART_STEPS.map((step) => {
              const count = filteredArticles.filter((a) => a.status === step.id).length;
              return (
                <span key={step.id} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: count > 0 ? step.color + "22" : T.bgCard, color: count > 0 ? step.color : T.textMuted, border: `1px solid ${count > 0 ? step.color + "44" : T.border}` }}>
                  {step.label}: {count}
                </span>
              );
            })}
          </div>

          {/* Article list */}
          {filteredArticles.map((art) => {
            const step = ART_STEPS.find((s) => s.id === art.status) || ART_STEPS[0];
            const expanded = expandedArt === art.id;
            return (
              <Card key={art.id} style={{ border: `1px solid ${step.color}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => revertArticle(art.id)} disabled={art.status === "not_started"} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: T.textMuted, opacity: art.status === "not_started" ? 0.2 : 0.6 }}>◀</button>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: step.color + "22", color: step.color, fontWeight: 600 }}>{step.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>{art.name || art.project}</span>
                  {art.deadline && <span style={{ fontSize: 9, color: T.warning }}>〆 {dlDisplay(art.deadline)}</span>}
                  <button onClick={() => advanceArticle(art.id)} disabled={art.status === "published"} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: step.color, opacity: art.status === "published" ? 0.2 : 1 }}>▶</button>
                  <button onClick={() => setExpandedArt(expanded ? null : art.id)} style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", color: T.textMuted }}>{expanded ? "▼" : "▶"}</button>
                </div>
                {/* Progress dots */}
                <div style={{ display: "flex", gap: 3, marginTop: 6, marginLeft: 30 }}>
                  {ART_STEPS.map((s, i) => {
                    const artIdx = ART_STEPS.findIndex((x) => x.id === art.status);
                    return <div key={s.id} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= artIdx ? step.color : T.border, transition: "background 0.2s" }} />;
                  })}
                </div>
                {/* Expanded controls */}
                {expanded && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <select value={art.status} onChange={async (e) => { setArticles((prev) => prev.map((a) => (a.id === art.id ? { ...a, status: e.target.value } : a))); await updateTaskDB(art.id, { status: e.target.value }); }} style={{ padding: "4px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                      {ART_STEPS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <Btn variant="danger" onClick={() => deleteArticle(art.id)} style={{ fontSize: 10, padding: "3px 10px" }}>🗑 削除</Btn>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Add article */}
          <Card style={{ border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>記事案件を追加</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(projects || []).filter((p) => p.articleEnabled || (p.services || []).includes("SEO")).slice(0, 20).map((p) => {
                const exists = filteredArticles.some((a) => (a.name === p.name || a.project === p.name));
                return (
                  <button key={p.id} onClick={() => !exists && addArticle(p.name)} disabled={exists} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 99, background: exists ? T.bgCard : T.accent + "12", color: exists ? T.textMuted : T.accent, border: `1px solid ${exists ? T.border : T.accent + "44"}`, cursor: exists ? "default" : "pointer", fontFamily: T.font, opacity: exists ? 0.4 : 1 }}>
                    {exists ? "✓" : "+"} {truncate(p.name, 15)}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

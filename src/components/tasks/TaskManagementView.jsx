import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { T } from "../../lib/constants";
import { todayKey, dateLabel, dlDate, dlTime, dlJoin, dlDisplay, curMonth, monthLabel, prevMonthKey, nextMonthKey, toISO, fmtDateInput } from "../../lib/dates";
import { fmtSec, truncate } from "../../lib/format";
import { callAPIQuick } from "../../lib/api";
import {
  fetchTasksByDate,
  fetchTasksForDateView,
  fetchAllActiveTasks,
  fetchAllActiveTasksUnified,
  fetchClientTasksForDate,
  fetchCompletedTasksForMonth,
  fetchTasksByType,
  insertTask as insertTaskDB,
  updateTask as updateTaskDB,
  deleteTask as deleteTaskDB,
  updateTaskByLinkId,
  autoInsertRecurringTasks,
} from "../../hooks/useStorage";
import { useApp } from "../../contexts/AppContext";
import Card from "../ui/Card";
import Btn from "../ui/Btn";

const CAT_COLORS = {
  "制作": { color: "#3B82F6" },
  "SEO": { color: "#10B981" },
  "広告": { color: "#F59E0B" },
  "LINE": { color: "#06D001" },
};

// Article pipeline statuses (legacy-compatible 7 stages)
// self: true = 自分待ち（赤バッジ）, false = 業者待ち（青バッジ）
// Phase K (2026-04-10): 記事管理シートの実ステータスに合わせて再定義
// self=true は松下が次のアクションを取るべき段階 (レビュー/承認/入稿)
const ART_STEPS = [
  { id: "構成中",       label: "構成中",     self: false, color: T.accent },
  { id: "構成完了",     label: "構成完了",   self: true,  color: T.error },
  { id: "承認済み",     label: "承認済み",   self: false, color: T.accent },
  { id: "執筆中",       label: "執筆中",     self: false, color: T.accent },
  { id: "執筆完了",     label: "執筆完了",   self: true,  color: T.error },
  { id: "チェック済み", label: "チェック済み", self: true, color: T.error },
];
const ART_STEP_IDS = ART_STEPS.map((s) => s.id);
const ART_DONE_STATUS = "入稿完了";  // 完了扱いするステータス値

const BALL_HOLDERS = [
  { id: "self", label: "自分", color: T.accent },
  { id: "worker", label: "作業者", color: T.cyan },
  { id: "client", label: "クライアント", color: T.purple },
  { id: "engineer", label: "エンジニア", color: T.warning },
  { id: "designer", label: "デザイナー", color: "#F472B6" },
];

// (doneProjTaskIds localStorage removed — tasks table is now the source of truth)

export default function TaskManagementView({ onNavigateToClient }) {
  const { projects, syncTaskStatus, setToast, recurring, saveRecurring, removeRecurring, taskRefreshSignal } = useApp();

  // (projectsRef / saveProjectsSafe removed — tasks table is now the source of truth)

  // (localStorage doneIds cleanup removed — tasks table is source of truth)

  const [tmTab, setTmTab] = useState("today");
  const [inprogFilter, setInprogFilter] = useState("all"); // "all" | "self" | "other"
  const [date, setDate] = useState(todayKey());
  const [dayTasks, setDayTasks] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [inprogress, setInprogress] = useState([]);
  const [articles, setArticles] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportMonthFilter, setReportMonthFilter] = useState(curMonth());
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

  // Monthly recurring form
  const [addingMonthly, setAddingMonthly] = useState(false);
  const [monthlyName, setMonthlyName] = useState("");
  const [monthlyProject, setMonthlyProject] = useState("");
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [editingMonthly, setEditingMonthly] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showListInprog, setShowListInprog] = useState(false);
  const [showListDeleg, setShowListDeleg] = useState(false);
  const [addingFromInprog, setAddingFromInprog] = useState(null); // inprog task id
  const [fromInprogName, setFromInprogName] = useState("");
  const [exportText, setExportText] = useState("");
  const [inprogSectionOpen, setInprogSectionOpen] = useState(false);
  const [doneSectionOpen, setDoneSectionOpen] = useState(false);

  // Editing states
  const [editingTask, setEditingTask] = useState(null);
  const [editingMemo, setEditingMemo] = useState(null);
  const [memoText, setMemoText] = useState("");
  const [editDL, setEditDL] = useState(null); // { id, val } for inline deadline editing
  const [editingProjTask, setEditingProjTask] = useState(null); // { _pid, id, text, estimateMin }
  const [editingProjMemo, setEditingProjMemo] = useState(null); // proj task id
  const [projMemoText, setProjMemoText] = useState("");

  // Quick timer (restored from localStorage)
  const [qtRunning, setQtRunning] = useState(() => {
    try { const s = localStorage.getItem("mkt_qt"); if (s) { const d = JSON.parse(s); return d.running || false; } } catch {} return false;
  });
  const [qtStartedAt, setQtStartedAt] = useState(() => {
    try { const s = localStorage.getItem("mkt_qt"); if (s) { const d = JSON.parse(s); return d.startedAt || null; } } catch {} return null;
  });
  const [qtCount, setQtCount] = useState(0);

  // All active tasks for "list" tab
  const [allActiveTasks, setAllActiveTasks] = useState([]);
  const [listPage, setListPage] = useState(0);
  const LIST_PAGE_SIZE = 20;

  // Completed tasks tab
  const [completedTasks, setCompletedTasks] = useState([]);
  const [completedMonth, setCompletedMonth] = useState(curMonth());
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // Project task timers (restored from localStorage)
  const [projTimers, setProjTimers] = useState(() => {
    try { const s = localStorage.getItem("mkt_projTimers"); if (s) return JSON.parse(s); } catch {} return {};
  });

  // Persist quick timer to localStorage
  useEffect(() => {
    localStorage.setItem("mkt_qt", JSON.stringify({ running: qtRunning, startedAt: qtStartedAt }));
  }, [qtRunning, qtStartedAt]);

  // Persist project timers to localStorage
  useEffect(() => {
    localStorage.setItem("mkt_projTimers", JSON.stringify(projTimers));
  }, [projTimers]);

  // Initialize projTimers from project task data (Supabase is source of truth)
  const projTimersInitialized = useRef(false);
  useEffect(() => {
    if (projTimersInitialized.current || !projects || projects.length === 0) return;
    projTimersInitialized.current = true;
    setProjTimers((prev) => {
      const fromDb = {};
      for (const p of projects) {
        for (const t of (p.tasks || [])) {
          if (t.elapsedSec > 0) {
            fromDb[t.id] = { running: false, startedAt: null, elapsed: t.elapsedSec };
          }
        }
      }
      // Merge: prefer higher elapsed value (Supabase or localStorage)
      const merged = { ...prev };
      for (const [k, v] of Object.entries(fromDb)) {
        if (!merged[k] || (v.elapsed || 0) > (merged[k].elapsed || 0)) {
          merged[k] = v;
        }
      }
      return merged;
    });
  }, [projects]);

  // Auto-save running project timers to tasks table every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      for (const [taskId, pt] of Object.entries(projTimers)) {
        if (pt.running && pt.startedAt) {
          const elapsed = (pt.elapsed || 0) + Math.floor((Date.now() - pt.startedAt) / 1000);
          updateTaskDB(taskId, { elapsedSec: elapsed });
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [projTimers]);

  // Save timer state when tab becomes hidden (sleep, screen lock, switch tabs)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        for (const [taskId, pt] of Object.entries(projTimers)) {
          if (pt.running && pt.startedAt) {
            const elapsed = (pt.elapsed || 0) + Math.floor((Date.now() - pt.startedAt) / 1000);
            updateTaskDB(taskId, { elapsedSec: elapsed });
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [projTimers]);

  // ── Data loading ──
  const loadDayTasks = useCallback(async () => {
    setLoadingTasks(true);
    // Fetch tasks for the date view: tasks added to this date + tasks with deadline ≤ this date
    const tasks = await fetchTasksForDateView(date);
    setDayTasks(tasks);
    setLoadingTasks(false);
  }, [date]);

  const loadAllActive = useCallback(async () => {
    const tasks = await fetchAllActiveTasksUnified();
    setAllActiveTasks(tasks);
  }, []);

  const loadSpecialTasks = useCallback(async () => {
    try {
      const [del, inp, art, rep] = await Promise.all([
        fetchTasksByType("delegation").catch(() => []),
        fetchTasksByType("inprogress").catch(() => []),
        fetchTasksByType("article").catch(() => []),
        fetchTasksByType("report").catch(() => []),
      ]);
      setDelegations(del);
      setInprogress(inp);
      setArticles(art);
      setReports(rep);
    } catch (e) {
      console.error("loadSpecialTasks:", e);
    }
  }, []);

  useEffect(() => { loadDayTasks(); }, [loadDayTasks]);
  useEffect(() => { loadSpecialTasks(); }, [loadSpecialTasks]);

  // Refresh when FAB or other external component adds a task
  useEffect(() => {
    if (taskRefreshSignal > 0) {
      loadDayTasks();
      loadSpecialTasks();
    }
  }, [taskRefreshSignal, loadDayTasks, loadSpecialTasks]);

  // Auto-insert recurring tasks for the current date
  const recurringInserted = useRef(new Set());
  useEffect(() => {
    if (recurring.length > 0 && date && !recurringInserted.current.has(date)) {
      recurringInserted.current.add(date);
      autoInsertRecurringTasks(date, recurring).then((count) => {
        if (count > 0) loadDayTasks();
      });
    }
  }, [date, recurring, loadDayTasks]);
  useEffect(() => { if (tmTab === "list") loadAllActive(); }, [tmTab, loadAllActive]);

  // Load completed tasks when tab or month changes
  useEffect(() => {
    if (tmTab === "completed") {
      setLoadingCompleted(true);
      fetchCompletedTasksForMonth(completedMonth).then((data) => {
        setCompletedTasks(data);
        setLoadingCompleted(false);
      }).catch(() => { setCompletedTasks([]); setLoadingCompleted(false); });
    }
  }, [tmTab, completedMonth]);

  // Tick every second for live stopwatch
  useEffect(() => {
    const t = setInterval(() => setTicker((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Helpers ──
  const dl = (v) => (v || "").slice(0, 10); // normalize deadline to YYYY-MM-DD
  const getElapsed = (task) => {
    let base = task.elapsedSec || 0;
    if (task.running && task.runStartedAt) base += Math.floor((Date.now() - task.runStartedAt) / 1000);
    return base;
  };

  // Project/client tasks for the selected date (from tasks table)
  const [todayProjTasks, setTodayProjTasks] = useState([]);
  const loadProjTasksForDate = useCallback(async () => {
    const rows = await fetchClientTasksForDate(date);
    // Enrich with project color info
    const result = rows.map((t) => {
      const projMatch = (projects || []).find((p) => p.name === (t.clientName || t.project));
      const pcc = projMatch ? (CAT_COLORS[(projMatch.services || [projMatch.category])[0]] || CAT_COLORS["SEO"]) : { color: T.accent };
      const d = dl(t.deadline);
      const isOverdue = d && d < date && d < todayKey();
      return { id: t.id, text: t.name, done: t.done, deadline: t.deadline, linkId: t.linkId, service: t.service, memo: t.memo, taskType: t.taskType, _pid: projMatch?.id || "__daily", _pname: t.clientName || t.project || "日次タスク", _pcc: pcc.color, _isOverdue: isOverdue, _dbId: t.id };
    });
    setTodayProjTasks(result);
  }, [date, projects]);
  useEffect(() => { loadProjTasksForDate(); }, [loadProjTasksForDate]);

  // Dedup: exclude project tasks already in dayTasks (by linkId)
  const dayTaskLinkIds = useMemo(() => new Set(dayTasks.filter(t => t.linkId).map(t => t.linkId)), [dayTasks]);
  const extraProjTasks = useMemo(() => todayProjTasks.filter(t => !t.linkId || !dayTaskLinkIds.has(t.linkId)), [todayProjTasks, dayTaskLinkIds]);
  // Split project tasks: regular (default) vs inprog
  // 進行中タスクは「期限が閲覧日」or「期限切れ（overdue）」のものだけ today タブに表示
  // 過去日を閲覧時: 未完了の繰越タスクは「今日」に表示されるため非表示
  const regularProjTasks = useMemo(() => {
    const today = todayKey();
    return extraProjTasks.filter(t => {
      // 過去日: 未完了の繰越タスクは今日に移動済みなので非表示
      if (date < today && !t.done) return false;
      return t.taskType !== "inprogress" || (t.deadline && (dl(t.deadline) === date || t._isOverdue));
    });
  }, [extraProjTasks, date]);
  // Past date: count undone tasks that can be moved to today
  const undoneOnPastDate = useMemo(() => date < todayKey() ? regularProjTasks.filter(t => !t.done).length : 0, [regularProjTasks, date]);
  // Today: count tasks that carried over (for badge display)
  const overdueCount = useMemo(() => regularProjTasks.filter(t => t._isOverdue && !t.done).length, [regularProjTasks]);
  // In-progress project tasks: 期限が閲覧日のものは today タブに出すので、ここでは除外
  const todayInprogLinkIds = useMemo(() => new Set(
    regularProjTasks.filter(t => t.taskType === "inprogress").map(t => t.id)
  ), [regularProjTasks]);
  const inprogProjTasks = useMemo(() => {
    const result = [];
    const todayStr = todayKey();
    (projects || []).forEach((p) => {
      const pcc = (CAT_COLORS[(p.services || [p.category])[0]] || CAT_COLORS["SEO"]);
      (p.tasks || []).forEach((t) => {
        if (t.taskType !== "inprogress" || t.done || todayInprogLinkIds.has(t.id)) return;
        // 期限なし or 期限が今日以前のもののみ表示（未来のものは除外）
        const d = t.deadline ? dl(t.deadline) : null;
        if (d && d > todayStr) return;
        result.push({ ...t, _pid: p.id, _pname: p.name, _pcc: pcc.color });
      });
    });
    return result;
  }, [projects, todayInprogLinkIds]);

  // 依頼・進行中は専用タブで表示するため、today タブには daily タスクのみ表示
  // 過去日を閲覧時: 未完了の期限切れタスクは「今日」に繰越表示されるため、元の日には表示しない（1:1対応）
  const visibleDayTasks = useMemo(() => {
    const today = todayKey();
    return dayTasks.filter((t) => {
      if (t.taskType && t.taskType !== "daily") return false;
      if (t.deadline && dl(t.deadline) !== date) return false;
      // 過去日: 未完了で期限切れのタスクは今日ビューに移動済みなので非表示
      if (date < today && !t.done && t.deadline && dl(t.deadline) <= today) return false;
      return true;
    });
  }, [dayTasks, date]);
  const completed = visibleDayTasks.filter((t) => t.done).length + regularProjTasks.filter(t => t.done).length;
  const total = visibleDayTasks.length + regularProjTasks.length;
  const totalEstimate = visibleDayTasks.reduce((s, t) => s + (t.estimateSec || 0), 0) + regularProjTasks.reduce((s, t) => s + (t.estimateSec || 0), 0);
  const totalElapsed = visibleDayTasks.reduce((s, t) => s + getElapsed(t), 0) + regularProjTasks.reduce((s, t) => { try { const pt = projTimers[t.id]; if (!pt) return s; let base = pt.elapsed || 0; if (pt.running && pt.startedAt) base += Math.floor((Date.now() - pt.startedAt) / 1000); return s + base; } catch { return s; } }, 0);
  const pendingDelegCount = delegations.filter((d) => !d.done && d.status !== "done").length;

  // ── Daily Task CRUD ──
  const addTask = async () => {
    if (!newName.trim()) return;
    const task = { name: newName.trim(), estimateSec: newEst * 60, project: newProject || null, taskType: "daily", deadline: date + "T00:00:00" };
    await insertTaskDB(date, task);
    await loadDayTasks();
    setNewName(""); setNewEst(30); setNewProject(""); setAdding(false);
  };

  const addBulkTasks = async () => {
    const lines = bulkText.split("\n").map((l) => l.replace(/^[\s\-\*•\d.)\]]+/, "").trim()).filter(Boolean);
    if (lines.length === 0) return;
    for (const line of lines) {
      await insertTaskDB(date, { name: line, estimateSec: newEst * 60, project: newProject || null, taskType: "daily", deadline: date + "T00:00:00" });
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
        const u = { ...t, done: true, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null, completedAt: new Date().toISOString() };
        updateTaskDB(id, u);
        if (u.linkId) syncTaskStatus(u.linkId, true);
        return u;
      }
      const u = { ...t, done: false, completedAt: null };
      updateTaskDB(id, u);
      if (u.linkId) syncTaskStatus(u.linkId, false);
      return u;
    });
    setDayTasks(updated);
    // Also refresh the all-active list if it was loaded
    if (allActiveTasks.length > 0) loadAllActive();
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

  // Inline deadline edit
  const dlSavingRef = useRef(false);

  const saveDeadlineEdit = async (id, mmdd, afterSave) => {
    if (dlSavingRef.current) return; // Prevent double-save from Enter + Blur
    dlSavingRef.current = true;
    const iso = mmdd ? toISO(mmdd) : null;
    setEditDL(null);
    try {
      if (afterSave) await afterSave(id, iso);
    } finally {
      dlSavingRef.current = false;
    }
  };

  // Helper: update project task deadline (for tasks stored in projects state, not tasks table)
  const saveProjTaskDeadline = async (projId, taskId, iso) => {
    // Update directly in tasks table
    await updateTaskDB(taskId, { deadline: iso });
    // Optimistic update for today's project tasks
    setTodayProjTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, deadline: iso } : t));
    // Also sync JSONB for cross-view compat
    const task = todayProjTasks.find((t) => t.id === taskId);
    if (task?.linkId) await updateTaskByLinkId(task.linkId, { deadline: iso });
  };

  // Helper: reschedule undone tasks from the currently viewed (past) date to today
  const rescheduleToToday = async () => {
    const today = todayKey();
    if (date >= today) return; // only works on past dates
    const todayISO = today + "T00:00:00";
    let movedCount = 0;

    // 1) Project/client tasks (from todayProjTasks, backed by tasks table)
    const undoneProjTasks = todayProjTasks.filter((t) => !t.done && t.taskType !== "inprogress");
    for (const t of undoneProjTasks) {
      await updateTaskDB(t.id, { deadline: todayISO, taskDate: today });
      movedCount++;
    }

    // 2) Daily tasks (dayTasks from tasks table)
    const undoneDayTasks = dayTasks.filter((t) => !t.done && t.taskType !== "inprogress");
    for (const t of undoneDayTasks) {
      await updateTaskDB(t.id, { deadline: todayISO, taskDate: today });
      movedCount++;
    }

    if (movedCount === 0) return;
    setToast(`📅 ${movedCount}件のタスクを今日に移動しました`);
    setDate(today); // 移動後、今日のビューに切り替え
  };

  // Helper: toggle project task type between regular and inprogress
  const toggleProjTaskType = async (projId, taskId) => {
    const task = todayProjTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newType = task.taskType === "inprogress" ? "daily" : "inprogress";
    // Update tasks table
    await updateTaskDB(taskId, { taskType: newType, ballHolder: newType === "inprogress" ? (task._ball || "self") : null });
    // Optimistic update
    setTodayProjTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, taskType: newType } : t));
    setToast(newType === "inprogress" ? "🔄 進行中に変更" : "📋 通常タスクに変更");
  };

  // Helper: cycle ball holder on project task
  const cycleProjBallHolder = async (projId, taskId) => {
    const task = todayProjTasks.find((t) => t.id === taskId);
    if (!task) return;
    const curIdx = BALL_HOLDERS.findIndex((b) => b.id === (task._ball || "self"));
    const nextBall = BALL_HOLDERS[(curIdx + 1) % BALL_HOLDERS.length].id;
    await updateTaskDB(taskId, { ballHolder: nextBall });
    setTodayProjTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, _ball: nextBall } : t));
  };

  // Helper: edit project task (name, estimate)
  const saveProjTaskEdit = async () => {
    if (!editingProjTask) return;
    const { id, text, estimateMin, elapsedMin } = editingProjTask;
    const elapsedSec = elapsedMin !== undefined ? (elapsedMin || 0) * 60 : (projTimers[id]?.elapsed || 0);
    await updateTaskDB(id, { name: text, estimateSec: (estimateMin || 0) * 60, elapsedSec });
    setTodayProjTasks((prev) => prev.map((t) => t.id === id ? { ...t, text, estimateSec: (estimateMin || 0) * 60, elapsedSec } : t));
    setEditingProjTask(null);
  };

  // Helper: save memo on project task
  const saveProjMemo = async (projId, taskId) => {
    await updateTaskDB(taskId, { memo: projMemoText || null });
    setTodayProjTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, memo: projMemoText || null } : t));
    setEditingProjMemo(null);
    setProjMemoText("");
  };

  // Helper: delete project task
  const deleteProjTask = async (projId, taskId) => {
    await deleteTaskDB(taskId);
    setTodayProjTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const renderDeadline = (taskId, deadline, { prefix = "〆 ", color = T.warning, overrideColor, fontSize = 9, afterSave, showEmpty = false } = {}) => {
    const displayColor = overrideColor || color;
    if (editDL?.id === taskId) {
      return (
        <input
          autoFocus
          value={editDL.val}
          onChange={(e) => setEditDL({ ...editDL, val: fmtDateInput(e.target.value) })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.target.blur(); saveDeadlineEdit(taskId, editDL.val, afterSave); }
            if (e.key === "Escape") setEditDL(null);
          }}
          onBlur={() => saveDeadlineEdit(taskId, editDL.val, afterSave)}
          placeholder="MM/DD"
          style={{ width: 56, padding: "2px 5px", background: T.bg, border: `1px solid ${T.accent}`, borderRadius: T.radiusXs, color: T.text, fontSize, fontFamily: T.font, textAlign: "center", outline: "none" }}
        />
      );
    }
    if (!deadline && !showEmpty) return null;
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditDL({ id: taskId, val: deadline ? deadline.slice(5, 10).replace(/-/g, "/") : "" }); }}
        style={{ fontSize, color: displayColor, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
        title="クリックで日付を編集"
      >
        {deadline ? `${prefix}${dlDisplay(deadline)}` : `${prefix}--/--`}
      </span>
    );
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

  // Quick timer elapsed
  const getQtElapsed = () => {
    if (!qtRunning || !qtStartedAt) return 0;
    return Math.floor((Date.now() - qtStartedAt) / 1000);
  };

  // Total quick timer seconds for today
  const qtTotalSec = useMemo(() => {
    return dayTasks.filter((t) => t.name && t.name.includes("チャット・雑務") && t.done).reduce((s, t) => s + (t.elapsedSec || 0), 0);
  }, [dayTasks]);

  const qtToggle = async () => {
    if (qtRunning) {
      const elapsed = qtStartedAt ? Math.floor((Date.now() - qtStartedAt) / 1000) : 0;
      setQtRunning(false); setQtStartedAt(null);
      if (elapsed > 60) {
        const num = qtCount + 1;
        setQtCount(num);
        await insertTaskDB(date, { name: `💬 ${num} チャット・雑務`, estimateSec: elapsed, elapsedSec: elapsed, done: true, taskType: "daily", deadline: date + "T00:00:00", completedAt: new Date().toISOString() });
        await loadDayTasks();
      }
    } else {
      setQtRunning(true); setQtStartedAt(Date.now());
    }
  };

  // Project deadline task helpers
  const getProjElapsed = (task) => {
    const pt = projTimers[task.id];
    if (!pt) return 0;
    let base = pt.elapsed || 0;
    if (pt.running && pt.startedAt) base += Math.floor((Date.now() - pt.startedAt) / 1000);
    return base;
  };

  // Persist project task elapsed time to tasks table
  const persistProjElapsed = useCallback(async (projId, taskId, elapsedSec) => {
    await updateTaskDB(taskId, { elapsedSec });
  }, []);

  const toggleProjTimer = (projId, taskId) => {
    const pt = projTimers[taskId] || { running: false, startedAt: null, elapsed: 0 };
    if (pt.running) {
      // Pausing - calculate elapsed and persist
      const extra = pt.startedAt ? Math.floor((Date.now() - pt.startedAt) / 1000) : 0;
      const newElapsed = (pt.elapsed || 0) + extra;
      setProjTimers((prev) => ({ ...prev, [taskId]: { running: false, startedAt: null, elapsed: newElapsed } }));
      persistProjElapsed(projId, taskId, newElapsed);
    } else {
      // Starting - stop other running timers and persist their elapsed
      const next = {};
      for (const [k, v] of Object.entries(projTimers)) {
        if (v.running) {
          const extra = v.startedAt ? Math.floor((Date.now() - v.startedAt) / 1000) : 0;
          const newElapsed = (v.elapsed || 0) + extra;
          next[k] = { running: false, startedAt: null, elapsed: newElapsed };
          persistProjElapsed(null, k, newElapsed);
        } else {
          next[k] = v;
        }
      }
      next[taskId] = { running: true, startedAt: Date.now(), elapsed: pt.elapsed || 0 };
      setProjTimers(next);
    }
  };

  const toggleProjDone = async (projId, taskId) => {
    // Find task in todayProjTasks (loaded from tasks table)
    const task = todayProjTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newDone = !task.done;
    const completedAt = newDone ? new Date().toISOString() : null;
    // Optimistic update
    setTodayProjTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, done: newDone, completedAt } : t));
    // Persist to tasks table (source of truth)
    await updateTaskDB(taskId, { done: newDone, completedAt });
    // Sync JSONB + tasks state for cross-view compatibility
    if (task.linkId) syncTaskStatus(task.linkId, newDone);
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
    setToast("✅ 依頼タスク追加");
  };

  const cycleDelegStatus = async (id) => {
    // done は cycle から除外 (意図しない完了を防ぐ)。完了は別ボタンで明示的に。
    const cycle = ["pending", "inprogress", "waiting"];
    const task = delegations.find((d) => d.id === id);
    if (!task) return;
    // 既知の status でなければ pending から開始
    const cur = cycle.indexOf(task.status || "pending");
    const next = cycle[(cur === -1 ? 0 : (cur + 1) % cycle.length)];
    const updates = { status: next };
    setDelegations((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
    await updateTaskDB(id, updates);
  };

  // 依頼タスクの完了トグル (inprogress と同じパターン)
  const toggleDelegDone = async (id) => {
    const task = delegations.find((d) => d.id === id);
    if (!task) return;
    const nextDone = !task.done;
    const updates = {
      done: nextDone,
      completedAt: nextDone ? new Date().toISOString() : null,
    };
    setDelegations((prev) => prev.map((d) => (d.id === id ? { ...d, done: nextDone, completedAt: updates.completedAt } : d)));
    await updateTaskDB(id, updates);
    if (task.linkId) syncTaskStatus(task.linkId, nextDone);
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

  // Add a daily task from an in-progress task
  const addTaskFromInprog = async (inprogTask) => {
    if (!fromInprogName.trim()) return;
    await insertTaskDB(date, {
      name: fromInprogName.trim(),
      project: inprogTask.project || null,
      estimateSec: 1800,
      taskType: "daily",
      status: "inprog_child",
      deadline: date + "T00:00:00",
    });
    await loadDayTasks();
    setFromInprogName("");
    setAddingFromInprog(null);
    setToast("✅ 自分タスク追加");
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

  // ── Article CRUD removed (Phase K, 2026-04-10): 記事は記事管理シートが真実 ──

  // ── Report stage toggle (Phase L) ──
  // 3 ステージ (データ取得 / レポート生成 / 送信) を Stack で更新
  // 注: sync-stack.py の REPORT_DIFF_FIELDS から stage 列を除外しているので
  //     Stack 値が次回 sync (5 分ごと) で sheet 値に巻き戻されることはない。
  //     さらに --writeback フラグで Stack の stage 値を sheet 側にも逆同期している。
  const toggleReportStage = async (id, stageField) => {
    const rep = reports.find((r) => r.id === id);
    if (!rep) return;
    const cur = rep[stageField];
    const next = (cur === "完了") ? "未着手" : "完了";
    const updates = { [stageField]: next };
    // 送信が完了 → done=true (一方向)
    if (stageField === "reportSend" && next === "完了") {
      updates.done = true;
      updates.completedAt = new Date().toISOString();
    }
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    await updateTaskDB(id, updates);
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

  // ── Sheet-sourced task indicator (Phase J-5d / K+L) ──
  // sheet_key != null のタスクは「施策管理シート / 記事管理シート / レポート管理シート」由来。
  // task_type ごとに編集可能範囲が違うのでバッジを出し分ける:
  //   - daily/inprogress/delegation : シートが真実 / done・ball・タイマーは Stack 操作可 → 🔒
  //   - article                     : シートが真実 / Stack は完全 view-only       → 👁
  //   - report                      : Stack が編集の主役 / 5 分ごとにシートへ writeback → ✏️
  const SheetLockBadge = ({ task }) => {
    if (!task || !task.sheetKey) return null;
    const tt = task.task_type || task.taskType;
    let icon = "🔒";
    let title = "📚 施策管理シート由来のタスクです\n・完了チェック / ボール保持者 / サブタスク / タイマーは Stack で操作できます\n・タスク名 / 期限 / 案件 / 担当者 はシートで編集してください（Stack で変更しても次回 sync で上書きされます）";
    let color = T.cyan;
    if (tt === "article") {
      icon = "👁";
      title = "📝 記事管理シート由来 (view-only)\n・山岸チームの進捗を Stack で監視するためのタスクです\n・全フィールドはシート側で編集してください（Stack では変更できません）";
      color = T.textMuted;
    } else if (tt === "report") {
      icon = "✏️";
      title = "📊 レポート管理シート由来 (Stack 編集可)\n・データ取得 / レポート生成 / 送信 のステージは Stack で更新できます\n・更新内容は 5 分ごとの自動同期でシートにも反映されます";
      color = T.warning;
    }
    return (
      <span
        title={title}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, flexShrink: 0, opacity: 0.75, cursor: "help",
          color,
        }}
      >
        {icon}
      </span>
    );
  };

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
            { id: "inprog", label: "🔄 進行中", badge: inprogress.filter((t) => !t.done).length + pendingDelegCount },
            { id: "monthly", label: "📆 月次", badge: recurring.length },
            { id: "articles", label: "📝 記事", badge: articles.filter((a) => { const st = ART_STEPS.find((s) => s.id === a.status); return st && st.self; }).length },
            { id: "reports", label: "📊 レポート", badge: reports.filter((r) => !r.done && r.month === reportMonthFilter).length },
            { id: "completed", label: "✅ 完了" },
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
          <button onClick={() => {
            const td = date;
            const allItems = [];
            (projects || []).forEach((p) => {
              (p.tasks || []).forEach((t) => {
                if (!t.done && t.deadline && dl(t.deadline) === td) {
                  allItems.push({ text: t.text, pname: p.name, deadline: dl(t.deadline) });
                }
              });
            });
            visibleDayTasks.filter((t) => !t.done).forEach((t) => {
              allItems.push({ text: t.name, pname: t.project || "", deadline: td });
            });
            const byDate = {};
            const dateOrder = [];
            allItems.forEach((t) => {
              const d = t.deadline || td;
              if (!byDate[d]) { byDate[d] = []; dateOrder.push(d); }
              byDate[d].push(t);
            });
            dateOrder.sort();
            const lines = ["＃タスク一覧（" + td.slice(5, 10).replace("-", "/") + "）"];
            dateOrder.forEach((d) => {
              lines.push("");
              lines.push("▼" + d.slice(5, 10).replace("-", "/"));
              byDate[d].forEach((t) => {
                lines.push("・" + t.text + (t.pname ? " [" + t.pname + "]" : ""));
              });
            });
            setExportText(lines.join("\n"));
          }} style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textMuted, fontSize: 9, cursor: "pointer", fontFamily: T.font }}>📤 エクスポート</button>
        </div>

        {/* Export panel */}
        {exportText && <Card style={{ padding: "12px 14px", border: `1px solid ${T.accent}33`, background: T.accent + "05" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>📤 エクスポート結果</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { navigator.clipboard.writeText(exportText).then(() => setToast("📋 コピーしました")); }} style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${T.accent}44`, background: T.accent + "10", color: T.accent, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>コピー</button>
              <button onClick={() => setExportText("")} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textMuted, fontSize: 10, cursor: "pointer", fontFamily: T.font }}>✕</button>
            </div>
          </div>
          <textarea readOnly value={exportText} onFocus={(e) => e.target.select()} style={{ width: "100%", minHeight: 200, padding: "10px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", outline: "none" }} />
        </Card>}

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

        {/* ── チャット・雑務 Card (always visible on today) ── */}
        {date === todayKey() && (
          <Card style={{ padding: "12px 16px", border: `1px solid ${qtRunning ? T.warning + "66" : T.warning + "22"}`, background: qtRunning ? T.warning + "08" : T.bgCard }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>💬</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>チャットの返信・雑務</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                  {qtRunning ? "計測中..." : "▶で開始 → ⏹で停止してタスクに記録"}
                  {qtTotalSec > 0 && !qtRunning && <span style={{ marginLeft: 8, color: T.warning }}>本日合計: {fmtSec(qtTotalSec)}</span>}
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: "'SF Mono','Menlo',monospace", color: qtRunning ? T.warning : T.textMuted, minWidth: 70, textAlign: "right", letterSpacing: 1 }}>
                {fmtSec(getQtElapsed())}
              </div>
              <button onClick={qtToggle} style={{ width: 48, height: 48, borderRadius: "50%", border: `2px solid ${qtRunning ? T.error : T.warning}`, background: qtRunning ? T.error + "15" : T.warning + "15", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, transition: "all 0.2s" }}>
                {qtRunning ? "⏹" : "▶"}
              </button>
            </div>
          </Card>
        )}

        {loadingTasks && <div style={{ textAlign: "center", color: T.textMuted, fontSize: 13, padding: 16 }}>読み込み中...</div>}

        {/* Past date: move undone tasks to today */}
        {undoneOnPastDate > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: T.radiusXs, background: T.warning + "10", border: `1px solid ${T.warning}33` }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ flex: 1, fontSize: 12, color: T.warning, fontWeight: 600 }}>未完了タスク {undoneOnPastDate}件</span>
            <button onClick={rescheduleToToday} style={{ padding: "4px 12px", borderRadius: 4, border: `1px solid ${T.warning}55`, background: T.warning + "18", color: T.warning, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: T.font, whiteSpace: "nowrap" }}>📅 今日に移動</button>
          </div>
        )}

        {/* All tasks (project + daily) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {regularProjTasks.filter(t => !t.done).map((t) => {
              const isOver = t._isOverdue || (t.deadline && dl(t.deadline) < todayKey());
              const elapsed = getProjElapsed(t);
              const isRunning = !!(projTimers[t.id] && projTimers[t.id].running);
              const estSec = t.estimateSec || 0;
              const pct = estSec > 0 ? Math.min(elapsed / estSec, 1) : 0;
              const over = elapsed > estSec && estSec > 0;
              const barColor = t.done ? T.success : over ? T.error : isRunning ? T.accent : T.textMuted;
              return (
                <Card key={t.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${isRunning ? T.accent + "55" : t._isOverdue ? T.warning + "44" : T.border}`, background: isRunning ? T.accent + "06" : t._isOverdue ? T.warning + "04" : T.bgCard }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                    <button onClick={() => toggleProjDone(t._pid, t.id)} style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid ${t.done ? T.success : T.border}`, background: t.done ? T.success + "22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.success, flexShrink: 0 }}>
                      {t.done ? "✓" : ""}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {t._pname && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.accent + "15", color: T.accent }}>{truncate(t._pname, 12)}</span>}
                        {t._isOverdue && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: T.warning + "20", color: T.warning, fontWeight: 700 }}>{t.rescheduledFrom ? "繰越" : "期限切れ"}</span>}
                        <span style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        {renderDeadline(t.id, t.deadline, { prefix: "〆 ", fontSize: 10, showEmpty: true, overrideColor: isOver ? T.error : T.textMuted, afterSave: async (id, iso) => { await saveProjTaskDeadline(t._pid, id, iso); if (iso && iso.slice(0, 10) !== date) { setToast(`📅 ${t.text} を ${iso.slice(5, 10).replace("-", "/")} に移動`); } } })}
                        {t.rescheduledFrom && <span style={{ fontSize: 9, color: T.warning }}>← {t.rescheduledFrom.slice(5).replace("-", "/")}</span>}
                        <span style={{ fontSize: 10, color: T.textMuted }}>見積: {fmtSec(estSec)}</span>
                        {t.memo && <span style={{ fontSize: 10, color: T.warning }}>📝</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: `'SF Mono', monospace`, color: t.done ? T.success : over ? T.error : isRunning ? T.accent : T.text }}>{fmtSec(elapsed)}</div>
                      {over && !t.done && <div style={{ fontSize: 9, color: T.error }}>+{fmtSec(elapsed - estSec)}</div>}
                    </div>
                    {!t.done ? (
                      <button onClick={() => toggleProjTimer(t._pid, t.id)} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${isRunning ? T.error : T.success}`, background: isRunning ? T.error + "15" : T.success + "15", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{isRunning ? "⏸" : "▶"}</button>
                    ) : (
                      <button onClick={() => { setProjTimers((prev) => ({ ...prev, [t.id]: { running: false, startedAt: null, elapsed: 0 } })); persistProjElapsed(t._pid, t.id, 0); }} title="リセット" style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${T.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, color: T.textMuted }}>↺</button>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => toggleProjTaskType(t._pid, t.id)} title="進行中に変更" style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.5 }}>🔄</button>
                      <button onClick={() => setEditingProjTask({ _pid: t._pid, id: t.id, text: t.text, estimateMin: Math.round(estSec / 60) })} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.5 }}>✏️</button>
                      <button onClick={() => deleteProjTask(t._pid, t.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                    </div>
                  </div>
                  {editingProjTask?.id === t.id && (
                    <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, background: T.bg, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <input value={editingProjTask.text} onChange={(e) => setEditingProjTask({ ...editingProjTask, text: e.target.value })} style={{ flex: 1, minWidth: 120, padding: "5px 8px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                      <input type="number" value={editingProjTask.estimateMin} onChange={(e) => setEditingProjTask({ ...editingProjTask, estimateMin: parseInt(e.target.value) || 0 })} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                      <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                      <Btn onClick={saveProjTaskEdit} style={{ fontSize: 10, padding: "4px 10px" }}>保存</Btn>
                      <Btn variant="ghost" onClick={() => setEditingProjTask(null)} style={{ fontSize: 10, padding: "4px 8px" }}>✕</Btn>
                    </div>
                  )}
                  <div style={{ height: 3, background: T.border }}>
                    <div style={{ height: 3, background: barColor, width: `${Math.min(pct * 100, 100)}%`, transition: "width 0.5s", opacity: 0.7 }} />
                  </div>
                </Card>
              );
            })}
          {visibleDayTasks.filter(t => !t.done).map((task) => {
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
                      {task.status === "inprog_child" && (() => { const tbh = getBallHolder(task.ballHolder); return (<button onClick={async () => { const curIdx = BALL_HOLDERS.findIndex((b) => b.id === (task.ballHolder || "self")); const nextBall = BALL_HOLDERS[(curIdx + 1) % BALL_HOLDERS.length].id; setDayTasks((prev) => prev.map((dt) => dt.id === task.id ? { ...dt, ballHolder: nextBall } : dt)); await updateTaskDB(task.id, { ballHolder: nextBall }); }} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 99, background: tbh.color + "22", color: tbh.color, border: `1px solid ${tbh.color}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, flexShrink: 0 }}>{tbh.label}</button>); })()}
                      {task.project && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.accent + "15", color: T.accent }}>{truncate(task.project, 12)}</span>}
                      <SheetLockBadge task={task} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: task.done ? T.textMuted : T.text, textDecoration: task.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                      {renderDeadline(task.id, task.deadline, { prefix: "〆 ", fontSize: 10, showEmpty: true, overrideColor: dl(task.deadline) < todayKey() ? T.error : T.textMuted, afterSave: async (id, iso) => { setDayTasks((prev) => prev.map((dt) => dt.id === id ? { ...dt, deadline: iso } : dt)); await updateTaskDB(id, { deadline: iso, taskDate: iso ? iso.slice(0, 10) : date }); if (iso && iso.slice(0, 10) !== date) { setToast(`📅 ${task.name} を ${iso.slice(5, 10).replace("-", "/")} に移動`); setTimeout(() => loadDayTasks(), 300); } } })}
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
                    <span style={{ fontSize: 10, color: T.textMuted }}>見積</span>
                    <input type="number" value={editingTask.estimateMin} onChange={(e) => setEditingTask({ ...editingTask, estimateMin: parseInt(e.target.value) || 0 })} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                    <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                    <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 4 }}>実績</span>
                    <input type="number" value={editingTask.elapsedMin} onChange={(e) => setEditingTask({ ...editingTask, elapsedMin: parseInt(e.target.value) || 0 })} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
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

        {/* ── 完了タスク ── */}
        {(() => {
          const doneTasks = visibleDayTasks.filter(t => t.done);
          const doneProjTasks = regularProjTasks.filter(t => t.done);
          const totalDone = doneTasks.length + doneProjTasks.length;
          if (totalDone === 0) return null;
          return (
            <div>
              <button onClick={() => setDoneSectionOpen(!doneSectionOpen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "8px 4px", background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>
                <span style={{ fontSize: 10, color: T.success, transition: "transform 0.2s", transform: doneSectionOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.success }}>✅ 完了タスク（{totalDone}）</span>
              </button>
              {doneSectionOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {doneProjTasks.map((t) => {
                    const elapsed = getProjElapsed(t);
                    const openProjEdit = () => setEditingProjTask(editingProjTask?.id === t.id ? null : { _pid: t._pid, id: t.id, text: t.text, estimateMin: Math.round((t.estimateSec || 0) / 60), elapsedMin: Math.round(elapsed / 60) });
                    return (
                      <Card key={t.id} style={{ padding: 0, overflow: "hidden", opacity: 0.7 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }} onClick={openProjEdit}>
                          <button onClick={(e) => { e.stopPropagation(); toggleProjDone(t._pid, t.id); }} style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${T.success}`, background: T.success + "22", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.success, flexShrink: 0 }}>✓</button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: T.textMuted, textDecoration: "line-through" }}>{t.text}</span>
                            {t._pname && <span style={{ fontSize: 9, color: T.textDim, marginLeft: 6 }}>[{truncate(t._pname, 12)}]</span>}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFamily: "'SF Mono', monospace", color: T.success }}>{fmtSec(elapsed)}</span>
                          <span style={{ fontSize: 11, color: T.textDim }}>✏️</span>
                        </div>
                        {editingProjTask?.id === t.id && (
                          <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, background: T.bg, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 10, color: T.textMuted }}>実績</span>
                              <input type="number" value={editingProjTask.elapsedMin} onChange={(e) => setEditingProjTask({ ...editingProjTask, elapsedMin: parseInt(e.target.value) || 0 })} onClick={(e) => e.stopPropagation()} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                              <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 10, color: T.textMuted }}>見積</span>
                              <input type="number" value={editingProjTask.estimateMin} onChange={(e) => setEditingProjTask({ ...editingProjTask, estimateMin: parseInt(e.target.value) || 0 })} onClick={(e) => e.stopPropagation()} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                              <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                            </div>
                            <Btn onClick={(e) => { e.stopPropagation(); setProjTimers((prev) => ({ ...prev, [t.id]: { ...prev[t.id], running: false, elapsed: (editingProjTask.elapsedMin || 0) * 60 } })); saveProjTaskEdit(); }} style={{ fontSize: 10, padding: "4px 10px" }}>保存</Btn>
                            <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingProjTask(null); }} style={{ fontSize: 10, padding: "4px 8px" }}>✕</Btn>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  {doneTasks.map((task) => {
                    const elapsed = getElapsed(task);
                    const openEdit = () => setEditingTask(editingTask?.id === task.id ? null : { id: task.id, name: task.name, project: task.project, estimateMin: Math.round((task.estimateSec || 0) / 60), elapsedMin: Math.round(elapsed / 60) });
                    return (
                      <Card key={task.id} style={{ padding: 0, overflow: "hidden", opacity: 0.7 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }} onClick={openEdit}>
                          <button onClick={(e) => { e.stopPropagation(); markDone(task.id); }} style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${T.success}`, background: T.success + "22", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.success, flexShrink: 0 }}>✓</button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12, color: T.textMuted, textDecoration: "line-through" }}>{task.name}</span>
                            {task.project && <span style={{ fontSize: 9, color: T.textDim, marginLeft: 6 }}>[{truncate(task.project, 12)}]</span>}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFamily: "'SF Mono', monospace", color: T.success }}>{fmtSec(elapsed)}</span>
                          <span style={{ fontSize: 11, color: T.textDim }}>✏️</span>
                        </div>
                        {editingTask?.id === task.id && (
                          <div style={{ padding: "8px 12px", borderTop: `1px solid ${T.border}`, background: T.bg, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 10, color: T.textMuted }}>実績</span>
                              <input type="number" value={editingTask.elapsedMin} onChange={(e) => setEditingTask({ ...editingTask, elapsedMin: parseInt(e.target.value) || 0 })} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                              <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 10, color: T.textMuted }}>見積</span>
                              <input type="number" value={editingTask.estimateMin} onChange={(e) => setEditingTask({ ...editingTask, estimateMin: parseInt(e.target.value) || 0 })} style={{ width: 50, padding: "5px 4px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                              <span style={{ fontSize: 10, color: T.textMuted }}>分</span>
                            </div>
                            <Btn onClick={saveTaskEdit} style={{ fontSize: 10, padding: "4px 10px" }}>保存</Btn>
                            <Btn variant="ghost" onClick={() => setEditingTask(null)} style={{ fontSize: 10, padding: "4px 8px" }}>✕</Btn>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

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
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addTask(); }} autoFocus placeholder="タスク名..." style={{ width: "100%", padding: "7px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font, boxSizing: "border-box" }} />
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

        {/* ── 進行中タスク（inprogress + 案件タスク を統合）── */}
        {(() => {
          const todayInprog = inprogress.filter(t => !t.done);
          const visibleProjTasks = inprogProjTasks;
          const totalCount = todayInprog.length + visibleProjTasks.length;
          if (totalCount === 0) return null;
          return (
            <div style={{ marginTop: 4 }}>
              <button onClick={() => setInprogSectionOpen(!inprogSectionOpen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "8px 4px", background: "none", border: "none", cursor: "pointer", fontFamily: T.font }}>
                <span style={{ fontSize: 10, color: T.cyan, transition: "transform 0.2s", transform: inprogSectionOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.cyan }}>🔄 進行中タスク（{totalCount}）</span>
              </button>
              {inprogSectionOpen && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {/* 案件タスク（projects state） */}
                {visibleProjTasks.map(t => {
                  const bh = getBallHolder(t.ballHolder);
                  const isSelf = (t.ballHolder || "self") === "self";
                  const isOver = t.deadline && dl(t.deadline) < todayKey();
                  return (
                    <Card key={"proj-" + t.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${isSelf ? T.accent + "44" : bh.color + "22"}`, background: isSelf ? T.accent + "06" : T.bgCard }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                        <button onClick={() => cycleProjBallHolder(t._pid, t.id)} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: bh.color + "22", color: bh.color, border: `1px solid ${bh.color}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, flexShrink: 0 }}>{bh.label}</button>
                        {t._pname && <button onClick={() => onNavigateToClient && onNavigateToClient(t._pname)} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.cyan + "20", color: T.cyan, border: `1px solid ${T.cyan}33`, cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>{truncate(t._pname, 12)}</button>}
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
                        {renderDeadline(t.id, t.deadline, { prefix: "", fontSize: 10, showEmpty: true, overrideColor: isOver ? T.error : T.textMuted, afterSave: (id, iso) => saveProjTaskDeadline(t._pid, id, iso) })}
                        <button onClick={() => toggleProjTaskType(t._pid, t.id)} title="通常タスクに変更" style={{ fontSize: 10, padding: "2px 5px", background: "none", border: `1px solid ${T.border}`, borderRadius: 4, color: T.textDim, cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>📋</button>
                        <button onClick={() => { setAddingFromInprog(addingFromInprog === "proj-" + t.id ? null : "proj-" + t.id); setFromInprogName(""); }} title="自分タスクを追加" style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${T.accent}44`, background: addingFromInprog === "proj-" + t.id ? T.accent + "22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.accent, flexShrink: 0 }}>+</button>
                      </div>
                      {addingFromInprog === "proj-" + t.id && (
                        <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${T.border}22`, display: "flex", gap: 6, alignItems: "center" }}>
                          <input value={fromInprogName} onChange={(e) => setFromInprogName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { addTaskFromInprog({ project: t._pname, name: t.text }); } }} autoFocus placeholder="自分タスク名..." style={{ flex: 1, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font, outline: "none" }} />
                          <Btn onClick={() => addTaskFromInprog({ project: t._pname, name: t.text })} disabled={!fromInprogName.trim()} style={{ fontSize: 10, padding: "4px 10px" }}>追加</Btn>
                        </div>
                      )}
                    </Card>
                  );
                })}
                {/* 進行中タスク（tasks table） */}
                {todayInprog.map(t => {
                  const bh = getBallHolder(t.ballHolder);
                  const isSelf = t.ballHolder === "self";
                  return (
                    <Card key={t.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${isSelf ? T.accent + "44" : bh.color + "22"}`, background: isSelf ? T.accent + "06" : T.bgCard }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                        <button onClick={() => updateInprogBall(t.id, BALL_HOLDERS[(BALL_HOLDERS.findIndex((b) => b.id === t.ballHolder) + 1) % BALL_HOLDERS.length].id)} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: bh.color + "22", color: bh.color, border: `1px solid ${bh.color}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, flexShrink: 0 }}>{bh.label}</button>
                        {t.project && <button onClick={() => onNavigateToClient && onNavigateToClient(t.project)} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.cyan + "20", color: T.cyan, border: `1px solid ${T.cyan}33`, cursor: "pointer", fontFamily: T.font, flexShrink: 0 }}>{truncate(t.project, 12)}</button>}
                        <SheetLockBadge task={t} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        {renderDeadline(t.id, t.deadline, { prefix: "", fontSize: 10, showEmpty: true, overrideColor: dl(t.deadline) < todayKey() ? T.error : T.textMuted, afterSave: async (id, iso) => { setInprogress((prev) => prev.map((x) => x.id === id ? { ...x, deadline: iso } : x)); await updateTaskDB(id, { deadline: iso }); } })}
                        <button onClick={() => { setAddingFromInprog(addingFromInprog === t.id ? null : t.id); setFromInprogName(""); }} title="自分タスクを追加" style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${T.accent}44`, background: addingFromInprog === t.id ? T.accent + "22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.accent, flexShrink: 0 }}>+</button>
                      </div>
                      {addingFromInprog === t.id && (
                        <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${T.border}22`, display: "flex", gap: 6, alignItems: "center" }}>
                          <input value={fromInprogName} onChange={(e) => setFromInprogName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addTaskFromInprog(t); }} autoFocus placeholder="自分タスク名..." style={{ flex: 1, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font, outline: "none" }} />
                          <Btn onClick={() => addTaskFromInprog(t)} disabled={!fromInprogName.trim()} style={{ fontSize: 10, padding: "4px 10px" }}>追加</Btn>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>}
            </div>
          );
        })()}

        {/* ── 依頼リマインド ── */}
        {(() => {
          const today = todayKey();
          const reminders = delegations.filter(d => !d.done && d.status !== "done" && d.deadline && dl(d.deadline) <= today);
          if (reminders.length === 0) return null;
          return (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.warning, padding: "6px 0", display: "flex", alignItems: "center", gap: 6 }}>
                <span>⏰</span> 依頼リマインド（{reminders.length}）
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {reminders.map(r => (
                  <Card key={r.id} style={{ padding: "8px 12px", border: `1px solid ${T.warning}22`, background: T.warning + "06" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => cycleDelegStatus(r.id)} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 99, background: delegStatusColor(r.status) + "22", color: delegStatusColor(r.status), border: `1px solid ${delegStatusColor(r.status)}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, whiteSpace: "nowrap" }}>{delegStatusLabel(r.status)}</button>
                      {r.project && <span style={{ fontSize: 9, color: T.textMuted }}>{truncate(r.project, 12)}</span>}
                      <span style={{ flex: 1, fontSize: 13, color: T.text }}>{r.name}</span>
                      {r.assignee && <span style={{ fontSize: 9, color: T.purple }}>→ {r.assignee}</span>}
                      <span style={{ fontSize: 9, color: T.error }}>{dlDisplay(r.deadline)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })()}
      </>}

      {/* ═══ LIST TAB (Unified Task List - matches original) ═══ */}
      {tmTab === "list" && (() => {
        const today = todayKey();
        // All tasks from tasks table (unified source)
        const allTasks = allActiveTasks.map((t) => {
          const projMatch = (projects || []).find((p) => p.name === (t.clientName || t.project));
          const pcc = projMatch ? (CAT_COLORS[(projMatch.services || [projMatch.category])[0]] || CAT_COLORS["SEO"]).color : T.accent;
          return { id: t.id, text: t.name, done: t.done || false, deadline: t.deadline || "", linkId: t.linkId, _pid: projMatch?.id || "__daily", _pname: t.clientName || t.project || "日次タスク", _pcc: pcc, _ball: t.ballHolder, _src: "unified" };
        });
        const open = allTasks.filter((t) => !t.done);
        const overdue = open.filter((t) => dl(t.deadline) && dl(t.deadline) < today).sort((a, b) => dl(a.deadline) > dl(b.deadline) ? 1 : -1);
        const todayItems = open.filter((t) => dl(t.deadline) && dl(t.deadline) === today);
        const upcoming = open.filter((t) => dl(t.deadline) && dl(t.deadline) > today).sort((a, b) => dl(a.deadline) > dl(b.deadline) ? 1 : -1);
        const noDl = open.filter((t) => !dl(t.deadline));

        const toggleListTask = async (t) => {
          await updateTaskDB(t.id, { done: true, completedAt: new Date().toISOString() });
          if (t.linkId) syncTaskStatus(t.linkId, true);
          loadAllActive();
          loadDayTasks();
          loadProjTasksForDate();
        };

        const renderTaskRow = (t) => {
          const isOver = dl(t.deadline) && dl(t.deadline) < today;
          const isToday = dl(t.deadline) && dl(t.deadline) === today;
          const bh = BALL_HOLDERS.find((b) => b.id === t._ball);
          return (
            <div key={t.id + t._pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${T.border}22` }}>
              <button onClick={() => toggleListTask(t)} style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${t.done ? T.success : t._pcc}`, background: t.done ? T.success + "22" : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.success }}>{t.done ? "✓" : ""}</button>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: t._pcc, flexShrink: 0 }} />
              <button onClick={() => onNavigateToClient && onNavigateToClient(t._pname)} style={{ color: T.cyan, fontSize: 12, flexShrink: 0, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: "none", border: `1px solid ${T.cyan}33`, borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontFamily: T.font }}>{t._pname}</button>
              {bh && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: bh.color + "12", color: bh.color, fontWeight: 600, flexShrink: 0 }}>{bh.label}</span>}
              <span style={{ flex: 1, fontSize: 14, color: t.done ? T.textDim : T.text, textDecoration: t.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
              {renderDeadline(t.id, t.deadline, { prefix: "", fontSize: 11, overrideColor: isOver ? T.error : isToday ? T.warning : T.textDim, afterSave: async (id, iso) => {
                await updateTaskDB(id, { deadline: iso });
                loadAllActive(); loadProjTasksForDate();
              } })}
            </div>
          );
        };

        const renderSection = (label, items, color) => {
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <div style={{ fontSize: 13, fontWeight: 600, color, padding: "8px 10px", background: color + "08", borderRadius: T.radiusXs, marginBottom: 2 }}>{label}（{items.length}）</div>
              {items.map(renderTaskRow)}
            </div>
          );
        };

        // Pagination
        const allItems = [...overdue, ...todayItems, ...upcoming, ...noDl];
        const totalPages = Math.ceil(allItems.length / LIST_PAGE_SIZE);
        const pagedOverdue = overdue.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE);
        // Calculate remaining slots after overdue items on this page
        let remaining = LIST_PAGE_SIZE - pagedOverdue.length;
        let offset = Math.max(0, listPage * LIST_PAGE_SIZE - overdue.length);
        const pagedToday = remaining > 0 ? todayItems.slice(offset, offset + remaining) : [];
        remaining -= pagedToday.length;
        offset = Math.max(0, listPage * LIST_PAGE_SIZE - overdue.length - todayItems.length);
        const pagedUpcoming = remaining > 0 ? upcoming.slice(offset, offset + remaining) : [];
        remaining -= pagedUpcoming.length;
        offset = Math.max(0, listPage * LIST_PAGE_SIZE - overdue.length - todayItems.length - upcoming.length);
        const pagedNoDl = remaining > 0 ? noDl.slice(offset, offset + remaining) : [];

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>全保持タスク一覧（未完了 {open.length}件）</div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => {
                  if (open.length === 0) { setToast("⚠️ エクスポートするタスクがありません"); return; }
                  const header = "案件名\tタスク名\t期限\tステータス\tボール";
                  const rows = open.map((t) => [
                    t._pname || "",
                    (t.text || "").replace(/\t/g, " ").replace(/\n/g, " "),
                    t.deadline ? dl(t.deadline) : "",
                    t.done ? "完了" : (dl(t.deadline) && dl(t.deadline) < today ? "期限超過" : "未完了"),
                    BALL_HOLDERS.find((b) => b.id === t._ball)?.label || "",
                  ].join("\t"));
                  navigator.clipboard.writeText(header + "\n" + rows.join("\n")).then(() => {
                    setToast(`📋 ${open.length}件をコピーしました（スプレッドシートに貼り付けできます）`);
                  });
                }} style={{ padding: "4px 10px", fontSize: 11, background: "#7C3AED", color: "#fff", border: "none", borderRadius: T.radiusXs, cursor: "pointer", fontFamily: T.font }}>📋 TSVコピー</button>
                <Btn variant="ghost" onClick={loadAllActive} style={{ fontSize: 11, padding: "4px 10px" }}>🔄</Btn>
              </div>
            </div>

            <Card style={{ padding: "8px 0" }}>
              {renderSection("🔴 期限超過", pagedOverdue, T.error)}
              {renderSection("🟡 今日", pagedToday, T.warning)}
              {renderSection("📅 今後", pagedUpcoming, T.accent)}
              {renderSection("📋 期限なし", pagedNoDl, T.textMuted)}
              {open.length === 0 && <div style={{ fontSize: 13, color: T.textMuted, textAlign: "center", padding: 16 }}>未完了タスクなし</div>}
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <button onClick={() => setListPage((p) => Math.max(0, p - 1))} disabled={listPage === 0} style={{ padding: "6px 12px", fontSize: 13, background: listPage === 0 ? "transparent" : T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6, color: listPage === 0 ? T.textDim : T.text, cursor: listPage === 0 ? "default" : "pointer", fontFamily: T.font }}>←</button>
                <span style={{ fontSize: 13, color: T.textMuted }}>{listPage + 1} / {totalPages}</span>
                <button onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))} disabled={listPage >= totalPages - 1} style={{ padding: "6px 12px", fontSize: 13, background: listPage >= totalPages - 1 ? "transparent" : T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6, color: listPage >= totalPages - 1 ? T.textDim : T.text, cursor: listPage >= totalPages - 1 ? "default" : "pointer", fontFamily: T.font }}>→</button>
              </div>
            )}

            {/* ── 月次定期タスク ── */}
            <Card style={{ padding: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>🔄 月次定期タスク</span>
                  <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: T.accent + "18", color: T.accent, fontWeight: 600 }}>{recurring.length}</span>
                </div>
                <button onClick={() => setAddingMonthly(true)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>+ 追加</button>
              </div>
              <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                {recurring.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: T.bg, borderRadius: T.radiusXs }}>
                    <span style={{ fontSize: 13 }}>🔁</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.text, flex: 1 }}>{r.name}</span>
                    {r.project && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.cyan + "15", color: T.cyan, border: `1px solid ${T.cyan}33` }}>{truncate(r.project, 15)}</span>}
                    <span style={{ fontSize: 12, color: T.textMuted }}>毎月{r.dayOfMonth}日</span>
                    <button onClick={() => setEditingMonthly({ ...r })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.textDim }}>✏️</button>
                    <button onClick={() => removeRecurring(r.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                  </div>
                ))}
                {addingMonthly && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", padding: "8px 0" }}>
                    <input value={monthlyName} onChange={(e) => setMonthlyName(e.target.value)} autoFocus placeholder="タスク名..." style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 13, fontFamily: T.font }} />
                    <select value={monthlyProject} onChange={(e) => setMonthlyProject(e.target.value)} style={{ padding: "6px 6px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }}>
                      <option value="">案件なし</option>
                      {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select value={monthlyDay} onChange={(e) => setMonthlyDay(Number(e.target.value))} style={{ padding: "6px 6px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }}>
                      {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}日</option>)}
                    </select>
                    <Btn onClick={() => { if (monthlyName.trim()) { saveRecurring({ name: monthlyName.trim(), project: monthlyProject || null, dayOfMonth: monthlyDay }); setMonthlyName(""); setMonthlyProject(""); setMonthlyDay(1); setAddingMonthly(false); } }} disabled={!monthlyName.trim()}>追加</Btn>
                    <Btn variant="ghost" onClick={() => setAddingMonthly(false)}>✕</Btn>
                  </div>
                )}
              </div>
              <div style={{ padding: "0 14px 10px", fontSize: 10, color: T.textMuted }}>※ 毎月指定日に自動でタスクに追加されます</div>
            </Card>

            {/* ── 進行中タスク サマリー ── */}
            {(() => {
              const activeInprog = inprogress.filter((t) => !t.done);
              if (activeInprog.length === 0) return null;
              const preview = activeInprog.slice(0, 5);
              const rest = activeInprog.length - preview.length;
              return (
                <Card style={{ padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>🔄 進行中タスク</span>
                      <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: T.cyan + "18", color: T.cyan, fontWeight: 600 }}>{activeInprog.length}</span>
                    </div>
                    <button onClick={() => setTmTab("inprog")} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>詳細 →</button>
                  </div>
                  <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {preview.map((t) => {
                      const bh = getBallHolder(t.ballHolder);
                      const subs = t.subtasks || [];
                      const subDone = subs.filter((s) => s.done).length;
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}11` }}>
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, background: bh.color + "22", color: bh.color, fontWeight: 600, flexShrink: 0 }}>{bh.label}</span>
                          {t.project && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.cyan + "15", color: T.cyan, flexShrink: 0 }}>{truncate(t.project, 12)}</span>}
                          <SheetLockBadge task={t} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                          {subs.length > 0 && <span style={{ fontSize: 9, color: T.textMuted }}>{subDone}/{subs.length}</span>}
                          {t.deadline && <span style={{ fontSize: 10, color: dl(t.deadline) < todayKey() ? T.error : T.textMuted }}>{dl(t.deadline).slice(5, 10).replace("-", "/")}</span>}
                        </div>
                      );
                    })}
                    {rest > 0 && <div style={{ padding: "6px 0", fontSize: 11, color: T.cyan, cursor: "pointer" }} onClick={() => setTmTab("inprog")}>他 {rest} 件を表示...</div>}
                  </div>
                </Card>
              );
            })()}

            {/* ── 依頼中タスク サマリー ── */}
            {(() => {
              const activeDel = delegations.filter((d) => !d.done);
              if (activeDel.length === 0) return null;
              const preview = activeDel.slice(0, 5);
              const rest = activeDel.length - preview.length;
              return (
                <Card style={{ padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>📮 依頼中タスク</span>
                      <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: T.warning + "18", color: T.warning, fontWeight: 600 }}>{activeDel.length}</span>
                    </div>
                    <button onClick={() => { setInprogFilter("other"); setTmTab("inprog"); }} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgCard, color: T.text, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>詳細 →</button>
                  </div>
                  <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                    {preview.map((d) => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}11` }}>
                        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: delegStatusColor(d.status) + "22", color: delegStatusColor(d.status), fontWeight: 600, flexShrink: 0 }}>{delegStatusLabel(d.status)}</span>
                        <SheetLockBadge task={d} />
                        <span style={{ flex: 1, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        {d.assignee && <span style={{ fontSize: 10, color: T.purple }}>→ {d.assignee}</span>}
                        {d.deadline && <span style={{ fontSize: 10, color: dl(d.deadline) < todayKey() ? T.error : T.textMuted }}>{dl(d.deadline).slice(5, 10).replace("-", "/")}</span>}
                      </div>
                    ))}
                    {rest > 0 && <div style={{ padding: "6px 0", fontSize: 11, color: T.warning, cursor: "pointer" }} onClick={() => { setInprogFilter("other"); setTmTab("inprog"); }}>他 {rest} 件を表示...</div>}
                  </div>
                </Card>
              );
            })()}
          </div>
        );
      })()}

      {/* ═══ IN-PROGRESS TAB (進行中 + 依頼 merged) ═══ */}
      {tmTab === "inprog" && (() => {
        const activeInprog = inprogress.filter((t) => !t.done);
        const activeDeleg = delegations.filter((d) => !d.done && d.status !== "done");
        const selfInprog = activeInprog.filter((t) => (t.ballHolder || "self") === "self");
        const otherInprog = activeInprog.filter((t) => (t.ballHolder || "self") !== "self");
        const selfCount = selfInprog.length;
        const otherCount = otherInprog.length + activeDeleg.length;
        const showInprog = inprogFilter === "all" ? activeInprog : (inprogFilter === "self" ? selfInprog : otherInprog);
        const showDeleg = inprogFilter === "self" ? [] : activeDeleg;
        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>🔄 進行中タスク</span>
              <span style={{ fontSize: 12, color: T.textMuted }}>{activeInprog.length + activeDeleg.length} 件</span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[
                { id: "all", label: "全て", count: selfCount + otherCount },
                { id: "self", label: "🏀 自分ボール", count: selfCount },
                { id: "other", label: "👥 他人ボール", count: otherCount },
              ].map((f) => (
                <button key={f.id} onClick={() => setInprogFilter(f.id)} style={{
                  padding: "4px 10px", fontSize: 10, fontWeight: inprogFilter === f.id ? 600 : 400,
                  color: inprogFilter === f.id ? T.accent : T.textMuted,
                  background: inprogFilter === f.id ? T.accent + "18" : "transparent",
                  border: `1px solid ${inprogFilter === f.id ? T.accent + "44" : T.border}`,
                  borderRadius: 99, cursor: "pointer", fontFamily: T.font, whiteSpace: "nowrap",
                }}>
                  {f.label} <span style={{ opacity: 0.7 }}>{f.count}</span>
                </button>
              ))}
              <Btn variant="secondary" onClick={() => setAddingInprog(true)} style={{ fontSize: 11, padding: "4px 12px" }}>+ 追加</Btn>
            </div>
          </div>
          {/* Active tasks */}
          {showInprog.map((task) => {
            const bh = getBallHolder(task.ballHolder);
            const subs = task.subtasks || [];
            const subDone = subs.filter((s) => s.done).length;
            return (
              <Card key={task.id} style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${bh.color}`, border: `1px solid ${bh.color + "33"}`, borderLeftWidth: 3 }}>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <button onClick={() => toggleInprogDone(task.id)} title="完了（アーカイブ）" style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${T.border}`, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.success, flexShrink: 0 }} />
                    <button onClick={() => updateInprogBall(task.id, BALL_HOLDERS[(BALL_HOLDERS.findIndex((b) => b.id === task.ballHolder) + 1) % BALL_HOLDERS.length].id)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 99, background: bh.color + "22", color: bh.color, border: `1px solid ${bh.color}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600 }}>{bh.label}</button>
                    {task.project && <button onClick={() => onNavigateToClient && onNavigateToClient(task.project)} style={{ fontSize: 10, color: T.cyan, background: "none", border: `1px solid ${T.cyan}33`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: T.font, fontWeight: 500 }}>{truncate(task.project, 15)}</button>}
                    <SheetLockBadge task={task} />
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text, flex: 1 }}>{task.name}</span>
                    {subs.length > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.bgCard, color: T.textMuted, fontWeight: 600 }}>{subDone}/{subs.length}</span>}
                    <button onClick={() => setEditingTask(editingTask?.id === task.id ? null : { id: task.id, name: task.name, project: task.project || "", ballHolder: task.ballHolder || "self", deadline: task.deadline ? task.deadline.slice(5, 10).replace(/-/g, "/") : "", memo: task.memo || "", _isInprog: true })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.textDim }}>✏️</button>
                    <button onClick={() => deleteInprogTask(task.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                  </div>
                  <div style={{ fontSize: 11, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    {editDL?.id === `inprog-${task.id}` ? (
                      <><span style={{ color: T.textMuted }}>期限:</span><input autoFocus value={editDL.val} onChange={(e) => setEditDL({ ...editDL, val: fmtDateInput(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditDL(null); }} onBlur={async () => { const iso = editDL.val ? toISO(editDL.val) : null; setInprogress((prev) => prev.map((t) => t.id === task.id ? { ...t, deadline: iso } : t)); await updateTaskDB(task.id, { deadline: iso }); setEditDL(null); }} placeholder="MM/DD" style={{ width: 55, padding: "2px 5px", background: T.bg, border: `1px solid ${T.accent}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, textAlign: "center", outline: "none" }} /></>
                    ) : (
                      <span onClick={() => setEditDL({ id: `inprog-${task.id}`, val: task.deadline ? dl(task.deadline).slice(5, 10).replace(/-/g, "/") : "" })} style={{ color: task.deadline ? (dl(task.deadline) < todayKey() ? T.error : T.textMuted) : T.textDim, cursor: "pointer", fontWeight: task.deadline && dl(task.deadline) < todayKey() ? 600 : 400 }}>{task.deadline ? `${dl(task.deadline) < todayKey() ? "⚠ " : ""}期限: ${dl(task.deadline).slice(5, 10).replace("-", "/")}` : "期限: --/--"}</span>
                    )}
                  </div>
                  {task.memo && <div style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>📝 {task.memo}</div>}

                  {/* Edit panel */}
                  {editingTask?.id === task.id && editingTask._isInprog && (
                    <div style={{ padding: "8px 0", borderTop: `1px solid ${T.border}`, marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <input value={editingTask.name} onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })} style={{ flex: 1, minWidth: 140, padding: "5px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                      <select value={editingTask.project} onChange={(e) => setEditingTask({ ...editingTask, project: e.target.value })} style={{ padding: "5px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                        <option value="">案件なし</option>
                        {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <select value={editingTask.ballHolder} onChange={(e) => setEditingTask({ ...editingTask, ballHolder: e.target.value })} style={{ padding: "5px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                        {BALL_HOLDERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                      <input value={editingTask.deadline} onChange={(e) => setEditingTask({ ...editingTask, deadline: fmtDateInput(e.target.value) })} placeholder="MM/DD" style={{ width: 60, padding: "4px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, textAlign: "center" }} />
                      <input value={editingTask.memo} onChange={(e) => setEditingTask({ ...editingTask, memo: e.target.value })} placeholder="メモ" style={{ flex: 1, minWidth: 100, padding: "5px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }} />
                      <Btn onClick={async () => { const dlISO = editingTask.deadline ? toISO(editingTask.deadline) : null; await updateTaskDB(task.id, { name: editingTask.name, project: editingTask.project || null, ballHolder: editingTask.ballHolder, deadline: dlISO, memo: editingTask.memo || null }); setInprogress((prev) => prev.map((t) => t.id === task.id ? { ...t, name: editingTask.name, project: editingTask.project || null, ballHolder: editingTask.ballHolder, deadline: dlISO, memo: editingTask.memo || null } : t)); setEditingTask(null); setToast("✅ 更新しました"); }} style={{ fontSize: 10, padding: "4px 10px" }}>保存</Btn>
                      <Btn variant="ghost" onClick={() => setEditingTask(null)} style={{ fontSize: 10, padding: "4px 8px" }}>✕</Btn>
                    </div>
                  )}
                </div>

                {/* Subtasks */}
                {(subs.length > 0 || true) && (
                  <div style={{ borderTop: `1px solid ${T.border}33`, padding: "8px 16px 10px" }}>
                    {subs.length > 0 && <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>サブタスク <span style={{ fontWeight: 600 }}>{subDone}/{subs.length}</span></div>}
                    {subs.map((sub, si) => {
                      const sbh = getBallHolder(sub.ballHolder);
                      return (
                        <div key={si} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}11` }}>
                          <input type="checkbox" checked={sub.done} onChange={() => {
                            const newSubs = [...subs]; newSubs[si] = { ...sub, done: !sub.done };
                            setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t)));
                            updateTaskDB(task.id, { subtasks: newSubs });
                          }} style={{ cursor: "pointer", width: 16, height: 16 }} />
                          <button onClick={() => { const newSubs = [...subs]; const curIdx = BALL_HOLDERS.findIndex((b) => b.id === (sub.ballHolder || "self")); newSubs[si] = { ...sub, ballHolder: BALL_HOLDERS[(curIdx + 1) % BALL_HOLDERS.length].id }; setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t))); updateTaskDB(task.id, { subtasks: newSubs }); }} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 99, background: sbh.color + "22", color: sbh.color, border: `1px solid ${sbh.color}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, flexShrink: 0 }}>{sbh.label}</button>
                          <span style={{ fontSize: 12, color: sub.done ? T.textMuted : T.text, textDecoration: sub.done ? "line-through" : "none", flex: 1 }}>{sub.text || sub.name}</span>
                          {editDL?.id === `sub-${task.id}-${si}` ? (
                            <input autoFocus value={editDL.val} onChange={(e) => setEditDL({ ...editDL, val: fmtDateInput(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.target.blur(); } if (e.key === "Escape") setEditDL(null); }} onBlur={() => { const iso = editDL.val ? toISO(editDL.val) : null; const newSubs = [...subs]; newSubs[si] = { ...sub, deadline: iso }; setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t))); updateTaskDB(task.id, { subtasks: newSubs }); setEditDL(null); }} placeholder="MM/DD" style={{ width: 50, padding: "1px 4px", background: T.bg, border: `1px solid ${T.accent}`, borderRadius: T.radiusXs, color: T.text, fontSize: 9, fontFamily: T.font, textAlign: "center", outline: "none" }} />
                          ) : (
                            <span onClick={(e) => { e.stopPropagation(); setEditDL({ id: `sub-${task.id}-${si}`, val: sub.deadline ? dl(sub.deadline).slice(5, 10).replace(/-/g, "/") : "" }); }} style={{ fontSize: 9, color: sub.deadline ? (dl(sub.deadline) < todayKey() ? T.error : T.textMuted) : T.textDim, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>{sub.deadline ? `📅${dl(sub.deadline).slice(5, 10).replace("-", "/")}` : "--/--"}</span>
                          )}
                          <button onClick={() => { const newSubs = subs.filter((_, i) => i !== si); setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t))); updateTaskDB(task.id, { subtasks: newSubs }); }} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>✕</button>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <input data-role="sub-text" placeholder="サブタスクを追加..." onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { const dlInput = e.target.parentElement.querySelector('[data-role="sub-dl"]'); const dlVal = dlInput?.value ? toISO(dlInput.value) : null; const newSubs = [...subs, { text: e.target.value.trim(), done: false, ballHolder: "self", deadline: dlVal }]; setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t))); updateTaskDB(task.id, { subtasks: newSubs }); e.target.value = ""; if (dlInput) dlInput.value = ""; } }} style={{ flex: 1, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, outline: "none" }} />
                      <input data-role="sub-dl" placeholder="MM/DD" onChange={(e) => { e.target.value = fmtDateInput(e.target.value); }} style={{ width: 55, padding: "6px 4px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 10, fontFamily: T.font, textAlign: "center", outline: "none" }} />
                      <button onClick={(e) => { const wrap = e.target.closest("div"); const textInput = wrap.querySelector('[data-role="sub-text"]'); const dlInput = wrap.querySelector('[data-role="sub-dl"]'); if (textInput && textInput.value.trim()) { const dlVal = dlInput?.value ? toISO(dlInput.value) : null; const newSubs = [...subs, { text: textInput.value.trim(), done: false, ballHolder: "self", deadline: dlVal }]; setInprogress((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: newSubs } : t))); updateTaskDB(task.id, { subtasks: newSubs }); textInput.value = ""; if (dlInput) dlInput.value = ""; } }} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgCard, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: T.textMuted }}>+</button>
                      <button onClick={() => deleteInprogTask(task.id)} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgCard, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.textDim }}>🗑</button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Archived (completed) tasks */}
          {(() => {
            const archived = inprogress.filter(t => t.done);
            if (archived.length === 0) return null;
            return (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setShowArchive(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.font, padding: "4px 0" }}>
                  <span style={{ transform: showArchive ? "rotate(90deg)" : "none", transition: "transform 0.15s", fontSize: 10 }}>▶</span>
                  完了済み（{archived.length}）
                </button>
                {showArchive && archived.map((task) => (
                  <Card key={task.id} style={{ padding: "6px 12px", marginTop: 4, opacity: 0.5, border: `1px solid ${T.success}22` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => toggleInprogDone(task.id)} title="復元" style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${T.success}`, background: T.success + "22", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.success, flexShrink: 0 }}>✓</button>
                      {task.project && <span style={{ fontSize: 9, color: T.textMuted }}>{truncate(task.project, 12)}</span>}
                      <span style={{ fontSize: 12, color: T.textDim, textDecoration: "line-through", flex: 1 }}>{task.name}</span>
                      <button onClick={() => deleteInprogTask(task.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })()}

          {/* Add in-progress form */}
          {addingInprog && (
            <Card style={{ border: `1px solid ${T.cyan}33` }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={ipName} onChange={(e) => setIpName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addInprogTask(); }} autoFocus placeholder="タスク名..." style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
                <select value={ipProject} onChange={(e) => setIpProject(e.target.value)} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                  <option value="">案件</option>
                  {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={ipBall} onChange={(e) => setIpBall(e.target.value)} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font }}>
                  {BALL_HOLDERS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
                <input value={ipDeadline} onChange={(e) => setIpDeadline(fmtDateInput(e.target.value))} placeholder="MM/DD" style={{ width: 60, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 11, fontFamily: T.font, textAlign: "center" }} />
                <Btn onClick={addInprogTask} disabled={!ipName.trim()}>追加</Btn>
                <Btn variant="ghost" onClick={() => setAddingInprog(false)}>✕</Btn>
              </div>
            </Card>
          )}

          {/* ── 依頼中タスク（delegation） ── */}
          {showDeleg.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>📮 依頼中</span>
                <span style={{ fontSize: 11, color: T.textMuted }}>{showDeleg.length} 件</span>
              </div>
              {showDeleg.map((d) => {
                // ball_holder: フリーテキスト (SEO / エンジニア / デザイナー / 藤田等) を受け入れる
                const rawBall = (d.ballHolder || d.assignee || "").trim();
                // 色は BALL_HOLDERS から一致するものを優先、なければ purple (delegation デフォルト)
                const matchedBh = BALL_HOLDERS.find((b) => b.id === rawBall || b.label.includes(rawBall));
                const ballColor = matchedBh ? matchedBh.color : T.purple;
                const ballLabel = rawBall || "未割当";
                return (
                <Card key={d.id} style={{ border: `1px solid ${ballColor}33`, borderLeft: `3px solid ${ballColor}`, opacity: d.done ? 0.5 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* 完了チェックボタン */}
                    <button onClick={() => toggleDelegDone(d.id)} title={d.done ? "未完了に戻す" : "完了"} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${d.done ? T.success : T.border}`, background: d.done ? T.success + "22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.success, flexShrink: 0 }}>{d.done ? "✓" : ""}</button>
                    {/* ステータスサイクル (pending/inprogress/waiting のみ) */}
                    <button onClick={() => cycleDelegStatus(d.id)} title="ステータスをサイクル (未着手→進行中→待ち)" style={{ fontSize: 9, padding: "2px 8px", borderRadius: 99, background: delegStatusColor(d.status) + "22", color: delegStatusColor(d.status), border: `1px solid ${delegStatusColor(d.status)}44`, cursor: "pointer", fontFamily: T.font, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{delegStatusLabel(d.status)}</button>
                    {/* ボール保持者バッジ */}
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: ballColor + "22", color: ballColor, border: `1px solid ${ballColor}44`, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }} title="ボール保持者（依頼先）">→ {ballLabel}</span>
                    {d.project && <button onClick={() => onNavigateToClient && onNavigateToClient(d.project)} style={{ fontSize: 10, color: T.cyan, background: "none", border: `1px solid ${T.cyan}33`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: T.font, fontWeight: 500 }}>{truncate(d.project, 15)}</button>}
                    <SheetLockBadge task={d} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1, textDecoration: d.done ? "line-through" : "none" }}>{d.name}</span>
                    {renderDeadline(d.id, d.deadline, { afterSave: async (id, iso) => { setDelegations((prev) => prev.map((t) => t.id === id ? { ...t, deadline: iso } : t)); await updateTaskDB(id, { deadline: iso }); } })}
                    <button onClick={() => deleteDelegTask(d.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                  </div>
                  {d.memo && <div style={{ marginTop: 4, fontSize: 11, color: T.textDim, paddingLeft: 30 }}>📝 {d.memo}</div>}
                </Card>
                );
              })}
            </div>
          )}

          {/* Add delegation */}
          {inprogFilter !== "self" && (addingDeleg ? (
            <Card style={{ border: `1px solid ${T.purple}33` }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={delegName} onChange={(e) => setDelegName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addDelegTask(); }} autoFocus placeholder="依頼内容..." style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }} />
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
            <Btn variant="secondary" onClick={() => setAddingDeleg(true)} style={{ alignSelf: "flex-start", fontSize: 11 }}>+ 依頼タスクを追加</Btn>
          ))}
        </div>
        );
      })()}

      {/* ═══ MONTHLY TAB (月次定期タスク) ═══ */}
      {tmTab === "monthly" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: T.textDim }}>毎月◯日に自動追加されるタスク（{recurring.length}件）</div>

          {recurring.map((r) => {
            const isEditing = editingMonthly && editingMonthly.id === r.id;
            return (
              <Card key={r.id} style={{ border: `1px solid ${T.border}44` }}>
                {isEditing ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <input value={editingMonthly.name} onChange={(e) => setEditingMonthly({ ...editingMonthly, name: e.target.value })} style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 13, fontFamily: T.font }} />
                    <select value={editingMonthly.project || ""} onChange={(e) => setEditingMonthly({ ...editingMonthly, project: e.target.value })} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }}>
                      <option value="">案件なし</option>
                      {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select value={editingMonthly.dayOfMonth} onChange={(e) => setEditingMonthly({ ...editingMonthly, dayOfMonth: Number(e.target.value) })} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }}>
                      {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}日</option>)}
                    </select>
                    <Btn onClick={async () => { await saveRecurring(editingMonthly); setEditingMonthly(null); }}>保存</Btn>
                    <Btn variant="ghost" onClick={() => setEditingMonthly(null)}>✕</Btn>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: T.accent + "18", color: T.accent, fontWeight: 600, flexShrink: 0 }}>毎月{r.dayOfMonth}日</span>
                    {r.project && <button onClick={() => onNavigateToClient && onNavigateToClient(r.project)} style={{ fontSize: 10, color: T.cyan, background: "none", border: `1px solid ${T.cyan}33`, borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontFamily: T.font }}>{truncate(r.project, 12)}</button>}
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.text, flex: 1 }}>{r.name}</span>
                    <button onClick={() => setEditingMonthly({ ...r })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.textDim }}>✏️</button>
                    <button onClick={() => removeRecurring(r.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 10, opacity: 0.3 }}>🗑</button>
                  </div>
                )}
              </Card>
            );
          })}

          {recurring.length === 0 && <div style={{ fontSize: 13, color: T.textMuted, textAlign: "center", padding: 20 }}>定期タスクなし</div>}

          {/* Add monthly recurring task */}
          {addingMonthly ? (
            <Card style={{ border: `1px solid ${T.accent}33` }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={monthlyName} onChange={(e) => setMonthlyName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && monthlyName.trim()) { saveRecurring({ name: monthlyName.trim(), project: monthlyProject || null, dayOfMonth: monthlyDay }); setMonthlyName(""); setMonthlyProject(""); setMonthlyDay(1); setAddingMonthly(false); } }} autoFocus placeholder="タスク名..." style={{ flex: 1, minWidth: 140, padding: "6px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 13, fontFamily: T.font }} />
                <select value={monthlyProject} onChange={(e) => setMonthlyProject(e.target.value)} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }}>
                  <option value="">案件なし</option>
                  {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={monthlyDay} onChange={(e) => setMonthlyDay(Number(e.target.value))} style={{ padding: "6px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, fontFamily: T.font }}>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}日</option>)}
                </select>
                <Btn onClick={() => { if (monthlyName.trim()) { saveRecurring({ name: monthlyName.trim(), project: monthlyProject || null, dayOfMonth: monthlyDay }); setMonthlyName(""); setMonthlyProject(""); setMonthlyDay(1); setAddingMonthly(false); } }} disabled={!monthlyName.trim()}>追加</Btn>
                <Btn variant="ghost" onClick={() => setAddingMonthly(false)}>✕</Btn>
              </div>
            </Card>
          ) : (
            <Btn variant="secondary" onClick={() => setAddingMonthly(true)} style={{ alignSelf: "flex-start" }}>+ 月次タスクを追加</Btn>
          )}
        </div>
      )}

      {/* ═══ ARTICLES TAB (コンテンツSEO進捗管理) ═══ */}
      {tmTab === "articles" && (() => {
        // Phase L+ (2026-04-10): クライアント別サマリビュー
        // 松下は個別記事を確認しないので、クライアント × ステータスのマトリクスで全体進捗を把握する
        const selfCountTotal = filteredArticles.filter((a) => { const st = ART_STEPS.find((s) => s.id === a.status); return st && st.self; }).length;
        const doneCountTotal = filteredArticles.filter((a) => a.status === ART_DONE_STATUS).length;
        const activeTotal = filteredArticles.length - doneCountTotal;

        // Group by client (project)
        const clientMap = new Map();
        for (const a of filteredArticles) {
          const key = a.project || "(未分類)";
          if (!clientMap.has(key)) {
            clientMap.set(key, { name: key, total: 0, statusCounts: {} });
          }
          const entry = clientMap.get(key);
          entry.total += 1;
          entry.statusCounts[a.status] = (entry.statusCounts[a.status] || 0) + 1;
        }
        const clients = Array.from(clientMap.values()).map((c) => {
          const selfCount = ART_STEPS.filter((s) => s.self).reduce((sum, s) => sum + (c.statusCounts[s.id] || 0), 0);
          const doneCount = c.statusCounts[ART_DONE_STATUS] || 0;
          const activeCount = c.total - doneCount;
          return { ...c, selfCount, doneCount, activeCount };
        });
        // 自分待ち多いクライアント → 進行中多いクライアント → 名前順
        clients.sort((a, b) => {
          if (a.selfCount !== b.selfCount) return b.selfCount - a.selfCount;
          if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
          return a.name.localeCompare(b.name);
        });

        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>📝 記事進捗 (山岸チーム)</div>
            <span style={{ fontSize: 11, color: T.textMuted }}>
              {clients.length} クライアント / 全 {filteredArticles.length} 本 / 進行中 {activeTotal} / 入稿完了 {doneCountTotal}
            </span>
          </div>

          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setArtMonthFilter(prevMonthKey(artMonthFilter))} style={{ fontSize: 14, padding: "4px 8px" }}>←</Btn>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{monthLabel(artMonthFilter)}</span>
            <Btn variant="ghost" onClick={() => setArtMonthFilter(nextMonthKey(artMonthFilter))} style={{ fontSize: 14, padding: "4px 8px" }}>→</Btn>
            {artMonthFilter !== curMonth() && <Btn variant="secondary" onClick={() => setArtMonthFilter(curMonth())} style={{ fontSize: 10 }}>今月</Btn>}
            <div style={{ flex: 1 }} />
            {selfCountTotal > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: T.error + "18", color: T.error, fontWeight: 600 }}>🔴 自分待ち {selfCountTotal}</span>}
          </div>

          {/* Overall pipeline summary bar (全クライアント合計) */}
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {ART_STEPS.map((step) => {
              const count = filteredArticles.filter((a) => a.status === step.id).length;
              return (
                <div key={step.id} style={{ flex: 1, padding: "6px 2px", background: count > 0 ? (step.self ? T.error + "18" : T.accent + "10") : T.bgCard, textAlign: "center", borderRadius: 4, minWidth: 50 }}>
                  <div style={{ fontSize: 8, color: count > 0 ? (step.self ? T.error : T.accent) : T.textMuted, fontWeight: 600 }}>{step.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: count > 0 ? (step.self ? T.error : T.accent) : T.textMuted }}>{count}</div>
                </div>
              );
            })}
            <div style={{ flex: 1, padding: "6px 2px", background: doneCountTotal > 0 ? T.success + "18" : T.bgCard, textAlign: "center", borderRadius: 4, minWidth: 50 }}>
              <div style={{ fontSize: 8, color: doneCountTotal > 0 ? T.success : T.textMuted, fontWeight: 600 }}>入稿完了</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: doneCountTotal > 0 ? T.success : T.textMuted }}>{doneCountTotal}</div>
            </div>
          </div>

          {/* ── クライアント別サマリ ── */}
          {clients.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: T.textMuted, fontSize: 12 }}>
              この月の記事はありません
            </div>
          )}
          {clients.map((c) => {
            const hasSelfWaiting = c.selfCount > 0;
            const allDone = c.activeCount === 0 && c.doneCount > 0;
            return (
              <Card key={c.name} style={{
                border: `1px solid ${hasSelfWaiting ? T.error + "44" : allDone ? T.success + "33" : T.border}`,
                background: hasSelfWaiting ? T.error + "06" : undefined,
                opacity: allDone ? 0.75 : 1,
              }}>
                {/* Client header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: T.text, flex: 1 }}>
                    {allDone && "✅ "}{c.name}
                  </span>
                  {hasSelfWaiting && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: T.error + "15", color: T.error, fontWeight: 600, whiteSpace: "nowrap" }}>
                      🔴 自分待ち {c.selfCount}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: "nowrap" }}>
                    全 {c.total} 本 / 完了 {c.doneCount}
                  </span>
                </div>

                {/* Per-client status mini-bar */}
                <div style={{ display: "flex", gap: 2 }}>
                  {ART_STEPS.map((step) => {
                    const count = c.statusCounts[step.id] || 0;
                    return (
                      <div key={step.id} style={{
                        flex: 1,
                        padding: "4px 2px",
                        background: count > 0 ? (step.self ? T.error + "18" : T.accent + "10") : T.bgCard,
                        textAlign: "center",
                        borderRadius: 3,
                        minWidth: 40,
                      }}>
                        <div style={{ fontSize: 8, color: count > 0 ? (step.self ? T.error : T.accent) : T.textMuted, fontWeight: 600 }}>{step.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: count > 0 ? (step.self ? T.error : T.accent) : T.textMuted }}>{count}</div>
                      </div>
                    );
                  })}
                  <div style={{
                    flex: 1,
                    padding: "4px 2px",
                    background: c.doneCount > 0 ? T.success + "18" : T.bgCard,
                    textAlign: "center",
                    borderRadius: 3,
                    minWidth: 40,
                  }}>
                    <div style={{ fontSize: 8, color: c.doneCount > 0 ? T.success : T.textMuted, fontWeight: 600 }}>入稿完了</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: c.doneCount > 0 ? T.success : T.textMuted }}>{c.doneCount}</div>
                  </div>
                </div>
              </Card>
            );
          })}

          {/* シート由来 (view-only) */}
          <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginTop: 8, padding: "8px 0", borderTop: `1px dashed ${T.border}` }}>
            👁 記事管理シートが真実 (Stack は山岸チームの進捗を俯瞰するだけ)
          </div>
        </div>
        );
      })()}

      {/* ═══ REPORTS TAB (Phase L, 2026-04-10) ═══ */}
      {tmTab === "reports" && (() => {
        const REPORT_STAGES = [
          { id: "reportData", label: "データ取得" },
          { id: "reportGen", label: "レポート生成" },
          { id: "reportSend", label: "送信" },
        ];
        const filteredReports = reports.filter((r) => r.month === reportMonthFilter);
        const sorted = [...filteredReports].sort((a, b) => {
          // 未着手フェーズが多いものを上に
          const incomA = REPORT_STAGES.filter((s) => a[s.id] !== "完了").length;
          const incomB = REPORT_STAGES.filter((s) => b[s.id] !== "完了").length;
          if (incomA !== incomB) return incomB - incomA;
          return (a.clientName || "").localeCompare(b.clientName || "");
        });
        const doneCount = filteredReports.filter((r) => r.reportSend === "完了").length;
        const stageCount = (stageId) => filteredReports.filter((r) => r[stageId] === "完了").length;
        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>📊 月次レポート進捗</div>
            <span style={{ fontSize: 11, color: T.textMuted }}>
              全{filteredReports.length} / 送信完了 {doneCount}
            </span>
          </div>

          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setReportMonthFilter(prevMonthKey(reportMonthFilter))} style={{ fontSize: 14, padding: "4px 8px" }}>←</Btn>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{monthLabel(reportMonthFilter)}</span>
            <Btn variant="ghost" onClick={() => setReportMonthFilter(nextMonthKey(reportMonthFilter))} style={{ fontSize: 14, padding: "4px 8px" }}>→</Btn>
            {reportMonthFilter !== curMonth() && <Btn variant="secondary" onClick={() => setReportMonthFilter(curMonth())} style={{ fontSize: 10 }}>今月</Btn>}
          </div>

          {/* Pipeline summary */}
          <div style={{ display: "flex", gap: 4 }}>
            {REPORT_STAGES.map((stage) => {
              const cnt = stageCount(stage.id);
              const pct = filteredReports.length > 0 ? Math.round((cnt / filteredReports.length) * 100) : 0;
              return (
                <div key={stage.id} style={{ flex: 1, padding: "6px 4px", background: cnt > 0 ? T.accent + "10" : T.bgCard, borderRadius: 4, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 600 }}>{stage.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: cnt > 0 ? T.accent : T.textMuted }}>{cnt}/{filteredReports.length}</div>
                  <div style={{ fontSize: 8, color: T.textMuted }}>{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Report list */}
          {sorted.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: T.textMuted, fontSize: 12 }}>
              {reportMonthFilter} のレポートはありません
            </div>
          )}
          {sorted.map((rep) => {
            const allDone = REPORT_STAGES.every((s) => rep[s.id] === "完了");
            return (
              <Card key={rep.id} style={{ border: `1px solid ${allDone ? T.success + "44" : T.border}`, background: allDone ? T.success + "06" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, minWidth: 120 }}>{rep.clientName || rep.name}</span>
                  {/* Stage toggle buttons */}
                  {REPORT_STAGES.map((stage) => {
                    const done = rep[stage.id] === "完了";
                    return (
                      <button key={stage.id} onClick={() => toggleReportStage(rep.id, stage.id)} title={done ? "クリックで未着手に戻す" : "クリックで完了"} style={{
                        fontSize: 10, padding: "3px 8px", borderRadius: 4,
                        background: done ? T.success + "20" : T.bgCard,
                        color: done ? T.success : T.textMuted,
                        border: `1px solid ${done ? T.success + "55" : T.border}`,
                        cursor: "pointer", fontFamily: T.font, fontWeight: 600, whiteSpace: "nowrap",
                      }}>
                        {done ? "✓" : "○"} {stage.label}
                      </button>
                    );
                  })}
                  {rep.reportReviewUrl && (
                    <a href={rep.reportReviewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: T.cyan + "15", color: T.cyan, textDecoration: "none", whiteSpace: "nowrap" }}>📄 レビュー →</a>
                  )}
                  <SheetLockBadge task={rep} />
                </div>
                {rep.reportNote && (
                  <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted }}>📝 {rep.reportNote}</div>
                )}
              </Card>
            );
          })}

          <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginTop: 8, padding: "8px 0", borderTop: `1px dashed ${T.border}` }}>
            ✏️ Stack でステージを更新 → 5 分ごとに自動でシートへ反映
          </div>
        </div>
        );
      })()}

      {/* ═══ COMPLETED TAB ═══ */}
      {tmTab === "completed" && (() => {
        const totalElapsedSec = completedTasks.reduce((sum, t) => sum + (t.elapsedSec || 0), 0);
        const totalHours = (totalElapsedSec / 3600).toFixed(1);
        // Group by date (completedAt or deadline)
        const grouped = {};
        completedTasks.forEach((t) => {
          const dateKey = (t.completedAt || t.deadline || t.taskDate || "不明").slice(0, 10);
          if (!grouped[dateKey]) grouped[dateKey] = [];
          grouped[dateKey].push(t);
        });
        const sortedDates = Object.keys(grouped).sort((a, b) => b > a ? 1 : -1);
        // Group by client/project
        const byClient = {};
        completedTasks.forEach((t) => {
          const key = t.clientName || t.project || "（案件なし）";
          if (!byClient[key]) byClient[key] = { count: 0, elapsed: 0 };
          byClient[key].count++;
          byClient[key].elapsed += (t.elapsedSec || 0);
        });
        const clientEntries = Object.entries(byClient).sort((a, b) => b[1].elapsed - a[1].elapsed);

        return (<>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Btn variant="ghost" onClick={() => setCompletedMonth(prevMonthKey(completedMonth))} style={{ fontSize: 16, padding: "4px 8px" }}>←</Btn>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text, minWidth: 100, textAlign: "center" }}>{monthLabel(completedMonth)}</span>
            <Btn variant="ghost" onClick={() => setCompletedMonth(nextMonthKey(completedMonth))} style={{ fontSize: 16, padding: "4px 8px" }}>→</Btn>
            {completedMonth !== curMonth() && <Btn variant="secondary" onClick={() => setCompletedMonth(curMonth())} style={{ fontSize: 11 }}>今月</Btn>}
          </div>

          {/* Summary cards */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>完了タスク数</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.success }}>{completedTasks.length}</div>
            </Card>
            <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>稼働時間</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.accent }}>{totalHours}h</div>
            </Card>
            <Card style={{ flex: 1, minWidth: 120, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>稼働日数</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{sortedDates.filter((d) => d !== "不明").length}</div>
            </Card>
          </div>

          {/* By client breakdown */}
          {clientEntries.length > 0 && (
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>案件別サマリー</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {clientEntries.map(([name, data]) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: `1px solid ${T.border}22` }}>
                    <span style={{ fontSize: 11, color: T.text, flex: 1 }}>{truncate(name, 25)}</span>
                    <span style={{ fontSize: 10, color: T.textMuted, marginRight: 12 }}>{data.count}件</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.accent }}>{(data.elapsed / 3600).toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {loadingCompleted ? (
            <div style={{ textAlign: "center", padding: 20, color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
          ) : completedTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: T.textMuted, fontSize: 12 }}>この月の完了タスクはありません</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sortedDates.map((dateKey) => {
                const tasks = grouped[dateKey];
                const dayElapsed = tasks.reduce((s, t) => s + (t.elapsedSec || 0), 0);
                return (
                  <Card key={dateKey}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{dateKey === "不明" ? "日付不明" : dateLabel(dateKey)}</div>
                      <div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>{fmtSec(dayElapsed)}</div>
                    </div>
                    {tasks.map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderTop: `1px solid ${T.border}11` }}>
                        <span style={{ color: T.success, fontSize: 10, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 11, color: T.text, flex: 1 }}>{t.name}</span>
                        {(t.clientName || t.project) && <span style={{ fontSize: 9, color: T.textMuted, background: T.bgCard, padding: "1px 6px", borderRadius: 4 }}>{truncate(t.clientName || t.project, 12)}</span>}
                        {t.elapsedSec > 0 && <span style={{ fontSize: 10, color: T.accent, fontWeight: 500, whiteSpace: "nowrap" }}>{fmtSec(t.elapsedSec)}</span>}
                      </div>
                    ))}
                  </Card>
                );
              })}
            </div>
          )}
        </>);
      })()}
    </div>
  );
}

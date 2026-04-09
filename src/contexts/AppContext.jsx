import { createContext, useState, useEffect, useContext, useCallback, useRef } from "react";
import {
  fetchClients,
  upsertClient,
  deleteClient as deleteClientDb,
  fetchProjects,
  upsertProject,
  deleteProject as deleteProjectDb,
  fetchRecurring,
  upsertRecurring,
  deleteRecurring as deleteRecurringDb,
  fetchArchived,
  insertArchived,
  migrateProjectTasksToTable,
  updateTaskByLinkId,
  protectProjectsDone,
} from "../hooks/useStorage";

const AppContext = createContext(null);

// Retry wrapper: retries a fetch function up to maxRetries times with exponential backoff
const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Fetch failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, e.message);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

export function AppProvider({ children }) {
  const [tasks, setTasks] = useState({}); // { [dateKey]: [...tasks] } — in-memory cache
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [taskRefreshSignal, setTaskRefreshSignal] = useState(0);
  const bumpTaskRefresh = useCallback(() => setTaskRefreshSignal((v) => v + 1), []);

  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [recurring, setRecurring] = useState([]);

  const dataLoaded = useRef(false);

  // ── Initial load with retry ──
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    let pj = [];
    try {
      const [cl, projects_, arch, rec] = await Promise.all([
        withRetry(fetchClients).catch(() => []),
        withRetry(fetchProjects).catch(() => []),
        withRetry(fetchArchived).catch(() => []),
        withRetry(fetchRecurring).catch(() => []),
      ]);
      pj = protectProjectsDone(projects_);
      setClients(cl);
      setProjects(pj);
      setArchivedTasks(arch);
      setRecurring(rec);
      // Verify critical data loaded (projects should not be empty if user has data)
      if (pj.length === 0) {
        const retryPj = await withRetry(fetchProjects).catch(() => []);
        if (retryPj.length > 0) {
          pj = protectProjectsDone(retryPj);
          setProjects(pj);
        }
      }
    } catch (e) {
      console.error("Initial load error:", e);
      setLoadError(true);
      setToast("⚠️ データ取得に失敗しました。再読み込みしてください");
    }
    setLoading(false);
    dataLoaded.current = true;
    // One-time migration: JSONB project tasks → tasks table (runs once per browser)
    if (pj && pj.length > 0) {
      const migrated = localStorage.getItem("taskMigrationV2Done");
      if (!migrated) {
        migrateProjectTasksToTable(pj, upsertProject).then(() => {
          localStorage.setItem("taskMigrationV2Done", "1");
          console.log("✅ タスク統一マイグレーション完了");
        }).catch((e) => console.error("Migration error:", e));
      }
    }
  }, []);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // ── Tasks (in-memory + per-item DB sync) ──
  const saveTasks = useCallback(async (t) => {
    if (!dataLoaded.current) return;
    setTasks(t);
  }, []);

  // ── Clients ──
  const saveClients = useCallback(async (list) => {
    if (!dataLoaded.current) return;
    setClients(list);
  }, []);

  // ── Projects ──
  const saveProjects = useCallback(async (list) => {
    if (!dataLoaded.current) return;
    setProjects(list);
  }, []);

  // ── Task Sync (cross-system status propagation) ──
  // tasks テーブル & projects JSONB の両方を state + Supabase に永続化
  const syncTaskStatus = useCallback(async (linkId, isDone) => {
    if (!linkId) return;

    // 1) tasks テーブルを Supabase に永続化
    await updateTaskByLinkId(linkId, { done: isDone });

    // 2) tasks state を更新（メモリ）
    setTasks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (Array.isArray(next[k])) {
          next[k] = next[k].map((t) =>
            t.linkId === linkId ? { ...t, done: isDone, status: isDone ? "done" : t.status } : t
          );
        }
      }
      return next;
    });

    // 3) projects state を更新 + 該当プロジェクトを Supabase に永続化
    setProjects((prev) => {
      const updated = prev.map((p) => ({
        ...p,
        tasks: (p.tasks || []).map((t) =>
          t.linkId === linkId
            ? { ...t, done: isDone, completedAt: isDone ? new Date().toISOString() : null }
            : t
        ),
      }));
      for (const p of updated) {
        if ((p.tasks || []).some((t) => t.linkId === linkId)) {
          upsertProject(p);
          break;
        }
      }
      return updated;
    });
  }, []);

  // ── Archive task ──
  const archiveTask = useCallback(async (linkId, info) => {
    if (!linkId) return;
    await insertArchived({
      linkId,
      title: info.title || "",
      clientName: info.clientName || "",
      projectName: info.projectName || "",
      completedAt: info.completedAt || new Date().toISOString(),
      result: info.result || "",
    });
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: (p.tasks || []).filter((t) => t.linkId !== linkId),
      }))
    );
    setTasks((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (Array.isArray(next[k])) {
          next[k] = next[k].filter((t) => t.linkId !== linkId);
        }
      }
      return next;
    });
    setArchivedTasks((prev) => [
      { linkId, title: info.title, archivedAt: new Date().toISOString(), ...info },
      ...prev,
    ]);
    setToast("📦 アーカイブ完了: " + (info.title || "").slice(0, 30));
  }, []);

  // ── Recurring Tasks ──
  const saveRecurring = useCallback(async (item) => {
    await upsertRecurring(item);
    const fresh = await fetchRecurring();
    setRecurring(fresh);
  }, []);

  const removeRecurring = useCallback(async (id) => {
    await deleteRecurringDb(id);
    setRecurring((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <AppContext.Provider
      value={{
        // Core
        tasks,
        toast,
        loading,
        loadError,
        reloadData: loadAllData,
        setToast,
        saveTasks,
        setTasks,
        // Domain
        clients,
        projects,
        archivedTasks,
        recurring,
        saveRecurring,
        removeRecurring,
        // Actions
        saveClients,
        saveProjects,
        syncTaskStatus,
        archiveTask,
        taskRefreshSignal,
        bumpTaskRefresh,
        // Direct setters (for migration / bulk import)
        setClients,
        setProjects,
        setArchivedTasks,
        setRecurring,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};

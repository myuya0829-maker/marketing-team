import { createContext, useState, useEffect, useContext, useCallback, useRef } from "react";
import { AGENTS } from "../lib/constants";
import {
  fetchAgentRules,
  upsertAgentRule,
  fetchKnowledge,
  insertKnowledge,
  deleteKnowledgeById,
  fetchFeedbacks,
  insertFeedback,
  fetchReports,
  insertReport,
  deleteReport as deleteReportDb,
  fetchClients,
  upsertClient,
  deleteClient as deleteClientDb,
  fetchProjects,
  upsertProject,
  deleteProject as deleteProjectDb,
  fetchMsgStyles,
  saveMsgStylesAll,
  fetchTemplates,
  insertTemplate,
  deleteTemplate as deleteTemplateDb,
  fetchRecurring,
  fetchArchived,
  insertArchived,
  fetchSettings,
  upsertSettings,
} from "../hooks/useStorage";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Core state (existing)
  const [agentRules, setAgentRules] = useState({});
  const [knowledge, setKnowledge] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tasks, setTasks] = useState({}); // { [dateKey]: [...tasks] }
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  // v2 state
  const [reports, setReports] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [netlifyUrl, setNetlifyUrl] = useState("");
  const [gasUrl, setGasUrl] = useState("");
  const [msgStyles, setMsgStyles] = useState({});
  const [templates, setTemplates] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [pendingExec, setPendingExec] = useState(null);
  const [bgJobLabel, setBgJobLabel] = useState("");

  const dataLoaded = useRef(false);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      try {
        const [rules, kn, fb, rpts, cl, pj, ms, tpl, arch, rec, settings] = await Promise.all([
          fetchAgentRules(),
          fetchKnowledge(),
          fetchFeedbacks(),
          fetchReports().catch(() => []),
          fetchClients().catch(() => []),
          fetchProjects().catch(() => []),
          fetchMsgStyles().catch(() => ({})),
          fetchTemplates().catch(() => []),
          fetchArchived().catch(() => []),
          fetchRecurring().catch(() => []),
          fetchSettings().catch(() => ({ netlifyUrl: "", gasUrl: "" })),
        ]);
        setAgentRules(rules);
        setKnowledge(kn);
        setFeedbacks(fb);
        setReports(rpts);
        setClients(cl);
        setProjects(pj);
        setMsgStyles(ms);
        setTemplates(tpl);
        setArchivedTasks(arch);
        setRecurring(rec);
        setNetlifyUrl(settings.netlifyUrl);
        setGasUrl(settings.gasUrl);
      } catch (e) {
        console.error("Initial load error:", e);
      }
      setLoading(false);
      dataLoaded.current = true;
    })();
  }, []);

  // ── Agent Rules ──
  const saveAgentRules = useCallback(
    async (id, rules) => {
      const n = { ...agentRules, [id]: rules };
      setAgentRules(n);
      await upsertAgentRule(id, rules);
      setToast("✅ ルール保存");
    },
    [agentRules]
  );

  // ── Knowledge ──
  const addKnowledge = useCallback(async (item) => {
    await insertKnowledge(item);
    const fresh = await fetchKnowledge();
    setKnowledge(fresh);
    setToast("✅ ナレッジ追加");
  }, []);

  const deleteKnowledgeItem = useCallback(async (id) => {
    await deleteKnowledgeById(id);
    setKnowledge((prev) => prev.filter((k) => k.id !== id));
    setToast("🗑 削除");
  }, []);

  // ── Feedbacks ──
  const addFeedback = useCallback(async (fb) => {
    await insertFeedback(fb);
    const fresh = await fetchFeedbacks();
    setFeedbacks(fresh);
  }, []);

  // ── Tasks (in-memory + per-item DB sync) ──
  const saveTasks = useCallback(async (t) => {
    if (!dataLoaded.current) return;
    setTasks(t);
  }, []);

  // ── Reports ──
  const addReport = useCallback(async (rpt) => {
    await insertReport(rpt);
    const fresh = await fetchReports();
    setReports(fresh);
  }, []);

  const deleteReportAction = useCallback(async (id) => {
    await deleteReportDb(id);
    setReports((prev) => prev.filter((r) => r.id !== id));
    setToast("🗑 レポート削除");
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

  // ── Settings (Netlify URL, GAS URL) ──
  const saveNetlifyUrl = useCallback(async (url) => {
    setNetlifyUrl(url);
    await upsertSettings({ netlifyUrl: url, gasUrl });
    setToast(url ? "✅ Netlify URL保存" : "🗑 Netlify URL削除");
  }, [gasUrl]);

  const saveGasUrl = useCallback(async (url) => {
    setGasUrl(url);
    await upsertSettings({ netlifyUrl, gasUrl: url });
    setToast(url ? "✅ GAS URL保存" : "🗑 GAS URL削除");
  }, [netlifyUrl]);

  // ── Message Styles ──
  const saveMsgStyles = useCallback(async (s) => {
    setMsgStyles(s);
    await saveMsgStylesAll(s);
  }, []);

  // ── Templates ──
  const addTemplate = useCallback(async (t) => {
    await insertTemplate(t);
    const fresh = await fetchTemplates();
    setTemplates(fresh);
    setToast("📋 テンプレ保存");
  }, []);

  const deleteTemplateAction = useCallback(async (id) => {
    await deleteTemplateDb(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setToast("🗑 テンプレ削除");
  }, []);

  // ── Task Sync (cross-system status propagation) ──
  const syncTaskStatus = useCallback(async (linkId, isDone) => {
    if (!linkId) return;
    // Sync across tasks
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
    // Sync across projects
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: (p.tasks || []).map((t) =>
          t.linkId === linkId
            ? { ...t, done: isDone, completedAt: isDone ? new Date().toISOString() : null }
            : t
        ),
      }))
    );
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
    // Remove from projects
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        tasks: (p.tasks || []).filter((t) => t.linkId !== linkId),
      }))
    );
    // Remove from tasks
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

  // ── Pending execution (task → workspace) ──
  const handleTaskExecute = useCallback((name, project, batch) => {
    if (batch) {
      setPendingExec({ batch });
    } else {
      setPendingExec({ name, project });
    }
  }, []);

  const clearPendingExec = useCallback(() => setPendingExec(null), []);

  return (
    <AppContext.Provider
      value={{
        // Core
        agents: AGENTS,
        agentRules,
        knowledge,
        feedbacks,
        tasks,
        toast,
        loading,
        setToast,
        saveAgentRules,
        addKnowledge,
        deleteKnowledge: deleteKnowledgeItem,
        addFeedback,
        saveTasks,
        setTasks,
        // v2
        reports,
        clients,
        projects,
        netlifyUrl,
        gasUrl,
        msgStyles,
        templates,
        archivedTasks,
        recurring,
        pendingExec,
        bgJobLabel,
        // v2 actions
        addReport,
        deleteReport: deleteReportAction,
        saveClients,
        saveProjects,
        saveNetlifyUrl,
        saveGasUrl,
        saveMsgStyles,
        addTemplate,
        deleteTemplate: deleteTemplateAction,
        syncTaskStatus,
        archiveTask,
        handleTaskExecute,
        clearPendingExec,
        setBgJobLabel,
        // direct setters for bulk operations (settings import, etc.)
        setKnowledge,
        setFeedbacks,
        setReports,
        setClients,
        setProjects,
        setArchivedTasks,
        setRecurring,
        setTemplates,
        setMsgStyles,
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

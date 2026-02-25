import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { AGENTS } from "../lib/constants";
import {
  fetchAgentRules,
  upsertAgentRule,
  fetchKnowledge,
  insertKnowledge,
  deleteKnowledgeById,
  fetchFeedbacks,
  insertFeedback,
} from "../hooks/useStorage";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [agentRules, setAgentRules] = useState({});
  const [knowledge, setKnowledge] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tasks, setTasks] = useState({}); // { [dateKey]: [...tasks] } - kept in memory, synced per-date
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [rules, kn, fb] = await Promise.all([
          fetchAgentRules(),
          fetchKnowledge(),
          fetchFeedbacks(),
        ]);
        setAgentRules(rules);
        setKnowledge(kn);
        setFeedbacks(fb);
      } catch (e) {
        console.error("Initial load error:", e);
      }
      setLoading(false);
    })();
  }, []);

  const saveAgentRules = useCallback(
    async (id, rules) => {
      const n = { ...agentRules, [id]: rules };
      setAgentRules(n);
      await upsertAgentRule(id, rules);
      setToast("✅ ルール保存");
    },
    [agentRules]
  );

  const addKnowledge = useCallback(
    async (item) => {
      await insertKnowledge(item);
      // Re-fetch to get the server-generated id
      const fresh = await fetchKnowledge();
      setKnowledge(fresh);
      setToast("✅ ナレッジ追加");
    },
    []
  );

  const deleteKnowledgeItem = useCallback(
    async (id) => {
      await deleteKnowledgeById(id);
      setKnowledge((prev) => prev.filter((k) => k.id !== id));
      setToast("🗑 削除");
    },
    []
  );

  const addFeedback = useCallback(
    async (fb) => {
      await insertFeedback(fb);
      const fresh = await fetchFeedbacks();
      setFeedbacks(fresh);
    },
    []
  );

  // Tasks are still managed with in-memory { [dateKey]: [...] } structure
  // But individual CRUD ops go through Supabase (handled by TaskManagementView)
  const saveTasks = useCallback(async (t) => {
    setTasks(t);
  }, []);

  return (
    <AppContext.Provider
      value={{
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

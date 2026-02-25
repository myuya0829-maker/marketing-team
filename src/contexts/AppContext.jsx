import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { SK, OLD_KNOWLEDGE_KEYS, OLD_FEEDBACK_KEYS, AGENTS } from "../lib/constants";
import { storeGet, storeSet, migrateGet } from "../hooks/useStorage";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [agentRules, setAgentRules] = useState({});
  const [knowledge, setKnowledge] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tasks, setTasks] = useState({});
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r1 = await storeGet(SK.agents);
      if (r1) setAgentRules(r1);

      // Knowledge - migrate from any old key
      const r2 = await migrateGet(SK.knowledge, OLD_KNOWLEDGE_KEYS, (oldKn) =>
        oldKn.map((k) => ({ ...k, assignedAgents: k.assignedAgents || ["all"] }))
      );
      if (r2) setKnowledge(r2);

      // Feedbacks - migrate
      const r3 = await migrateGet(SK.feedbacks, OLD_FEEDBACK_KEYS);
      if (r3) setFeedbacks(r3);

      // Tasks
      const r4 = await storeGet(SK.tasks);
      if (r4) setTasks(r4);

      setLoading(false);
    })();
  }, []);

  const saveAgentRules = useCallback(async (id, rules) => {
    const n = { ...agentRules, [id]: rules };
    setAgentRules(n);
    await storeSet(SK.agents, n);
    setToast("✅ ルール保存");
  }, [agentRules]);

  const addKnowledge = useCallback(async (item) => {
    const n = [item, ...knowledge];
    setKnowledge(n);
    await storeSet(SK.knowledge, n);
    setToast("✅ ナレッジ追加");
  }, [knowledge]);

  const deleteKnowledge = useCallback(async (id) => {
    const n = knowledge.filter((k) => k.id !== id);
    setKnowledge(n);
    await storeSet(SK.knowledge, n);
    setToast("🗑 削除");
  }, [knowledge]);

  const addFeedback = useCallback(async (fb) => {
    const n = [fb, ...feedbacks];
    setFeedbacks(n);
    await storeSet(SK.feedbacks, n);
  }, [feedbacks]);

  const saveTasks = useCallback(async (t) => {
    setTasks(t);
    await storeSet(SK.tasks, t);
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
        deleteKnowledge,
        addFeedback,
        saveTasks,
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

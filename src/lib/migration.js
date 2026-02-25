// Migration: Import legacy data (from window.storage JSON export) into Supabase
import { supabase } from "./supabase";

const USER_ID = "anonymous";

/**
 * Parse and validate an exported JSON file
 * @param {string} jsonString - Raw JSON string from the export file
 * @returns {{ data: object, stats: object } | { error: string }}
 */
export const parseExportFile = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString);

    // Validate structure
    if (!parsed.data || typeof parsed.data !== "object") {
      return { error: "不正なファイル形式です。data フィールドが見つかりません。" };
    }

    // Count items per category
    const stats = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (Array.isArray(value)) {
        stats[key] = value.length;
      } else if (typeof value === "object" && value !== null) {
        stats[key] = Object.keys(value).length;
      } else {
        stats[key] = value ? 1 : 0;
      }
    }

    return {
      data: parsed.data,
      stats,
      version: parsed.version || "unknown",
      exportedAt: parsed.exportedAt || null,
    };
  } catch (e) {
    return { error: "JSONの解析に失敗しました: " + e.message };
  }
};

/**
 * Import all data from parsed export into Supabase
 * @param {object} data - The parsed data object
 * @param {function} onProgress - Progress callback (category, status, count)
 * @returns {Promise<{ results: object, errors: string[] }>}
 */
export const importToSupabase = async (data, onProgress = () => {}) => {
  const results = {};
  const errors = [];

  // 1. Agent Rules: { [agentId]: rulesString }
  if (data.agents && typeof data.agents === "object" && !Array.isArray(data.agents)) {
    onProgress("agents", "importing", 0);
    const entries = Object.entries(data.agents);
    let count = 0;

    for (const [agentId, rules] of entries) {
      if (typeof rules !== "string" || !rules.trim()) continue;
      const { error } = await supabase
        .from("agent_rules")
        .upsert(
          { user_id: USER_ID, agent_id: agentId, rules, updated_at: new Date().toISOString() },
          { onConflict: "user_id,agent_id" }
        );
      if (error) {
        errors.push(`agents/${agentId}: ${error.message}`);
      } else {
        count++;
      }
    }
    results.agents = count;
    onProgress("agents", "done", count);
  }

  // 2. Knowledge: [{ id, title, content, category, assignedAgents, date }]
  if (data.knowledge && Array.isArray(data.knowledge) && data.knowledge.length > 0) {
    onProgress("knowledge", "importing", 0);
    const rows = data.knowledge.map((item) => ({
      user_id: USER_ID,
      category: item.category || "other",
      title: item.title || "無題",
      content: item.content || "",
      assigned_agents: item.assignedAgents || ["all"],
      source: item.source || "import",
      created_at: item.date || new Date().toISOString(),
    }));

    const { error } = await supabase.from("knowledge").insert(rows);
    if (error) {
      errors.push(`knowledge: ${error.message}`);
      results.knowledge = 0;
    } else {
      results.knowledge = rows.length;
    }
    onProgress("knowledge", "done", results.knowledge || 0);
  }

  // 3. Feedbacks: [{ id, task, rating, comment, date }]
  if (data.feedbacks && Array.isArray(data.feedbacks) && data.feedbacks.length > 0) {
    onProgress("feedbacks", "importing", 0);
    const rows = data.feedbacks.map((fb) => ({
      user_id: USER_ID,
      task_title: fb.task || fb.taskTitle || "",
      rating: fb.rating || 3,
      comment: fb.comment || "",
      good: fb.good || null,
      bad: fb.bad || null,
      lesson: fb.lesson || null,
      created_at: fb.date || new Date().toISOString(),
    }));

    const { error } = await supabase.from("feedbacks").insert(rows);
    if (error) {
      errors.push(`feedbacks: ${error.message}`);
      results.feedbacks = 0;
    } else {
      results.feedbacks = rows.length;
    }
    onProgress("feedbacks", "done", results.feedbacks || 0);
  }

  // 4. Tasks: { [dateKey]: [{ id, name, estimateSec, elapsedSec, running, runStartedAt, done, createdAt }] }
  if (data.tasks && typeof data.tasks === "object" && !Array.isArray(data.tasks)) {
    onProgress("tasks", "importing", 0);
    const rows = [];

    for (const [dateKey, taskList] of Object.entries(data.tasks)) {
      if (!Array.isArray(taskList)) continue;
      for (const task of taskList) {
        rows.push({
          user_id: USER_ID,
          task_date: dateKey,
          name: task.name || "無題",
          done: task.done || false,
          estimate_sec: task.estimateSec || 1800,
          elapsed_sec: task.elapsedSec || 0,
          timer_running: false, // Always reset timers on import
          timer_started_at: null,
          created_at: task.createdAt
            ? new Date(task.createdAt).toISOString()
            : new Date().toISOString(),
        });
      }
    }

    if (rows.length > 0) {
      // Insert in batches of 100 to avoid payload limits
      let count = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("tasks").insert(batch);
        if (error) {
          errors.push(`tasks (batch ${Math.floor(i / 100)}): ${error.message}`);
        } else {
          count += batch.length;
        }
      }
      results.tasks = count;
    } else {
      results.tasks = 0;
    }
    onProgress("tasks", "done", results.tasks || 0);
  }

  // 5-10. Other categories (reports, clients, projects, templates, recurring, archivedTasks)
  // These don't have dedicated tables yet. Store as raw JSON in settings or skip.
  const extraKeys = ["reports", "clients", "projects", "templates", "recurring", "archivedTasks", "history"];
  const skipped = [];
  for (const key of extraKeys) {
    if (data[key]) {
      const count = Array.isArray(data[key]) ? data[key].length : Object.keys(data[key]).length;
      if (count > 0) {
        skipped.push({ key, count });
      }
    }
  }
  if (skipped.length > 0) {
    results._skipped = skipped;
  }

  return { results, errors };
};

/**
 * Category label mapping for display
 */
export const CATEGORY_LABELS = {
  agents: { label: "エージェントルール", icon: "👔" },
  knowledge: { label: "ナレッジ", icon: "📚" },
  feedbacks: { label: "フィードバック", icon: "📝" },
  tasks: { label: "タスク", icon: "⏱" },
  reports: { label: "レポート", icon: "📊" },
  clients: { label: "クライアント", icon: "🏢" },
  projects: { label: "案件", icon: "📁" },
  templates: { label: "テンプレート", icon: "📄" },
  recurring: { label: "繰返しタスク", icon: "🔁" },
  archivedTasks: { label: "アーカイブ", icon: "🗄" },
  history: { label: "実行履歴", icon: "📜" },
};

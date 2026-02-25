// Storage layer - Supabase CRUD
// Each table has dedicated functions for type safety
// user_id is 'anonymous' until auth is implemented

import { supabase } from "../lib/supabase";

const USER_ID = "anonymous";

// ========================
// Agent Rules
// ========================
export const fetchAgentRules = async () => {
  const { data, error } = await supabase
    .from("agent_rules")
    .select("agent_id, rules")
    .eq("user_id", USER_ID);
  if (error) {
    console.error("fetchAgentRules:", error);
    return {};
  }
  // Convert rows to { [agentId]: rules } map
  const map = {};
  for (const row of data) {
    map[row.agent_id] = row.rules;
  }
  return map;
};

export const upsertAgentRule = async (agentId, rules) => {
  const { error } = await supabase
    .from("agent_rules")
    .upsert(
      { user_id: USER_ID, agent_id: agentId, rules, updated_at: new Date().toISOString() },
      { onConflict: "user_id,agent_id" }
    );
  if (error) console.error("upsertAgentRule:", error);
};

// ========================
// Knowledge
// ========================
export const fetchKnowledge = async () => {
  const { data, error } = await supabase
    .from("knowledge")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchKnowledge:", error);
    return [];
  }
  // Map DB columns to app format
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    assignedAgents: row.assigned_agents || ["all"],
    source: row.source,
    date: row.created_at,
  }));
};

export const insertKnowledge = async (item) => {
  const { error } = await supabase.from("knowledge").insert({
    user_id: USER_ID,
    category: item.category,
    title: item.title,
    content: item.content,
    assigned_agents: item.assignedAgents || ["all"],
    source: item.source || "manual",
  });
  if (error) console.error("insertKnowledge:", error);
};

export const deleteKnowledgeById = async (id) => {
  const { error } = await supabase
    .from("knowledge")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);
  if (error) console.error("deleteKnowledge:", error);
};

// ========================
// Feedbacks
// ========================
export const fetchFeedbacks = async () => {
  const { data, error } = await supabase
    .from("feedbacks")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchFeedbacks:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    task: row.task_title,
    rating: row.rating,
    comment: row.comment,
    date: row.created_at,
  }));
};

export const insertFeedback = async (fb) => {
  const { error } = await supabase.from("feedbacks").insert({
    user_id: USER_ID,
    task_title: fb.task,
    rating: fb.rating,
    comment: fb.comment,
  });
  if (error) console.error("insertFeedback:", error);
};

// ========================
// Tasks
// ========================
export const fetchTasksByDate = async (dateKey) => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("task_date", dateKey)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchTasksByDate:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    estimateSec: row.estimate_sec,
    elapsedSec: row.elapsed_sec,
    running: row.timer_running,
    runStartedAt: row.timer_started_at ? new Date(row.timer_started_at).getTime() : null,
    done: row.done,
    createdAt: new Date(row.created_at).getTime(),
  }));
};

export const insertTask = async (dateKey, task) => {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: USER_ID,
      task_date: dateKey,
      name: task.name,
      estimate_sec: task.estimateSec,
      elapsed_sec: task.elapsedSec || 0,
      done: task.done || false,
      timer_running: task.running || false,
      timer_started_at: task.runStartedAt ? new Date(task.runStartedAt).toISOString() : null,
    })
    .select()
    .single();
  if (error) {
    console.error("insertTask:", error);
    return null;
  }
  return data.id;
};

export const updateTask = async (id, updates) => {
  const mapped = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.done !== undefined) mapped.done = updates.done;
  if (updates.estimateSec !== undefined) mapped.estimate_sec = updates.estimateSec;
  if (updates.elapsedSec !== undefined) mapped.elapsed_sec = updates.elapsedSec;
  if (updates.running !== undefined) mapped.timer_running = updates.running;
  if (updates.runStartedAt !== undefined)
    mapped.timer_started_at = updates.runStartedAt ? new Date(updates.runStartedAt).toISOString() : null;

  const { error } = await supabase.from("tasks").update(mapped).eq("id", id);
  if (error) console.error("updateTask:", error);
};

export const deleteTask = async (id) => {
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);
  if (error) console.error("deleteTask:", error);
};

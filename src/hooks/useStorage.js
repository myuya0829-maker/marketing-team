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
    good: row.good,
    bad: row.bad,
    lesson: row.lesson,
    date: row.created_at,
  }));
};

export const insertFeedback = async (fb) => {
  const { error } = await supabase.from("feedbacks").insert({
    user_id: USER_ID,
    task_title: fb.task,
    rating: fb.rating,
    comment: fb.comment,
    good: fb.good || null,
    bad: fb.bad || null,
    lesson: fb.lesson || null,
  });
  if (error) console.error("insertFeedback:", error);
};

// ========================
// Tasks (daily + extended types)
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
  return data.map(mapTaskRow);
};

export const fetchTasksByType = async (taskType) => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("task_type", taskType)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchTasksByType:", error);
    return [];
  }
  return data.map(mapTaskRow);
};

const mapTaskRow = (row) => ({
  id: row.id,
  name: row.name,
  estimateSec: row.estimate_sec,
  elapsedSec: row.elapsed_sec,
  running: row.timer_running,
  runStartedAt: row.timer_started_at ? new Date(row.timer_started_at).getTime() : null,
  done: row.done,
  createdAt: new Date(row.created_at).getTime(),
  // v2 fields
  project: row.project,
  taskType: row.task_type || "daily",
  assignee: row.assignee,
  deadline: row.deadline,
  deadlineTime: row.deadline_time,
  memo: row.memo,
  ballHolder: row.ball_holder,
  subtasks: row.subtasks || [],
  linkId: row.link_id,
  clientName: row.client_name,
  status: row.status,
  month: row.month,
});

export const insertTask = async (dateKey, task) => {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: USER_ID,
      task_date: dateKey,
      name: task.name,
      estimate_sec: task.estimateSec || 1800,
      elapsed_sec: task.elapsedSec || 0,
      done: task.done || false,
      timer_running: task.running || false,
      timer_started_at: task.runStartedAt ? new Date(task.runStartedAt).toISOString() : null,
      // v2 fields
      project: task.project || null,
      task_type: task.taskType || "daily",
      assignee: task.assignee || null,
      deadline: task.deadline || null,
      deadline_time: task.deadlineTime || null,
      memo: task.memo || null,
      ball_holder: task.ballHolder || null,
      subtasks: task.subtasks || [],
      link_id: task.linkId || null,
      client_name: task.clientName || null,
      status: task.status || null,
      month: task.month || null,
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
  // v2 fields
  if (updates.project !== undefined) mapped.project = updates.project;
  if (updates.taskType !== undefined) mapped.task_type = updates.taskType;
  if (updates.assignee !== undefined) mapped.assignee = updates.assignee;
  if (updates.deadline !== undefined) mapped.deadline = updates.deadline;
  if (updates.deadlineTime !== undefined) mapped.deadline_time = updates.deadlineTime;
  if (updates.memo !== undefined) mapped.memo = updates.memo;
  if (updates.ballHolder !== undefined) mapped.ball_holder = updates.ballHolder;
  if (updates.subtasks !== undefined) mapped.subtasks = updates.subtasks;
  if (updates.linkId !== undefined) mapped.link_id = updates.linkId;
  if (updates.clientName !== undefined) mapped.client_name = updates.clientName;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.month !== undefined) mapped.month = updates.month;

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

// ========================
// Clients
// ========================
export const fetchClients = async () => {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchClients:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    services: row.services || [],
    notes: row.notes,
    createdAt: row.created_at,
  }));
};

export const upsertClient = async (client) => {
  const payload = {
    user_id: USER_ID,
    name: client.name,
    url: client.url || null,
    services: client.services || [],
    notes: client.notes || null,
  };
  if (client.id) {
    const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
    if (error) console.error("upsertClient:", error);
  } else {
    const { data, error } = await supabase.from("clients").insert(payload).select().single();
    if (error) console.error("upsertClient:", error);
    return data?.id;
  }
};

export const deleteClient = async (id) => {
  const { error } = await supabase.from("clients").delete().eq("id", id).eq("user_id", USER_ID);
  if (error) console.error("deleteClient:", error);
};

// ========================
// Projects
// ========================
export const fetchProjects = async () => {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchProjects:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    services: row.services || ["SEO"],
    tasks: row.tasks || [],
    memos: row.memos || [],
    articleEnabled: row.article_enabled || false,
    createdAt: row.created_at,
  }));
};

export const upsertProject = async (project) => {
  const payload = {
    user_id: USER_ID,
    name: project.name,
    category: project.category || (project.services?.[0]) || "SEO",
    services: project.services || ["SEO"],
    tasks: project.tasks || [],
    memos: project.memos || [],
    article_enabled: project.articleEnabled || false,
  };
  if (project.id && !String(project.id).startsWith("proj-seed-")) {
    const { error } = await supabase.from("projects").update(payload).eq("id", project.id);
    if (error) console.error("upsertProject:", error);
  } else {
    const { data, error } = await supabase.from("projects").insert(payload).select().single();
    if (error) console.error("upsertProject:", error);
    return data?.id;
  }
};

export const deleteProject = async (id) => {
  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", USER_ID);
  if (error) console.error("deleteProject:", error);
};

// ========================
// Reports
// ========================
export const fetchReports = async () => {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchReports:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    task: row.task_title,
    clientName: row.client_name,
    finalOutput: row.final_output,
    metadata: row.metadata,
    date: row.created_at,
  }));
};

export const insertReport = async (report) => {
  const { error } = await supabase.from("reports").insert({
    user_id: USER_ID,
    task_title: report.task || report.taskTitle || "",
    client_name: report.clientName || null,
    final_output: report.finalOutput || report.output || "",
    metadata: report.metadata || null,
  });
  if (error) console.error("insertReport:", error);
};

export const deleteReport = async (id) => {
  const { error } = await supabase.from("reports").delete().eq("id", id).eq("user_id", USER_ID);
  if (error) console.error("deleteReport:", error);
};

// ========================
// Message Styles
// ========================
export const fetchMsgStyles = async () => {
  const { data, error } = await supabase
    .from("msg_styles")
    .select("target, styles")
    .eq("user_id", USER_ID);
  if (error) {
    console.error("fetchMsgStyles:", error);
    return {};
  }
  const map = {};
  for (const row of data) {
    map[row.target] = row.styles || [];
  }
  return map;
};

export const upsertMsgStyle = async (target, styles) => {
  const { error } = await supabase
    .from("msg_styles")
    .upsert(
      { user_id: USER_ID, target, styles, updated_at: new Date().toISOString() },
      { onConflict: "user_id,target" }
    );
  if (error) console.error("upsertMsgStyle:", error);
};

export const saveMsgStylesAll = async (stylesObj) => {
  for (const [target, styles] of Object.entries(stylesObj)) {
    await upsertMsgStyle(target, styles);
  }
};

// ========================
// Templates
// ========================
export const fetchTemplates = async () => {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchTemplates:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    content: row.content,
    clientName: row.client_name,
    date: row.created_at,
  }));
};

export const insertTemplate = async (tpl) => {
  const { error } = await supabase.from("templates").insert({
    user_id: USER_ID,
    name: tpl.name,
    content: tpl.content,
    client_name: tpl.clientName || null,
  });
  if (error) console.error("insertTemplate:", error);
};

export const deleteTemplate = async (id) => {
  const { error } = await supabase.from("templates").delete().eq("id", id).eq("user_id", USER_ID);
  if (error) console.error("deleteTemplate:", error);
};

// ========================
// Recurring Tasks
// ========================
export const fetchRecurring = async () => {
  const { data, error } = await supabase
    .from("recurring_tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchRecurring:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    project: row.project,
    estimateSec: row.estimate_sec,
    dayOfWeek: row.day_of_week,
    createdAt: row.created_at,
  }));
};

export const upsertRecurring = async (item) => {
  const payload = {
    user_id: USER_ID,
    name: item.name,
    project: item.project || null,
    estimate_sec: item.estimateSec || 1800,
    day_of_week: item.dayOfWeek != null ? item.dayOfWeek : null,
  };
  if (item.id) {
    const { error } = await supabase.from("recurring_tasks").update(payload).eq("id", item.id);
    if (error) console.error("upsertRecurring:", error);
  } else {
    const { data, error } = await supabase.from("recurring_tasks").insert(payload).select().single();
    if (error) console.error("upsertRecurring:", error);
    return data?.id;
  }
};

export const deleteRecurring = async (id) => {
  const { error } = await supabase.from("recurring_tasks").delete().eq("id", id).eq("user_id", USER_ID);
  if (error) console.error("deleteRecurring:", error);
};

// ========================
// Archived Tasks
// ========================
export const fetchArchived = async () => {
  const { data, error } = await supabase
    .from("archived_tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .order("archived_at", { ascending: false });
  if (error) {
    console.error("fetchArchived:", error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    linkId: row.link_id,
    title: row.title,
    clientName: row.client_name,
    projectName: row.project_name,
    completedAt: row.completed_at,
    result: row.result,
    originalData: row.original_data,
    archivedAt: row.archived_at,
  }));
};

export const insertArchived = async (entry) => {
  const { error } = await supabase.from("archived_tasks").insert({
    user_id: USER_ID,
    link_id: entry.linkId || null,
    title: entry.title || "",
    client_name: entry.clientName || null,
    project_name: entry.projectName || null,
    completed_at: entry.completedAt || new Date().toISOString(),
    result: entry.result || null,
    original_data: entry.originalData || null,
  });
  if (error) console.error("insertArchived:", error);
};

// ========================
// Settings
// ========================
export const fetchSettings = async () => {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", USER_ID)
    .single();
  if (error) {
    if (error.code !== "PGRST116") console.error("fetchSettings:", error);
    return { netlifyUrl: "", gasUrl: "" };
  }
  return {
    netlifyUrl: data.netlify_url || "",
    gasUrl: data.gas_url || "",
  };
};

export const upsertSettings = async (settings) => {
  const { error } = await supabase
    .from("settings")
    .upsert(
      {
        user_id: USER_ID,
        netlify_url: settings.netlifyUrl || null,
        gas_url: settings.gasUrl || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) console.error("upsertSettings:", error);
};

// Storage layer - Supabase CRUD
// Each table has dedicated functions for type safety
// user_id is 'anonymous' until auth is implemented

import { supabase } from "../lib/supabase";

const USER_ID = "anonymous";

// (agent_rules / knowledge / feedbacks tables removed — Stack pivot 2026-04-10)

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

/**
 * Fetch tasks for a date view:
 * - Only tasks whose task_date = dateKey
 * - Overdue project tasks are handled separately via todayProjTasks in the component
 */
export const fetchTasksForDateView = async (dateKey) => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("task_date", dateKey)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchTasksForDateView:", error);
    return [];
  }
  return (data || []).map(mapTaskRow);
};

/**
 * Fetch ALL active daily tasks (not done), regardless of date.
 * Includes tasks with task_type = 'daily' or null (backwards compat).
 * Excludes delegation/inprogress/article (shown in their own sections).
 * Sorted by deadline ascending (null deadlines last).
 */
export const fetchAllActiveTasks = async () => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("done", false)
    .or("task_type.eq.daily,task_type.is.null")
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("fetchAllActiveTasks:", error);
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

/**
 * Fetch the most recent sheet_synced_at timestamp across all sheet-sourced tasks.
 * Phase J-1 以降、シート由来行は task_type='daily'|'inprogress'|'delegation'|'sheet_orphan' に
 * 分散するため、sheet_key IS NOT NULL でフィルタする。
 * UI のラストシンクバッジ表示用 (Phase J-6)。
 */
export const fetchLastSheetSyncAt = async () => {
  const { data, error } = await supabase
    .from("tasks")
    .select("sheet_synced_at")
    .eq("user_id", USER_ID)
    .not("sheet_key", "is", null)
    .order("sheet_synced_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) {
    console.error("fetchLastSheetSyncAt:", error);
    return null;
  }
  return data && data[0] ? data[0].sheet_synced_at : null;
};

/**
 * Fetch tasks for a specific project/client (for ClientDashboardView).
 * Returns in JSONB-compatible format (text, service, linkId, etc.)
 */
// Deduplicate rows by link_id (keep first occurrence = most recently created)
const dedup = (rows) => {
  const seen = new Set();
  return rows.filter((r) => {
    const key = r.link_id || r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const fetchTasksByProject = async (projectName) => {
  if (!projectName) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .or(`client_name.eq.${projectName},project.eq.${projectName}`)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchTasksByProject:", error);
    return [];
  }
  return dedup(data).map(mapTaskToJsonb);
};

/**
 * Fetch ALL active tasks (unified, all types) for List tab.
 * Excludes delegation/inprogress/article (shown in their own sections).
 */
export const fetchAllActiveTasksUnified = async () => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("done", false)
    .or("task_type.eq.daily,task_type.is.null")
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("fetchAllActiveTasksUnified:", error);
    return [];
  }
  return dedup(data).map(mapTaskRow);
};

/**
 * Fetch task counts per client from the tasks table.
 * Uses BOTH client_name and project columns (matching fetchTasksByProject logic).
 * Deduplicates by link_id to avoid double-counting.
 * Returns { "ClientName": { open: N, done: N } }
 */
export const fetchTaskCountsByClient = async () => {
  const { data, error } = await supabase
    .from("tasks")
    .select("client_name, project, done, link_id")
    .eq("user_id", USER_ID);
  if (error) {
    console.error("fetchTaskCountsByClient:", error);
    return {};
  }
  // Deduplicate by link_id (keep first occurrence)
  const seen = new Set();
  const unique = [];
  for (const row of data) {
    if (row.link_id && seen.has(row.link_id)) continue;
    if (row.link_id) seen.add(row.link_id);
    unique.push(row);
  }
  const counts = {};
  unique.forEach((row) => {
    const name = row.client_name || row.project;
    if (!name) return;
    if (!counts[name]) counts[name] = { open: 0, done: 0 };
    if (row.done) counts[name].done++;
    else counts[name].open++;
  });
  return counts;
};

/**
 * Fetch "extra" tasks for a given date — tasks NOT in dayTasks but relevant to that date.
 * Specifically: undone tasks whose deadline <= date but task_date != date (overdue carry-over).
 * This avoids overlap with fetchTasksForDateView (which fetches task_date = date).
 * No client_name filter — includes ALL task types.
 */
/**
 * Fetch "extra" tasks for a given date — tasks NOT in dayTasks but relevant to that date.
 * 1) Undone tasks whose deadline <= date but task_date != date (overdue carry-over)
 * 2) Done tasks whose deadline matches date but task_date != date (completed on that deadline date)
 * This avoids overlap with fetchTasksForDateView (which fetches task_date = date).
 */
export const fetchClientTasksForDate = async (dateKey) => {
  if (!dateKey) return [];
  // Fetch undone tasks with deadline <= dateKey whose task_date is NOT dateKey
  const { data: undone, error: e1 } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("done", false)
    .neq("task_date", dateKey)
    .lte("deadline", dateKey + "T23:59:59")
    .order("deadline", { ascending: true });
  // Fetch done tasks whose deadline is on dateKey but task_date != dateKey
  const { data: done, error: e2 } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("done", true)
    .neq("task_date", dateKey)
    .gte("deadline", dateKey + "T00:00:00")
    .lte("deadline", dateKey + "T23:59:59");
  if (e1) console.error("fetchClientTasksForDate undone:", e1);
  if (e2) console.error("fetchClientTasksForDate done:", e2);
  return dedup([...(undone || []), ...(done || [])]).map(mapTaskRow);
};

// Map tasks table row → JSONB-compatible object (for ClientDashboardView)
const mapTaskToJsonb = (row) => ({
  id: row.id,
  text: row.name,
  done: row.done,
  deadline: row.deadline ? row.deadline.slice(0, 10) : null,
  completedAt: row.completed_at || null,
  service: row.deadline_time, // deadline_time を service として再利用
  linkId: row.link_id,
  date: row.task_date || "",
  memo: row.memo,
  ballHolder: row.ball_holder,
  taskType: row.task_type || "daily",
  status: row.status,
  subtasks: row.subtasks || [],
  assignee: row.assignee,
  elapsedSec: row.elapsed_sec || 0,
  project: row.project,
  _dbId: row.id, // tasks テーブルの行ID
});

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
  service: row.deadline_time, // deadline_time カラムを service として再利用
  memo: row.memo,
  ballHolder: row.ball_holder,
  subtasks: row.subtasks || [],
  linkId: row.link_id,
  clientName: row.client_name,
  status: row.status,
  month: row.month,
  taskDate: row.task_date,
  completedAt: row.completed_at || null,
  // Sheet-sourced task metadata (Phase J-5)
  sheetKey: row.sheet_key || null,
  sheetSyncedAt: row.sheet_synced_at || null,
  sheetCategory: row.sheet_category || null,
  sheetPriority: row.sheet_priority || null,
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
      deadline_time: task.service || null, // deadline_time を service として再利用
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
  if (updates.service !== undefined) mapped.deadline_time = updates.service; // deadline_time を service として再利用
  if (updates.memo !== undefined) mapped.memo = updates.memo;
  if (updates.ballHolder !== undefined) mapped.ball_holder = updates.ballHolder;
  if (updates.subtasks !== undefined) mapped.subtasks = updates.subtasks;
  if (updates.linkId !== undefined) mapped.link_id = updates.linkId;
  if (updates.clientName !== undefined) mapped.client_name = updates.clientName;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.month !== undefined) mapped.month = updates.month;
  if (updates.taskDate !== undefined) mapped.task_date = updates.taskDate;
  if (updates.completedAt !== undefined) mapped.completed_at = updates.completedAt;

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

// Update task by linkId (for cross-system sync from ClientDashboard)
export const updateTaskByLinkId = async (linkId, updates) => {
  if (!linkId) return;
  const mapped = {};
  if (updates.done !== undefined) mapped.done = updates.done;
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.deadline !== undefined) mapped.deadline = updates.deadline;
  if (updates.memo !== undefined) mapped.memo = updates.memo;
  if (updates.service !== undefined) mapped.deadline_time = updates.service;
  if (updates.ballHolder !== undefined) mapped.ball_holder = updates.ballHolder;
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.subtasks !== undefined) mapped.subtasks = updates.subtasks;
  if (updates.assignee !== undefined) mapped.assignee = updates.assignee;
  if (updates.completedAt !== undefined) mapped.completed_at = updates.completedAt;
  const { error } = await supabase.from("tasks").update(mapped).eq("link_id", linkId).eq("user_id", USER_ID);
  if (error) console.error("updateTaskByLinkId:", error);
};

// Delete task by linkId (for cross-system sync from ClientDashboard)
export const deleteTaskByLinkId = async (linkId) => {
  if (!linkId) return;
  const { error } = await supabase.from("tasks").delete().eq("link_id", linkId).eq("user_id", USER_ID);
  if (error) console.error("deleteTaskByLinkId:", error);
};

/**
 * Fetch all completed tasks for a given month (YYYY-MM format).
 * Uses completed_at if set, otherwise falls back to deadline range.
 */
export const fetchCompletedTasksForMonth = async (monthKey) => {
  if (!monthKey) return [];
  const startDate = monthKey + "-01";
  const endDate = monthKey + "-31T23:59:59";
  // Query 1: tasks with completed_at in this month
  const { data: byCompleted, error: e1 } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("done", true)
    .gte("completed_at", startDate)
    .lte("completed_at", endDate)
    .order("completed_at", { ascending: false });
  // Query 2: tasks with deadline in this month but no completed_at (legacy)
  const { data: byDeadline, error: e2 } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("done", true)
    .is("completed_at", null)
    .gte("deadline", startDate)
    .lte("deadline", endDate)
    .order("deadline", { ascending: false });
  if (e1) console.error("fetchCompletedTasksForMonth (completed_at):", e1);
  if (e2) console.error("fetchCompletedTasksForMonth (deadline):", e2);
  return dedup([...(byCompleted || []), ...(byDeadline || [])]).map(mapTaskRow);
};

/**
 * Full migration: JSONB project tasks → tasks table (one-time).
 * - Handles ALL tasks (including done ones, unlike the old syncProjectTasksToDb)
 * - Generates linkId for tasks without one and updates JSONB
 * - Syncs service field to deadline_time column
 * - NEVER deletes anything
 */
export const migrateProjectTasksToTable = async (projects, upsertProjectFn) => {
  if (!projects || projects.length === 0) return;
  console.log("🔄 migrateProjectTasksToTable: 開始...");

  // Collect ALL tasks from all projects
  const allProjectTasks = [];
  const projectsNeedingUpdate = new Set(); // track projects whose JSONB needs linkId updates
  for (const p of projects) {
    for (const t of (p.tasks || [])) {
      if (!t.linkId) {
        // Generate linkId for tasks that don't have one
        t.linkId = "link-mig-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        projectsNeedingUpdate.add(p.id);
      }
      allProjectTasks.push({ ...t, _projectName: p.name, _projectId: p.id });
    }
  }

  if (allProjectTasks.length === 0) {
    console.log("🔄 migrateProjectTasksToTable: タスクなし、スキップ");
    return;
  }

  // Batch query existing linkIds in tasks table
  const linkIds = allProjectTasks.map((t) => t.linkId).filter(Boolean);
  const batchSize = 100;
  const existingSet = new Set();
  for (let i = 0; i < linkIds.length; i += batchSize) {
    const batch = linkIds.slice(i, i + batchSize);
    const { data } = await supabase
      .from("tasks")
      .select("link_id, deadline_time")
      .eq("user_id", USER_ID)
      .in("link_id", batch);
    (data || []).forEach((r) => existingSet.add(r.link_id));
  }

  // Separate: tasks to insert vs tasks to update (service sync)
  const toInsert = [];
  const toUpdateService = [];
  for (const t of allProjectTasks) {
    if (!existingSet.has(t.linkId)) {
      toInsert.push(t);
    } else if (t.service) {
      // Existing row might need service field update
      toUpdateService.push(t);
    }
  }

  // Batch insert new tasks
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      const rows = batch.map((t) => ({
        user_id: USER_ID,
        task_date: t.date || new Date().toISOString().slice(0, 10),
        name: t.text || "",
        estimate_sec: t.estimateSec || 1800,
        elapsed_sec: t.elapsedSec || 0,
        done: t.done || false,
        timer_running: false,
        project: t._projectName,
        task_type: t.taskType || "daily",
        deadline: t.deadline || null,
        deadline_time: t.service || null, // service → deadline_time
        link_id: t.linkId,
        client_name: t._projectName,
        memo: t.memo || null,
        ball_holder: t.ballHolder || null,
        status: t.status || null,
        subtasks: t.subtasks || [],
        assignee: t.assignee || null,
      }));
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) console.error("migrateProjectTasksToTable insert:", error);
    }
    console.log(`✅ ${toInsert.length}件の新規タスクを tasks テーブルに挿入`);
  }

  // Update service for existing rows
  if (toUpdateService.length > 0) {
    let updated = 0;
    for (const t of toUpdateService) {
      const { error } = await supabase.from("tasks")
        .update({ deadline_time: t.service })
        .eq("link_id", t.linkId)
        .eq("user_id", USER_ID)
        .is("deadline_time", null); // only update if not already set
      if (!error) updated++;
    }
    if (updated > 0) console.log(`✅ ${updated}件の既存タスクに service を同期`);
  }

  // Update JSONB for projects that got new linkIds
  if (projectsNeedingUpdate.size > 0 && upsertProjectFn) {
    for (const p of projects) {
      if (projectsNeedingUpdate.has(p.id)) {
        await upsertProjectFn(p);
      }
    }
    console.log(`✅ ${projectsNeedingUpdate.size}件のプロジェクト JSONB に linkId を追加`);
  }

  console.log("🔄 migrateProjectTasksToTable: 完了");
};

// Legacy alias (kept for backward compat)
export const syncProjectTasksToDb = migrateProjectTasksToTable;

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
    spreadsheetUrl: row.spreadsheet_url || "",
    siteUrl: row.site_url || "",
    sheetName: row.sheet_name || "シート1",
    createdAt: row.created_at,
  }));
};

// ── 完了タスク保護: localStorage の完了IDでstale writeによる復活を防止 ──
const DONE_KEY = "doneProjTaskIds";
const _getDoneIds = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]")); } catch { return new Set(); } };
const _protectTasks = (tasks, _caller) => {
  const doneIds = _getDoneIds();
  if (doneIds.size === 0 || !tasks || tasks.length === 0) return tasks;
  let fixed = 0;
  const result = tasks.map(t => {
    if (doneIds.has(t.id) && !t.done) {
      fixed++;
      return { ...t, done: true, completedAt: t.completedAt || new Date().toISOString() };
    }
    return t;
  });
  if (fixed > 0) console.warn(`🛡️ _protectTasks(${_caller || "?"}): ${fixed}件の完了タスクを保護 (stale write防止)`);
  return result;
};
export const protectProjectsDone = (projects) => {
  const doneIds = _getDoneIds();
  if (doneIds.size === 0) return projects;
  console.log(`🔒 protectProjectsDone: localStorage に ${doneIds.size}件の完了ID`);
  return projects.map(p => {
    const tasks = p.tasks || [];
    if (!tasks.some(t => doneIds.has(t.id) && !t.done)) return p;
    return { ...p, tasks: _protectTasks(tasks, `load:${p.name}`) };
  });
};

export const upsertProject = async (project) => {
  // ★ Supabase書き込み前に完了タスク保護を適用
  const protectedTasks = _protectTasks(project.tasks || [], `upsert:${project.name}`);
  const payload = {
    user_id: USER_ID,
    name: project.name,
    category: project.category || (project.services?.[0]) || "SEO",
    services: project.services || ["SEO"],
    tasks: protectedTasks,
    memos: project.memos || [],
    article_enabled: project.articleEnabled || false,
    spreadsheet_url: project.spreadsheetUrl || null,
    site_url: project.siteUrl || null,
    sheet_name: project.sheetName || "シート1",
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
// (reports / msg_styles tables removed — Stack pivot 2026-04-10)
// (templates table kept for future use but no UI hookup)

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
    dayOfMonth: row.day_of_week,
    createdAt: row.created_at,
  }));
};

export const upsertRecurring = async (item) => {
  const payload = {
    user_id: USER_ID,
    name: item.name,
    project: item.project || null,
    estimate_sec: item.estimateSec || 1800,
    day_of_week: item.dayOfMonth != null ? item.dayOfMonth : null,
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

export const autoInsertRecurringTasks = async (dateKey, recurringList) => {
  const dayOfMonth = new Date(dateKey).getDate();
  const matching = recurringList.filter((r) => r.dayOfMonth === dayOfMonth);
  if (matching.length === 0) return 0;
  const existing = await fetchTasksByDate(dateKey);
  let inserted = 0;
  const norm = (v) => v || null; // normalize "" / undefined / null → null
  for (const r of matching) {
    const alreadyExists = existing.some((t) => t.name === r.name && norm(t.project) === norm(r.project));
    if (!alreadyExists) {
      await insertTask(dateKey, {
        name: r.name,
        project: norm(r.project),
        estimateSec: r.estimateSec || 1800,
        taskType: "daily",
      });
      inserted++;
    }
  }
  return inserted;
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

// (settings table removed — netlify/gas urls no longer used)
// (article_check_results removed — quality check feature dropped)

import { useState, useEffect } from "react";
import { T } from "../../lib/constants";
import { todayKey, dateLabel } from "../../lib/dates";
import { fmtSec } from "../../lib/format";
import Card from "../ui/Card";
import Btn from "../ui/Btn";

export default function TaskManagementView({ tasks, onSave }) {
  const [date, setDate] = useState(todayKey());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEst, setNewEst] = useState(30);
  const [, setTicker] = useState(0);

  // Tick every second for live stopwatch
  useEffect(() => {
    const t = setInterval(() => setTicker((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const dayTasks = tasks[date] || [];
  const completed = dayTasks.filter((t) => t.done).length;
  const total = dayTasks.length;

  const getElapsed = (task) => {
    let base = task.elapsedSec || 0;
    if (task.running && task.runStartedAt) base += Math.floor((Date.now() - task.runStartedAt) / 1000);
    return base;
  };

  const totalEstimate = dayTasks.reduce((s, t) => s + t.estimateSec, 0);
  const totalElapsed = dayTasks.reduce((s, t) => s + getElapsed(t), 0);

  const addTask = () => {
    if (!newName.trim()) return;
    const task = {
      id: String(Date.now()),
      name: newName.trim(),
      estimateSec: newEst * 60,
      elapsedSec: 0,
      running: false,
      runStartedAt: null,
      done: false,
      createdAt: Date.now(),
    };
    const updated = { ...tasks, [date]: [...(tasks[date] || []), task] };
    onSave(updated);
    setNewName("");
    setNewEst(30);
    setAdding(false);
  };

  const startStop = (id) => {
    const updated = {
      ...tasks,
      [date]: (tasks[date] || []).map((t) => {
        if (t.id === id) {
          if (t.running) {
            const extra = t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
            return { ...t, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null };
          } else {
            return { ...t, running: true, runStartedAt: Date.now() };
          }
        }
        // Stop other running tasks
        if (t.running && !t.done) {
          const extra = t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
          return { ...t, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null };
        }
        return t;
      }),
    };
    onSave(updated);
  };

  const markDone = (id) => {
    const updated = {
      ...tasks,
      [date]: (tasks[date] || []).map((t) => {
        if (t.id !== id) return t;
        if (!t.done) {
          const extra = t.running && t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
          return { ...t, done: true, running: false, elapsedSec: (t.elapsedSec || 0) + extra, runStartedAt: null };
        }
        return { ...t, done: false };
      }),
    };
    onSave(updated);
  };

  const deleteTask = (id) => {
    const updated = { ...tasks, [date]: (tasks[date] || []).filter((t) => t.id !== id) };
    onSave(updated);
  };

  const resetTimer = (id) => {
    const updated = {
      ...tasks,
      [date]: (tasks[date] || []).map((t) =>
        t.id === id ? { ...t, elapsedSec: 0, running: false, runStartedAt: null, done: false } : t
      ),
    };
    onSave(updated);
  };

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>⏱ タスク管理</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Btn variant="ghost" onClick={prevDay} style={{ fontSize: 16, padding: "4px 8px" }}>←</Btn>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text, minWidth: 120, textAlign: "center" }}>
            {dateLabel(date)}
          </span>
          <Btn variant="ghost" onClick={nextDay} style={{ fontSize: 16, padding: "4px 8px" }}>→</Btn>
          {date !== todayKey() && (
            <Btn variant="secondary" onClick={() => setDate(todayKey())} style={{ fontSize: 11 }}>今日</Btn>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card style={{ padding: "10px 16px", flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: T.textMuted }}>進捗</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: completed === total && total > 0 ? T.success : T.text }}>
            {completed}
            <span style={{ fontSize: 13, color: T.textDim }}>/{total}</span>
          </div>
          {total > 0 && (
            <div style={{ height: 4, borderRadius: 2, background: T.border, marginTop: 4 }}>
              <div style={{ height: 4, borderRadius: 2, background: T.success, width: `${(completed / total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          )}
        </Card>
        <Card style={{ padding: "10px 16px", flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: T.textMuted }}>見積もり合計</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtSec(totalEstimate)}</div>
        </Card>
        <Card style={{ padding: "10px 16px", flex: 1, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: T.textMuted }}>実績合計</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: totalElapsed > totalEstimate && totalEstimate > 0 ? T.error : T.success, fontVariantNumeric: "tabular-nums" }}>
            {fmtSec(totalElapsed)}
          </div>
        </Card>
      </div>

      {/* Task List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dayTasks.map((task) => {
          const elapsed = getElapsed(task);
          const pct = task.estimateSec > 0 ? Math.min(elapsed / task.estimateSec, 1) : 0;
          const over = elapsed > task.estimateSec && task.estimateSec > 0;
          const isRunning = task.running && !task.done;
          const barColor = task.done ? T.success : over ? T.error : isRunning ? T.accent : T.textMuted;

          return (
            <Card key={task.id} style={{ padding: 0, overflow: "hidden", border: `1px solid ${isRunning ? T.accent + "55" : T.border}`, background: isRunning ? T.accent + "06" : T.bgCard }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
                {/* Done checkbox */}
                <button
                  onClick={() => markDone(task.id)}
                  style={{
                    width: 26, height: 26, borderRadius: "50%",
                    border: `2px solid ${task.done ? T.success : T.border}`,
                    background: task.done ? T.success + "22" : "transparent",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: T.success, flexShrink: 0,
                  }}
                >
                  {task.done ? "✓" : ""}
                </button>

                {/* Task info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: task.done ? T.textMuted : T.text, textDecoration: task.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: T.textMuted }}>見積: {fmtSec(task.estimateSec)}</span>
                  </div>
                </div>

                {/* Timer display */}
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: `'SF Mono', 'Menlo', monospace, ${T.font}`, color: task.done ? T.success : over ? T.error : isRunning ? T.accent : T.text, letterSpacing: 1 }}>
                    {fmtSec(elapsed)}
                  </div>
                  {over && !task.done && (
                    <div style={{ fontSize: 10, color: T.error, marginTop: 2 }}>+{fmtSec(elapsed - task.estimateSec)} 超過</div>
                  )}
                </div>

                {/* Start/Stop button */}
                {!task.done ? (
                  <button
                    onClick={() => startStop(task.id)}
                    style={{
                      width: 44, height: 44, borderRadius: "50%",
                      border: `2px solid ${isRunning ? T.error : T.success}`,
                      background: isRunning ? T.error + "15" : T.success + "15",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0, transition: "all 0.2s",
                    }}
                  >
                    {isRunning ? "⏸" : "▶"}
                  </button>
                ) : (
                  <button
                    onClick={() => resetTimer(task.id)}
                    title="リセット"
                    style={{
                      width: 44, height: 44, borderRadius: "50%",
                      border: `2px solid ${T.border}`, background: "transparent",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, flexShrink: 0, color: T.textMuted,
                    }}
                  >
                    ↺
                  </button>
                )}

                {/* Delete */}
                <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 12, opacity: 0.4, flexShrink: 0 }}>
                  🗑
                </button>
              </div>

              {/* Progress bar */}
              <div style={{ height: 3, background: T.border }}>
                <div style={{ height: 3, background: barColor, width: `${Math.min(pct * 100, 100)}%`, transition: "width 0.5s", opacity: 0.7 }} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add task */}
      {adding ? (
        <Card style={{ border: `1px solid ${T.accent}33` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>タスク名</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
                autoFocus
                placeholder="タスクを入力..."
                style={{ width: "100%", padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 13, outline: "none", fontFamily: T.font, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ width: 90 }}>
              <label style={{ fontSize: 11, color: T.textDim, display: "block", marginBottom: 4 }}>見積もり(分)</label>
              <input
                type="number"
                value={newEst}
                onChange={(e) => setNewEst(parseInt(e.target.value) || 0)}
                min={1}
                style={{ width: "100%", padding: "8px 6px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 13, outline: "none", fontFamily: T.font, boxSizing: "border-box" }}
              />
            </div>
            <Btn onClick={addTask} disabled={!newName.trim()}>追加</Btn>
            <Btn variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>取消</Btn>
          </div>
        </Card>
      ) : (
        <Btn variant="secondary" onClick={() => setAdding(true)} style={{ alignSelf: "flex-start" }}>
          + タスクを追加
        </Btn>
      )}
    </div>
  );
}

import { useState } from "react";
import { T } from "../../lib/constants";
import { useApp } from "../../contexts/AppContext";
import { insertTask as insertTaskDB } from "../../hooks/useStorage";
import { todayKey, toISO, fmtDateInput } from "../../lib/dates";
import Btn from "./Btn";

const TASK_TYPES = [
  { id: "daily", label: "自分" },
  { id: "delegation", label: "依頼" },
  { id: "inprogress", label: "進行中" },
];

export default function QuickTaskFab() {
  const { projects, setToast, bumpTaskRefresh } = useApp();
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState("daily");
  const [project, setProject] = useState("");
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [assignee, setAssignee] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    const base = {
      name: name.trim(),
      project: project || null,
      deadline: deadline ? toISO(deadline) : null,
      taskType,
      linkId: "link-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    };
    if (taskType === "delegation") {
      base.assignee = assignee || null;
      base.status = "pending";
    }
    await insertTaskDB(todayKey(), base);
    bumpTaskRefresh();
    const typeLabel = TASK_TYPES.find(t => t.id === taskType)?.label || "";
    setToast(`✅ ${typeLabel}タスク追加: ${name.trim()}`);
    setName("");
    setProject("");
    setDeadline("");
    setAssignee("");
    setOpen(false);
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
            zIndex: 199,
          }}
        />
      )}

      {/* Form popup */}
      {open && (
        <div style={{
          position: "fixed", bottom: 80, right: 20, zIndex: 201,
          width: 300, background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: T.radius, padding: 16, boxShadow: T.shadow,
          display: "flex", flexDirection: "column", gap: 12,
          animation: "fadeIn 0.15s ease",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
            タスク追加
          </div>

          {/* タスク種別 */}
          <div style={{ display: "flex", gap: 4 }}>
            {TASK_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTaskType(t.id)}
                style={{
                  flex: 1, padding: "6px 0", fontSize: 11, fontWeight: taskType === t.id ? 600 : 400,
                  color: taskType === t.id ? "#fff" : T.textMuted,
                  background: taskType === t.id ? T.accent : T.bgInput,
                  border: `1px solid ${taskType === t.id ? T.accent : T.border}`,
                  borderRadius: T.radiusSm, cursor: "pointer", fontFamily: T.font,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 案件名 */}
          <div>
            <label style={{ fontSize: 11, color: T.textDim, marginBottom: 4, display: "block" }}>案件名</label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", fontSize: 13,
                background: T.bgInput, color: T.text, border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, fontFamily: T.font, outline: "none",
              }}
            >
              <option value="">選択してください</option>
              {(projects || []).map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* 施策名 */}
          <div>
            <label style={{ fontSize: 11, color: T.textDim, marginBottom: 4, display: "block" }}>施策名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: LP制作、記事執筆..."
              onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && handleAdd()}
              style={{
                width: "100%", padding: "8px 10px", fontSize: 13,
                background: T.bgInput, color: T.text, border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, fontFamily: T.font, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 担当者 (delegation only) */}
          {taskType === "delegation" && (
            <div>
              <label style={{ fontSize: 11, color: T.textDim, marginBottom: 4, display: "block" }}>担当者</label>
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="例: 田中さん"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 13,
                  background: T.bgInput, color: T.text, border: `1px solid ${T.border}`,
                  borderRadius: T.radiusSm, fontFamily: T.font, outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* 期限 */}
          <div>
            <label style={{ fontSize: 11, color: T.textDim, marginBottom: 4, display: "block" }}>期限（MM/DD）</label>
            <input
              value={deadline}
              onChange={(e) => setDeadline(fmtDateInput(e.target.value))}
              placeholder="MM/DD"
              style={{
                width: "100%", padding: "8px 10px", fontSize: 13,
                background: T.bgInput, color: T.text, border: `1px solid ${T.border}`,
                borderRadius: T.radiusSm, fontFamily: T.font, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>キャンセル</Btn>
            <Btn onClick={handleAdd} style={{ fontSize: 12 }}>追加</Btn>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 200,
          width: 52, height: 52, borderRadius: "50%",
          background: open ? T.error : T.accent, color: "#fff",
          border: "none", fontSize: 24, fontWeight: 700,
          cursor: "pointer", boxShadow: "0 4px 16px rgba(59,130,246,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s ease",
          transform: open ? "rotate(45deg)" : "none",
        }}
      >
        ＋
      </button>
    </>
  );
}

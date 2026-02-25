import { useState } from "react";
import { T } from "../../lib/constants";
import { truncate, fmtDate, makeStars } from "../../lib/format";
import { getCat } from "../../lib/constants";
import Card from "../ui/Card";
import Btn from "../ui/Btn";
import AgentAvatar from "../ui/AgentAvatar";

export default function TeamSettingsView({ agents, agentRules, knowledge, feedbacks, onSaveRules }) {
  const [editing, setEditing] = useState(null);
  const [editRules, setEditRules] = useState("");

  if (editing) {
    const myKn = knowledge.filter((k) => {
      if (!k.assignedAgents || !k.assignedAgents.length) return true;
      return k.assignedAgents.includes("all") || k.assignedAgents.includes(editing.id);
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Btn variant="ghost" onClick={() => setEditing(null)} style={{ alignSelf: "flex-start" }}>
          ← 戻る
        </Btn>
        <Card style={{ borderTop: `3px solid ${editing.color}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <AgentAvatar agent={editing} size={40} active />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{editing.fullName}</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{editing.role}</div>
            </div>
          </div>

          {myKn.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, marginBottom: 6 }}>
                📚 学習済み ({myKn.length}件)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {myKn.map((k) => {
                  const ci = getCat(k.category);
                  return (
                    <span
                      key={k.id}
                      style={{
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 4,
                        background: ci.color + "15",
                        color: ci.color,
                      }}
                    >
                      {ci.icon} {truncate(k.title, 20)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: T.textDim, display: "block", marginBottom: 8 }}>
            ルール（Markdown）
          </label>
          <textarea
            value={editRules}
            onChange={(e) => setEditRules(e.target.value)}
            style={{
              width: "100%",
              minHeight: 300,
              background: T.bg,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm,
              padding: 14,
              fontSize: 13,
              fontFamily: T.font,
              lineHeight: 1.7,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn variant="ghost" onClick={() => setEditRules(editing.defaultRules)}>
              デフォルト
            </Btn>
            <Btn
              onClick={() => {
                onSaveRules(editing.id, editRules);
                setEditing(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>👥 チーム設定</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {agents.map((agent) => {
          const custom = agentRules[agent.id] && agentRules[agent.id] !== agent.defaultRules;
          const knCnt = knowledge.filter((k) => {
            if (!k.assignedAgents || !k.assignedAgents.length) return true;
            return k.assignedAgents.includes("all") || k.assignedAgents.includes(agent.id);
          }).length;

          return (
            <Card
              key={agent.id}
              onClick={() => {
                setEditing(agent);
                setEditRules(agentRules[agent.id] || agent.defaultRules);
              }}
              style={{ cursor: "pointer", borderTop: `3px solid ${agent.color}` }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <AgentAvatar agent={agent} size={36} active />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{agent.fullName}</div>
                </div>
                {custom && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: T.accent + "22",
                      color: T.accent,
                    }}
                  >
                    カスタム
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: T.textDim }}>{agent.role}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: 11, color: T.purple }}>📚 {knCnt}件</span>
                <span style={{ fontSize: 11, color: T.accent }}>編集 →</span>
              </div>
            </Card>
          );
        })}
      </div>

      {feedbacks.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>
            📝 フィードバック履歴（直近{Math.min(feedbacks.length, 10)}件）
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {feedbacks.slice(0, 10).map((fb) => (
              <Card key={fb.id} style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: T.warning }}>{makeStars(fb.rating)}</span>
                  <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{fb.task}</span>
                  <span style={{ fontSize: 10, color: T.textDim }}>{fmtDate(fb.date)}</span>
                </div>
                {fb.comment && (
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{fb.comment}</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

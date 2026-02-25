import { useState, useRef, useCallback } from "react";
import { T, KCATS, getCat } from "../../lib/constants";
import { fmtDate } from "../../lib/format";
import { truncate } from "../../lib/format";
import Card from "../ui/Card";
import Btn from "../ui/Btn";
import { AGENTS } from "../../lib/constants";

export default function KnowledgeView({ knowledge, onAdd, onDelete, agents = AGENTS }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [cat, setCat] = useState("rule");
  const [assignedAgents, setAssignedAgents] = useState(["all"]);
  const [expanded, setExpanded] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const fRef = useRef(null);

  const toggleAgent = (aid) => {
    if (aid === "all") {
      setAssignedAgents(["all"]);
      return;
    }
    let next = assignedAgents.filter((a) => a !== "all");
    if (next.includes(aid)) next = next.filter((a) => a !== aid);
    else next.push(aid);
    if (!next.length) next = ["all"];
    setAssignedAgents(next);
  };

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) return;
    onAdd({
      id: String(Date.now()),
      title: title.trim(),
      content: content.trim(),
      category: cat,
      assignedAgents,
      date: new Date().toISOString(),
    });
    setTitle("");
    setContent("");
    setCat("rule");
    setAssignedAgents(["all"]);
    setAdding(false);
  };

  const handleFile = useCallback(async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const txt = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsText(f);
      });
      setTitle(f.name.replace(/\.[^/.]+$/, ""));
      setContent(txt.slice(0, 10000));
      setAdding(true);
    } catch {
      alert("読取失敗");
    }
    e.target.value = "";
  }, []);

  const filtered =
    filterCat === "all" ? knowledge : knowledge.filter((k) => k.category === filterCat);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>📚 学習（ナレッジDB）</div>
        <div style={{ display: "flex", gap: 4 }}>
          {!adding && (
            <Btn onClick={() => setAdding(true)} style={{ fontSize: 12 }}>
              + 追加
            </Btn>
          )}
          {!adding && (
            <Btn variant="secondary" onClick={() => fRef.current?.click()} style={{ fontSize: 12 }}>
              📄 読込
            </Btn>
          )}
          <input
            ref={fRef}
            type="file"
            accept=".txt,.md,.csv,.json,.html"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterCat("all")}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "none",
            background: filterCat === "all" ? T.accent + "25" : T.bgCard,
            color: filterCat === "all" ? T.accent : T.textMuted,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font,
          }}
        >
          すべて ({knowledge.length})
        </button>
        {KCATS.map((c) => {
          const cnt = knowledge.filter((k) => k.category === c.id).length;
          return cnt ? (
            <button
              key={c.id}
              onClick={() => setFilterCat(c.id)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                background: filterCat === c.id ? c.color + "25" : T.bgCard,
                color: filterCat === c.id ? c.color : T.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: T.font,
              }}
            >
              {c.icon} {c.label} ({cnt})
            </button>
          ) : null;
        })}
      </div>

      {/* Add form */}
      {adding && (
        <Card style={{ border: `1px solid ${T.purple}33`, background: T.purple + "05" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>
            ナレッジを追加
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, marginBottom: 6 }}>
            カテゴリ
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            {KCATS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: cat === c.id ? c.color + "25" : T.bg,
                  color: cat === c.id ? c.color : T.textDim,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: T.font,
                }}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            style={{
              width: "100%",
              padding: "8px 12px",
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: T.radiusXs,
              color: T.text,
              fontSize: 13,
              outline: "none",
              fontFamily: T.font,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容を入力..."
            rows={4}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: T.radiusXs,
              color: T.text,
              fontSize: 12,
              lineHeight: 1.7,
              resize: "vertical",
              outline: "none",
              fontFamily: T.font,
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, marginBottom: 8 }}>
            🎓 誰が学ぶ？
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            <button
              onClick={() => setAssignedAgents(["all"])}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: `2px solid ${assignedAgents.includes("all") ? T.accent : T.border}`,
                background: assignedAgents.includes("all") ? T.accent + "15" : "transparent",
                color: assignedAgents.includes("all") ? T.accent : T.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: T.font,
              }}
            >
              👥 全メンバー
            </button>
            {agents.map((a) => {
              const sel = assignedAgents.includes(a.id) && !assignedAgents.includes("all");
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAgent(a.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: `2px solid ${sel ? a.color : T.border}`,
                    background: sel ? a.color + "15" : "transparent",
                    color: sel ? a.color : T.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: T.font,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{a.icon}</span>
                  {a.name}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAdd} disabled={!title.trim() || !content.trim()}>
              保存
            </Btn>
            <Btn variant="ghost" onClick={() => setAdding(false)}>
              キャンセル
            </Btn>
          </div>
        </Card>
      )}

      {/* Knowledge list */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", color: T.textMuted, fontSize: 13, padding: 20 }}>
            {knowledge.length === 0
              ? "ナレッジを追加するとチームの精度が上がります"
              : "このカテゴリにはまだナレッジがありません"}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((item) => {
            const ci = getCat(item.category);
            const isExp = expanded === item.id;
            const assigned = item.assignedAgents || ["all"];
            const isAll = assigned.includes("all") || !assigned.length;

            return (
              <Card
                key={item.id}
                style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : item.id)}
              >
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{ci.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: T.text,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: ci.color }}>{ci.label}</span>
                      <span style={{ fontSize: 10, color: T.textDim }}>·</span>
                      {isAll ? (
                        <span style={{ fontSize: 10, color: T.textDim }}>👥 全員</span>
                      ) : (
                        assigned.map((aid) => {
                          const ag = agents.find((a) => a.id === aid);
                          return ag ? (
                            <span key={aid} style={{ fontSize: 12 }} title={ag.name}>
                              {ag.icon}
                            </span>
                          ) : null;
                        })
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: T.textDim,
                      transform: isExp ? "rotate(180deg)" : "none",
                      transition: "0.2s",
                    }}
                  >
                    ▼
                  </span>
                </div>
                {isExp && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ padding: "0 16px 12px", borderTop: `1px solid ${T.border}` }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: T.textDim,
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        marginTop: 10,
                        maxHeight: 200,
                        overflowY: "auto",
                      }}
                    >
                      {item.content}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 10,
                      }}
                    >
                      <span style={{ fontSize: 10, color: T.textDim }}>{fmtDate(item.date)}</span>
                      <Btn
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                        style={{ fontSize: 10, padding: "2px 8px" }}
                      >
                        削除
                      </Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from "react";
import { T } from "../../lib/constants";
import { truncate, fmtDate, makeStars } from "../../lib/format";
import { getCat } from "../../lib/constants";
import { parseExportFile, importToSupabase, CATEGORY_LABELS } from "../../lib/migration";
import Card from "../ui/Card";
import Btn from "../ui/Btn";
import AgentAvatar from "../ui/AgentAvatar";

// ── Data Import Panel ──
function DataImportPanel({ onToast, onImportComplete }) {
  const [step, setStep] = useState("idle"); // idle | preview | importing | done | error
  const [parsed, setParsed] = useState(null);
  const [progress, setProgress] = useState({}); // { [category]: { status, count } }
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const result = parseExportFile(text);
      if (result.error) {
        setErrorMsg(result.error);
        setStep("error");
        return;
      }

      setParsed(result);
      setStep("preview");
    } catch (err) {
      setErrorMsg("ファイルの読み込みに失敗しました: " + err.message);
      setStep("error");
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    setStep("importing");
    setProgress({});

    const result = await importToSupabase(parsed.data, (category, status, count) => {
      setProgress((prev) => ({ ...prev, [category]: { status, count } }));
    });

    setImportResult(result);
    setStep("done");

    if (result.errors.length === 0) {
      onToast("✅ データインポート完了！");
    } else {
      onToast("⚠️ 一部エラーがありました");
    }

    // Reload to reflect imported data
    if (onImportComplete) onImportComplete();
  }, [parsed, onToast, onImportComplete]);

  const reset = () => {
    setStep("idle");
    setParsed(null);
    setProgress({});
    setImportResult(null);
    setErrorMsg("");
  };

  return (
    <Card style={{ border: `1px solid ${T.cyan}33`, background: `${T.cyan}05` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>📦</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>データインポート</span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 99,
            background: `${T.cyan}22`,
            color: T.cyan,
            marginLeft: "auto",
          }}
        >
          旧アプリ → Supabase
        </span>
      </div>

      {/* Idle: File upload */}
      {step === "idle" && (
        <div>
          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7, marginBottom: 16 }}>
            旧アプリ（Claude Artifact）からエクスポートしたJSONファイルを選択してください。
            <br />
            エクスポート方法は <code style={{ fontSize: 11, background: T.bg, padding: "1px 4px", borderRadius: 3, color: T.cyan }}>tools/export-data.html</code> を参照。
          </div>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFile} />
          <Btn
            onClick={() => fileRef.current?.click()}
            style={{ fontSize: 13 }}
          >
            📄 JSONファイルを選択
          </Btn>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: `${T.error}15`,
              border: `1px solid ${T.error}33`,
              fontSize: 13,
              color: T.error,
              marginBottom: 12,
            }}
          >
            {errorMsg}
          </div>
          <Btn variant="secondary" onClick={reset} style={{ fontSize: 12 }}>
            やり直す
          </Btn>
        </div>
      )}

      {/* Preview: Show data summary before import */}
      {step === "preview" && parsed && (
        <div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: T.bg,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 8 }}>
              バージョン: {parsed.version} ｜ エクスポート日時: {parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("ja-JP") : "不明"}
            </div>

            {/* Importable items */}
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              インポート可能:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {["agents", "knowledge", "feedbacks", "tasks"].map((key) => {
                const count = parsed.stats[key] || 0;
                const meta = CATEGORY_LABELS[key];
                if (count === 0) return null;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: `${T.success}10`,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{meta.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>{count} 件</span>
                  </div>
                );
              })}
              {["agents", "knowledge", "feedbacks", "tasks"].every((k) => !parsed.stats[k]) && (
                <div style={{ fontSize: 12, color: T.textMuted, padding: "6px 10px" }}>
                  インポート可能なデータがありません
                </div>
              )}
            </div>

            {/* Skipped items */}
            {Object.entries(parsed.stats)
              .filter(([key]) => !["agents", "knowledge", "feedbacks", "tasks"].includes(key))
              .filter(([, count]) => count > 0).length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, marginBottom: 8 }}>
                  未対応（スキップ）:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(parsed.stats)
                    .filter(([key]) => !["agents", "knowledge", "feedbacks", "tasks"].includes(key))
                    .filter(([, count]) => count > 0)
                    .map(([key, count]) => {
                      const meta = CATEGORY_LABELS[key] || { label: key, icon: "📎" };
                      return (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: `${T.warning}08`,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{meta.icon}</span>
                          <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>{meta.label}</span>
                          <span style={{ fontSize: 12, color: T.warning }}>{count} 件</span>
                          <span style={{ fontSize: 10, color: T.textMuted }}>スキップ</span>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </div>

          <div
            style={{
              padding: 10,
              borderRadius: 6,
              background: `${T.warning}11`,
              border: `1px solid ${T.warning}33`,
              fontSize: 11,
              color: T.warning,
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            ⚠️ 既存データに追加されます（上書きではありません）。エージェントルールのみ同一IDは上書き。
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={reset} style={{ fontSize: 12 }}>
              キャンセル
            </Btn>
            <Btn
              onClick={handleImport}
              disabled={["agents", "knowledge", "feedbacks", "tasks"].every((k) => !parsed.stats[k])}
              style={{ fontSize: 12 }}
            >
              インポート実行
            </Btn>
          </div>
        </div>
      )}

      {/* Importing: Progress */}
      {step === "importing" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 16 }}>⚙️</span>
            <span style={{ fontSize: 13, color: T.textDim }}>インポート中...</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {["agents", "knowledge", "feedbacks", "tasks"].map((key) => {
              const p = progress[key];
              const meta = CATEGORY_LABELS[key];
              if (!parsed?.stats[key]) return null;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: T.bg,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{meta.icon}</span>
                  <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{meta.label}</span>
                  {!p && <span style={{ fontSize: 11, color: T.textMuted }}>待機中</span>}
                  {p?.status === "importing" && (
                    <span style={{ fontSize: 11, color: T.accent }}>処理中...</span>
                  )}
                  {p?.status === "done" && (
                    <span style={{ fontSize: 11, color: T.success }}>✓ {p.count}件</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Done: Results */}
      {step === "done" && importResult && (
        <div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: importResult.errors.length === 0 ? `${T.success}15` : `${T.warning}15`,
              border: `1px solid ${importResult.errors.length === 0 ? T.success : T.warning}33`,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              {importResult.errors.length === 0 ? "✅ インポート完了" : "⚠️ 一部エラーあり"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(importResult.results)
                .filter(([key]) => key !== "_skipped")
                .map(([key, count]) => {
                  const meta = CATEGORY_LABELS[key] || { label: key, icon: "📎" };
                  return (
                    <div key={key} style={{ fontSize: 12, color: T.textDim }}>
                      {meta.icon} {meta.label}: <span style={{ color: T.success, fontWeight: 600 }}>{count}件</span> インポート
                    </div>
                  );
                })}

              {importResult.results._skipped?.length > 0 && (
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                  スキップ: {importResult.results._skipped.map((s) => {
                    const meta = CATEGORY_LABELS[s.key] || { label: s.key, icon: "📎" };
                    return `${meta.label}(${s.count}件)`;
                  }).join(", ")}
                </div>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: T.error, lineHeight: 1.6 }}>
                {importResult.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>

          <Btn variant="secondary" onClick={reset} style={{ fontSize: 12 }}>
            閉じる
          </Btn>
        </div>
      )}
    </Card>
  );
}

// ── Main Settings View ──
export default function TeamSettingsView({ agents, agentRules, knowledge, feedbacks, onSaveRules, onToast, onImportComplete }) {
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

      {/* Data Import */}
      <DataImportPanel onToast={onToast} onImportComplete={onImportComplete} />

      {/* Feedback history */}
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

import { useState } from "react";
import { T, MSG_TARGETS } from "../../lib/constants";
import { useApp } from "../../contexts/AppContext";
import Card from "../ui/Card";
import Btn from "../ui/Btn";

export default function MessageComposerView() {
  const { msgStyles, saveMsgStyles, gasUrl, setToast } = useApp();

  const [target, setTarget] = useState("writer");
  const [draft, setDraft] = useState("");
  const [incomingMsg, setIncomingMsg] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [showFb, setShowFb] = useState(false);
  const [actualMsg, setActualMsg] = useState("");
  const [savingFb, setSavingFb] = useState(false);
  const [cwSheet, setCwSheet] = useState("");

  const styles = msgStyles || {};
  const tgt = MSG_TARGETS.find((t) => t.id === target);
  const learnedCount = (styles[target] || []).length;

  const getStyleExamples = (tid) => (styles[tid] || []).slice(0, 5);

  const cwAction = (action) => {
    if (!gasUrl) { setToast("⚠️ GAS URLが設定されていません（設定で設定）"); return; }
    if (!cwSheet && action !== "list") { setToast("⚠️ シート名を入力してください"); return; }
    const url = gasUrl + "?action=" + action + (cwSheet ? "&sheet=" + encodeURIComponent(cwSheet) : "");
    window.open(url, "_blank");
    if (action === "send") setToast("📨 送信を実行中…");
    if (action === "preview") setToast("🔍 プレビューを表示中…");
    if (action === "reset") setToast("🔄 リセットを実行中…");
  };

  const generate = async () => {
    if (!draft.trim()) return;
    setLoading(true); setResult(""); setShowFb(false); setActualMsg("");
    const examples = getStyleExamples(target);
    let exStr = "";
    if (examples.length > 0) {
      exStr = "\n\n## 過去の送信例（この人の文体を参考にすること）\n" +
        examples.map((ex, i) => `### 例${i + 1}\nラフ: ${ex.draft}\n実際の送信文:\n${ex.actual}`).join("\n\n");
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content:
              "以下のラフな内容を、ビジネスメッセージとして整えてください。\n\n" +
              `## 送信先\n${tgt.label}\n\n## トーン\n${tgt.tone}\n\n` +
              (incomingMsg.trim() ? `## 相手からのメッセージ\n${incomingMsg.trim()}\n\n` : "") +
              (context.trim() ? `## 背景・補足\n${context.trim()}\n\n` : "") +
              `## ラフ内容（これを元に返信を作成）\n${draft.trim()}${exStr}` +
              "\n\n## ルール\n- メッセージ本文のみ出力。説明や前置きは不要\n- 自然な改行を入れて読みやすく\n- 挨拶は最小限（「お疲れ様です」等1行で十分）\n- 署名は不要" +
              (incomingMsg.trim() ? "\n- 相手のメッセージの内容・質問に的確に応答すること" : "") +
              (examples.length > 0 ? "\n- 過去の送信例の文体・言い回し・距離感を重視して合わせる" : "")
          }]
        })
      });
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text) setResult(text);
      else setToast("❌ 生成失敗");
    } catch {
      setToast("❌ エラー");
    }
    setLoading(false);
  };

  const saveFeedback = async () => {
    if (!actualMsg.trim()) return;
    setSavingFb(true);
    const updated = { ...styles };
    let arr = (updated[target] || []).slice();
    arr.unshift({ draft: draft.trim().slice(0, 200), actual: actualMsg.trim().slice(0, 1000), date: new Date().toISOString() });
    if (arr.length > 10) arr = arr.slice(0, 10);
    updated[target] = arr;
    await saveMsgStyles(updated);
    setShowFb(false); setActualMsg("");
    setToast(`✅ 文体を学習しました（${tgt.label}）`);
    setSavingFb(false);
  };

  const copyResult = () => {
    navigator.clipboard.writeText(result);
    setToast("📋 コピーしました");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>✉️ メッセージ作成</div>

      {/* GAS Chatwork sender */}
      {gasUrl && (
        <Card style={{ border: "2px solid #F59E0B44", background: "#F59E0B06" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>📨</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>経理案内メッセージ送信</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: T.textMuted, flexShrink: 0 }}>📄 シート名:</span>
            <input value={cwSheet} onChange={(e) => setCwSheet(e.target.value)} placeholder="例: 2026/1"
              style={{ flex: 1, minWidth: 120, padding: "6px 10px", background: T.bg, border: `1px solid ${cwSheet ? "#F59E0B44" : T.border}`, borderRadius: T.radiusXs, color: T.text, fontSize: 12, outline: "none", fontFamily: T.font }} />
          </div>
          {cwSheet && <div style={{ fontSize: 10, color: "#F59E0B", marginBottom: 6 }}>📄 対象: 「{cwSheet}」シート</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Btn onClick={() => cwAction("preview")} disabled={!cwSheet} style={{ fontSize: 11 }}>🔍 プレビュー</Btn>
            <Btn onClick={() => cwAction("send")} disabled={!cwSheet} style={{ fontSize: 11, background: "#F59E0B", borderColor: "#F59E0B" }}>🚀 一括送信</Btn>
            <Btn variant="ghost" onClick={() => cwAction("reset")} disabled={!cwSheet} style={{ fontSize: 11 }}>🔄 リセット</Btn>
          </div>
        </Card>
      )}

      {/* Target select */}
      <div style={{ display: "flex", gap: 8 }}>
        {MSG_TARGETS.map((t) => {
          const sel = target === t.id;
          const cnt = (styles[t.id] || []).length;
          return (
            <button key={t.id} onClick={() => setTarget(t.id)} style={{
              flex: 1, padding: "12px 8px", borderRadius: T.radiusSm,
              border: `2px solid ${sel ? t.color : T.border}`,
              background: sel ? t.color + "12" : "transparent",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontFamily: T.font
            }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: sel ? t.color : T.textMuted }}>{t.label}</span>
              {cnt > 0 && <span style={{ fontSize: 8, color: t.color, opacity: 0.7 }}>学習{cnt}件</span>}
            </button>
          );
        })}
      </div>

      {/* Draft input */}
      <div style={{ borderRadius: T.radius, border: `1px solid ${tgt.color}33`, background: T.bgCard, padding: 14 }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 4 }}>📩 相手からのメッセージ <span style={{ fontWeight: 400, fontSize: 10 }}>（任意）</span></div>
          <textarea value={incomingMsg} onChange={(e) => setIncomingMsg(e.target.value)} placeholder="相手から来たメッセージを貼り付け..." rows={3}
            style={{ width: "100%", padding: "8px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 12, lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: T.font, boxSizing: "border-box" }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>💬 ラフ・伝えたいこと</div>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="例: 来週月曜までにLP修正お願い" rows={4}
          style={{ width: "100%", padding: "8px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 13, lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: T.font, boxSizing: "border-box" }} />
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setContext(context ? "" : "_")} style={{ fontSize: 10, color: T.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: T.font, padding: 0 }}>
            {context ? "▼ 背景・補足" : "▶ 背景・補足"}
          </button>
          {context !== "" && (
            <textarea value={context === "_" ? "" : context} onChange={(e) => setContext(e.target.value)} placeholder="経緯、関係性、注意点..." rows={2}
              style={{ width: "100%", marginTop: 4, padding: "6px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 11, lineHeight: 1.5, resize: "vertical", outline: "none", fontFamily: T.font, boxSizing: "border-box" }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={generate} disabled={!draft.trim() || loading} style={{ fontSize: 13 }}>
            {loading ? "⏳..." : "✉️ 作成"}
          </Btn>
          {learnedCount > 0 && <span style={{ fontSize: 9, color: tgt.color }}>📚 {learnedCount}件の文体を学習済み</span>}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={{ borderRadius: T.radius, border: `1px solid ${tgt.color}44`, background: tgt.color + "06", padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: tgt.color }}>{tgt.icon} {tgt.label}向け</span>
            <button onClick={copyResult} style={{ padding: "3px 10px", borderRadius: T.radiusXs, border: `1px solid ${tgt.color}44`, background: tgt.color + "15", color: tgt.color, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>📋 コピー</button>
          </div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.8, whiteSpace: "pre-wrap", padding: "10px 12px", background: T.bgCard, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, maxHeight: 400, overflowY: "auto" }}>{result}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Btn variant="ghost" onClick={generate} disabled={loading} style={{ fontSize: 10 }}>🔄 再生成</Btn>
            <Btn variant="ghost" onClick={() => setShowFb(!showFb)} style={{ fontSize: 10, color: T.accent }}>{showFb ? "▼ 閉じる" : "📝 実際に送った文章で学習"}</Btn>
          </div>

          {showFb && (
            <div style={{ marginTop: 8, padding: "10px 12px", background: T.accent + "08", borderRadius: T.radiusSm, border: `1px solid ${T.accent}22` }}>
              <div style={{ fontSize: 11, color: T.accent, fontWeight: 600, marginBottom: 6 }}>📝 実際に送った文章を貼り付け</div>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 6 }}>AI生成をそのまま使った場合も、修正した場合も貼り付けてください。次回から文体を寄せます。</div>
              <textarea value={actualMsg} onChange={(e) => setActualMsg(e.target.value)} placeholder="実際に送ったメッセージを貼り付け..." rows={4}
                style={{ width: "100%", padding: "8px 10px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.text, fontSize: 11, lineHeight: 1.6, resize: "vertical", outline: "none", fontFamily: T.font, boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <Btn onClick={saveFeedback} disabled={!actualMsg.trim() || savingFb} style={{ fontSize: 10 }}>💾 学習させる</Btn>
                <span style={{ fontSize: 9, color: T.textDim, alignSelf: "center" }}>→ {tgt.label}向けの文体として記憶</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

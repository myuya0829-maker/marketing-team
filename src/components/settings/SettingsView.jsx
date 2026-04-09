import { useState, useRef, useCallback } from "react";
import { T } from "../../lib/constants";
import { parseExportFile, importToSupabase, CATEGORY_LABELS } from "../../lib/migration";
import { useApp } from "../../contexts/AppContext";
import Card from "../ui/Card";
import Btn from "../ui/Btn";

// ── Data Import Panel ──
function DataImportPanel({ onImportComplete }) {
  const { setToast } = useApp();
  const [step, setStep] = useState("idle");
  const [parsed, setParsed] = useState(null);
  const [progress, setProgress] = useState({});
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
      if (result.error) { setErrorMsg(result.error); setStep("error"); return; }
      setParsed(result); setStep("preview");
    } catch (err) { setErrorMsg("ファイルの読み込みに失敗しました: " + err.message); setStep("error"); }
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    setStep("importing"); setProgress({});
    const result = await importToSupabase(parsed.data, (category, status, count) => {
      setProgress((prev) => ({ ...prev, [category]: { status, count } }));
    });
    setImportResult(result); setStep("done");
    if (result.errors.length === 0) setToast("✅ データインポート完了！");
    else setToast("⚠️ 一部エラーがありました");
    if (onImportComplete) onImportComplete();
  }, [parsed, setToast, onImportComplete]);

  const reset = () => { setStep("idle"); setParsed(null); setProgress({}); setImportResult(null); setErrorMsg(""); };

  return (
    <Card style={{ border: `1px solid ${T.cyan}33`, background: `${T.cyan}05` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>📦</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>データインポート</span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `${T.cyan}22`, color: T.cyan, marginLeft: "auto" }}>旧アプリ → Supabase</span>
      </div>

      {step === "idle" && (
        <div>
          <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7, marginBottom: 16 }}>
            旧アプリからエクスポートしたJSONファイルを選択してください。
          </div>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFile} />
          <Btn onClick={() => fileRef.current?.click()} style={{ fontSize: 13 }}>📄 JSONファイルを選択</Btn>
        </div>
      )}

      {step === "error" && (
        <div>
          <div style={{ padding: 12, borderRadius: 8, background: `${T.error}15`, border: `1px solid ${T.error}33`, fontSize: 13, color: T.error, marginBottom: 12 }}>{errorMsg}</div>
          <Btn variant="secondary" onClick={reset} style={{ fontSize: 12 }}>やり直す</Btn>
        </div>
      )}

      {step === "preview" && parsed && (
        <div>
          <div style={{ padding: 12, borderRadius: 8, background: T.bg, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 8 }}>
              バージョン: {parsed.version} ｜ エクスポート日時: {parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString("ja-JP") : "不明"}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>インポート可能:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {["tasks", "projects"].map((key) => {
                const count = parsed.stats[key] || 0;
                const meta = CATEGORY_LABELS[key];
                if (count === 0 || !meta) return null;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: `${T.success}10` }}>
                    <span style={{ fontSize: 14 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{meta.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>{count} 件</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ padding: 10, borderRadius: 6, background: `${T.warning}11`, border: `1px solid ${T.warning}33`, fontSize: 11, color: T.warning, lineHeight: 1.6, marginBottom: 16 }}>
            ⚠️ 既存データに追加されます（上書きではありません）。
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={reset} style={{ fontSize: 12 }}>キャンセル</Btn>
            <Btn onClick={handleImport} style={{ fontSize: 12 }}>インポート実行</Btn>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 16 }}>⚙️</span>
            <span style={{ fontSize: 13, color: T.textDim }}>インポート中...</span>
          </div>
        </div>
      )}

      {step === "done" && importResult && (
        <div>
          <div style={{ padding: 12, borderRadius: 8, background: importResult.errors.length === 0 ? `${T.success}15` : `${T.warning}15`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              {importResult.errors.length === 0 ? "✅ インポート完了" : "⚠️ 一部エラーあり"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(importResult.results).filter(([key]) => key !== "_skipped").map(([key, count]) => {
                const meta = CATEGORY_LABELS[key] || { label: key, icon: "📎" };
                return <div key={key} style={{ fontSize: 12, color: T.textDim }}>{meta.icon} {meta.label}: <span style={{ color: T.success, fontWeight: 600 }}>{count}件</span></div>;
              })}
            </div>
          </div>
          <Btn variant="secondary" onClick={reset} style={{ fontSize: 12 }}>閉じる</Btn>
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SETTINGS VIEW
// ══════════════════════════════════════════════════════
export default function SettingsView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>⚙️ 設定</div>
      </div>
      <DataImportPanel onImportComplete={() => window.location.reload()} />
    </div>
  );
}

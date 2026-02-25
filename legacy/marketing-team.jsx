import { useState, useEffect, useRef, useCallback } from "react";

var T = {
  bg: "#0A0E1A", bgCard: "#111827", bgHover: "#1A2236", bgInput: "#0D1220",
  border: "#1E293B", borderFocus: "#3B82F6", borderSubtle: "#162032",
  text: "#F1F5F9", textDim: "#94A3B8", textMuted: "#64748B",
  accent: "#3B82F6", success: "#10B981", warning: "#F59E0B", error: "#EF4444",
  purple: "#A78BFA", cyan: "#22D3EE", green: "#4ADE80",
  glass: "rgba(17,24,39,0.85)", overlay: "rgba(0,0,0,0.6)",
  font: "'Noto Sans JP', -apple-system, sans-serif",
  radius: "12px", radiusSm: "8px", radiusXs: "6px",
  shadow: "0 4px 24px rgba(0,0,0,0.3)",
};

// Storage keys
var SK = {
  agents: "mkt-team:agents-v3",
  knowledge: "mkt-team:knowledge-v4",
  feedbacks: "mkt-team:fb-v1",
  tasks: "mkt-team:tasks-v1",
  history: "mkt-team:history-v1",
};
// All possible old keys to migrate from (in priority order)
var OLD_KNOWLEDGE_KEYS = ["mkt-team:knowledge-v3", "ai-emp:knowledge-v1"];
var OLD_FEEDBACK_KEYS = ["mkt-team:feedbacks-v1", "ai-emp:feedbacks-v2"];

var KCATS = [
  { id: "rule", label: "社内ルール", icon: "📏", color: "#F87171" },
  { id: "term", label: "用語・定義", icon: "📖", color: "#FBBF24" },
  { id: "industry", label: "業界知識", icon: "🏢", color: "#60A5FA" },
  { id: "style", label: "文章スタイル", icon: "✍️", color: "#A78BFA" },
  { id: "medical", label: "医療・薬機法", icon: "⚕️", color: "#EF4444" },
  { id: "seo", label: "SEO・LLMO", icon: "🔍", color: "#10B981" },
  { id: "other", label: "その他", icon: "💡", color: "#34D399" },
];
function getCat(id) { for (var i = 0; i < KCATS.length; i++) if (KCATS[i].id === id) return KCATS[i]; return KCATS[6]; }

var AGENTS = [
  { id: "pm", name: "PM", fullName: "プロジェクトマネージャー", icon: "👔", color: "#6366F1", role: "全体統括・タスク分析・アサイン・最終成果物の統合", defaultRules: "## PMの役割\n- タスクを分析し最適なチームメンバーをアサイン\n- 各メンバーへの具体的な指示を作成\n- 全アウトプットを統合して最終成果物を作成\n- 不要なメンバーにはアサインしない\n\n## アサイン判断\n- SEO関連→SEOマーケター\n- HP/LP→HP制作マーケター\n- LINE→LINEマーケター\n- 美容業界→美容マーケター\n- 医療系→医療広告GLチェッカー\n- 事実確認→ファクトチェッカー\n- 品質→ディレクター" },
  { id: "director", name: "ディレクター", fullName: "クオリティディレクター", icon: "🎯", color: "#EC4899", role: "品質チェック・整合性確認・改善提案", defaultRules: "## 役割\n- 各メンバーのアウトプットを横断レビュー\n- 正確性・実用性・整合性・独自性・読みやすさ\n- 具体的な改善提案\n- メンバー間の矛盾を指摘" },
  { id: "seo", name: "SEOマーケター", fullName: "SEOスペシャリスト", icon: "🔍", color: "#10B981", role: "SEO戦略・KW分析・記事構成・競合分析", defaultRules: "## 専門領域\n- KW調査・分析\n- 記事構成設計（LLMO対策）\n- 競合分析\n- E-E-A-T\n- LLMO構造" },
  { id: "hp", name: "HP制作マーケター", fullName: "Web制作スペシャリスト", icon: "🖥️", color: "#3B82F6", role: "HP/LP制作・UI/UX改善・CVR最適化", defaultRules: "## 専門領域\n- LP/HP構成設計\n- UI/UX改善\n- CVR最適化\n- CTA設計\n- モバイル最適化" },
  { id: "line", name: "LINEマーケター", fullName: "LINEスペシャリスト", icon: "💬", color: "#06D001", role: "LINE戦略・配信企画・シナリオ設計", defaultRules: "## 専門領域\n- LINE公式アカウント運用\n- 配信企画・文面作成\n- ステップ配信シナリオ\n- リッチメニュー\n- Lステップ/エルメ" },
  { id: "beauty", name: "美容マーケター", fullName: "美容業界スペシャリスト", icon: "💄", color: "#F472B6", role: "美容業界トレンド・施策提案", defaultRules: "## 専門領域\n- トレンド分析\n- ペルソナ設計\n- 集客施策\n- 競合差別化\n- 価格戦略" },
  { id: "medical", name: "医療広告GLチェッカー", fullName: "医療広告GLチェッカー", icon: "⚕️", color: "#EF4444", role: "薬機法・医療広告GL遵守チェック", defaultRules: "## チェック項目\n- 薬機法: 効果表現→期待表現\n- 安全表現→リスク併記\n- 自由診療: 費用・リスク明記\n- 体験談の効果保証禁止\n- 不当比較禁止" },
  { id: "factcheck", name: "ファクトチェッカー", fullName: "ファクトチェッカー", icon: "✅", color: "#F59E0B", role: "事実検証・データ正確性確認", defaultRules: "## 信頼性ランク\n- A: 政府機関\n- B: 学会\n- C: 企業公式\n- D: 大手メディア\n- E: 個人ブログ（不適切）" },
];

var PHASES = [
  { id: "idle", label: "待機中", icon: "⏸" }, { id: "planning", label: "PM分析中", icon: "🧠" },
  { id: "user_review", label: "承認待ち", icon: "👤" }, { id: "executing", label: "実行中", icon: "⚡" },
  { id: "reviewing", label: "レビュー中", icon: "🔍" }, { id: "discussing", label: "議論中", icon: "💬" },
  { id: "finalizing", label: "最終確認", icon: "✨" }, { id: "complete", label: "完了", icon: "✅" },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
async function storeGet(k) { try { var r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch(e) { return null; } }
async function storeSet(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch(e) { console.error(e); } }

// Migration: try new key, then try each old key in order
// IMPORTANT: if new key has empty array, still check old keys for real data
async function migrateGet(newKey, oldKeys, transform) {
  var data = await storeGet(newKey);
  // Only trust new key if it actually has items
  if (data && Array.isArray(data) && data.length > 0) return data;
  // If new key is empty or null, check old keys
  if (oldKeys) {
    for (var i = 0; i < oldKeys.length; i++) {
      var old = await storeGet(oldKeys[i]);
      if (old && Array.isArray(old) && old.length > 0) {
        var migrated = transform ? transform(old) : old;
        await storeSet(newKey, migrated);
        return migrated;
      }
    }
  }
  return data; // return whatever new key had (could be empty array or null)
}

function parseJSON(t) {
  try { return JSON.parse(t.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim()); }
  catch(e) { var m = t.match(/\{[\s\S]*\}/); if(m) try { return JSON.parse(m[0]); } catch(e2){} return null; }
}

async function callAPI(sys, msgs, maxTok, useSearch) {
  try {
    var body = { model: "claude-opus-4-6", max_tokens: maxTok || 4000, system: sys, messages: msgs };
    if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    var res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = await res.json();
    if (data.error) return "APIエラー: " + (data.error.message || JSON.stringify(data.error));
    if (data.content) return data.content.map(function(b) { return b.text || ""; }).filter(Boolean).join("\n");
    return "応答なし";
  } catch(e) { return "エラー: " + e.message; }
}

function buildAgentSys(agent, agentRules, knowledge) {
  var rules = agentRules[agent.id] || agent.defaultRules;
  var s = "あなたは「" + agent.fullName + "」です。\n\n## 役割\n" + agent.role + "\n\n## ルール\n" + rules;
  if (knowledge && knowledge.length > 0) {
    var myKn = knowledge.filter(function(k) {
      if (!k.assignedAgents || k.assignedAgents.length === 0) return true;
      return k.assignedAgents.indexOf("all") >= 0 || k.assignedAgents.indexOf(agent.id) >= 0;
    });
    if (myKn.length > 0) {
      s += "\n\n## 学習済みナレッジ（必ず遵守）\n";
      for (var i = 0; i < myKn.length; i++) s += "\n### " + myKn[i].title + "\n" + myKn[i].content + "\n";
    }
  }
  return s;
}

function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + "…" : s || ""; }
function fmtDate(d) { var dt = new Date(d); return (dt.getMonth()+1) + "/" + dt.getDate() + " " + dt.getHours() + ":" + String(dt.getMinutes()).padStart(2,"0"); }
function makeStars(r) { var s=""; for(var i=0;i<r;i++) s+="★"; for(var j=0;j<5-r;j++) s+="☆"; return s; }
function todayKey() { var d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function dateLabel(key) { var p=key.split("-"); return p[1].replace(/^0/,"")+"/"+p[2].replace(/^0/,"")+"（"+["日","月","火","水","木","金","土"][new Date(key).getDay()]+"）"; }

// Format seconds to HH:MM:SS
function fmtSec(totalSec) {
  if (totalSec < 0) totalSec = 0;
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  if (h > 0) return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════════════════════════
function Toast({ msg, onClose }) {
  useEffect(function() { var t=setTimeout(onClose,2500); return function(){clearTimeout(t);}; }, []);
  return <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:T.bgCard,border:"1px solid "+T.border,borderRadius:T.radius,padding:"12px 24px",color:T.text,fontSize:14,zIndex:9999,boxShadow:T.shadow,animation:"fadeIn 0.3s ease" }}>{msg}</div>;
}
function AgentAvatar({ agent, size, active, showName }) {
  var s = size || 40;
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
    <div style={{width:s,height:s,borderRadius:"50%",background:active?agent.color+"22":T.bgCard,border:"2px solid "+(active?agent.color:T.border),display:"flex",alignItems:"center",justifyContent:"center",fontSize:s*0.5,transition:"all 0.2s",boxShadow:active?"0 0 16px "+agent.color+"44":"none"}}>{agent.icon}</div>
    {showName && <span style={{fontSize:10,color:active?agent.color:T.textMuted}}>{agent.name}</span>}
  </div>;
}
function Card({ children, style, onClick }) { return <div onClick={onClick} style={{background:T.bgCard,border:"1px solid "+T.border,borderRadius:T.radius,padding:20,...(style||{})}}>{children}</div>; }
function Btn({ children, onClick, variant, disabled, style }) {
  var v = variant||"primary";
  var s = {primary:{background:T.accent,color:"#fff",border:"none"},secondary:{background:"transparent",color:T.text,border:"1px solid "+T.border},danger:{background:T.error+"22",color:T.error,border:"1px solid "+T.error+"44"},ghost:{background:"transparent",color:T.textDim,border:"none"},success:{background:T.success,color:"#fff",border:"none"}}[v]||{};
  return <button onClick={onClick} disabled={disabled} style={{...s,padding:"8px 16px",borderRadius:T.radiusSm,fontSize:13,fontFamily:T.font,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all 0.2s",fontWeight:500,...(style||{})}}>{children}</button>;
}

// ═══════════════════════════════════════════════════════════════
// TASK MANAGEMENT (Stopwatch Style)
// ═══════════════════════════════════════════════════════════════
function TaskManagementView({ tasks, onSave }) {
  var [date, setDate] = useState(todayKey());
  var [adding, setAdding] = useState(false);
  var [newName, setNewName] = useState("");
  var [newEst, setNewEst] = useState(30);
  var [ticker, setTicker] = useState(0);

  // Tick every second for live stopwatch
  useEffect(function(){var t=setInterval(function(){setTicker(function(v){return v+1;});},1000);return function(){clearInterval(t);};}, []);

  var dayTasks = (tasks[date] || []);
  var completed = dayTasks.filter(function(t){return t.done;}).length;
  var total = dayTasks.length;
  var isToday = date === todayKey();
  var nowSec = Math.floor(Date.now()/1000);

  // Find currently running task
  var runningId = null;
  for (var i = 0; i < dayTasks.length; i++) {
    if (dayTasks[i].running && !dayTasks[i].done) { runningId = dayTasks[i].id; break; }
  }

  function addTask() {
    if (!newName.trim()) return;
    var task = { id: String(Date.now()), name: newName.trim(), estimateSec: newEst * 60, elapsedSec: 0, running: false, runStartedAt: null, done: false, createdAt: Date.now() };
    var updated = Object.assign({}, tasks);
    updated[date] = (updated[date] || []).concat([task]);
    onSave(updated);
    setNewName(""); setNewEst(30); setAdding(false);
  }

  function startStop(id) {
    var updated = Object.assign({}, tasks);
    updated[date] = (updated[date]||[]).map(function(t) {
      if (t.id === id) {
        if (t.running) {
          // Stop: accumulate elapsed
          var extra = t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
          return Object.assign({}, t, { running: false, elapsedSec: (t.elapsedSec||0) + extra, runStartedAt: null });
        } else {
          // Start: stop any other running task first handled below
          return Object.assign({}, t, { running: true, runStartedAt: Date.now() });
        }
      }
      // Stop other running tasks
      if (t.running && !t.done) {
        var extra2 = t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
        return Object.assign({}, t, { running: false, elapsedSec: (t.elapsedSec||0) + extra2, runStartedAt: null });
      }
      return t;
    });
    onSave(updated);
  }

  function markDone(id) {
    var updated = Object.assign({}, tasks);
    updated[date] = (updated[date]||[]).map(function(t) {
      if (t.id !== id) return t;
      if (!t.done) {
        var extra = t.running && t.runStartedAt ? Math.floor((Date.now() - t.runStartedAt) / 1000) : 0;
        return Object.assign({}, t, { done: true, running: false, elapsedSec: (t.elapsedSec||0) + extra, runStartedAt: null });
      } else {
        return Object.assign({}, t, { done: false });
      }
    });
    onSave(updated);
  }

  function deleteTask(id) {
    var updated = Object.assign({}, tasks);
    updated[date] = (updated[date]||[]).filter(function(t){return t.id!==id;});
    onSave(updated);
  }

  function resetTimer(id) {
    var updated = Object.assign({}, tasks);
    updated[date] = (updated[date]||[]).map(function(t) {
      return t.id === id ? Object.assign({}, t, { elapsedSec: 0, running: false, runStartedAt: null, done: false }) : t;
    });
    onSave(updated);
  }

  function getElapsed(task) {
    var base = task.elapsedSec || 0;
    if (task.running && task.runStartedAt) base += Math.floor((Date.now() - task.runStartedAt) / 1000);
    return base;
  }

  // Stats
  var totalEstimate = dayTasks.reduce(function(s,t){return s+t.estimateSec;},0);
  var totalElapsed = dayTasks.reduce(function(s,t){return s+getElapsed(t);},0);

  function prevDay() { var d=new Date(date); d.setDate(d.getDate()-1); setDate(d.toISOString().slice(0,10)); }
  function nextDay() { var d=new Date(date); d.setDate(d.getDate()+1); setDate(d.toISOString().slice(0,10)); }

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    {/* Header */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div style={{fontSize:18,fontWeight:700,color:T.text}}>⏱ タスク管理</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <Btn variant="ghost" onClick={prevDay} style={{fontSize:16,padding:"4px 8px"}}>←</Btn>
        <span style={{fontSize:14,fontWeight:600,color:T.text,minWidth:120,textAlign:"center"}}>{dateLabel(date)}</span>
        <Btn variant="ghost" onClick={nextDay} style={{fontSize:16,padding:"4px 8px"}}>→</Btn>
        {date!==todayKey() && <Btn variant="secondary" onClick={function(){setDate(todayKey());}} style={{fontSize:11}}>今日</Btn>}
      </div>
    </div>

    {/* Stats row */}
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
      <Card style={{padding:"10px 16px",flex:1,minWidth:90}}>
        <div style={{fontSize:10,color:T.textMuted}}>進捗</div>
        <div style={{fontSize:20,fontWeight:700,color:completed===total&&total>0?T.success:T.text}}>{completed}<span style={{fontSize:13,color:T.textDim}}>/{total}</span></div>
        {total>0 && <div style={{height:4,borderRadius:2,background:T.border,marginTop:4}}><div style={{height:4,borderRadius:2,background:T.success,width:(completed/total*100)+"%",transition:"width 0.3s"}} /></div>}
      </Card>
      <Card style={{padding:"10px 16px",flex:1,minWidth:90}}>
        <div style={{fontSize:10,color:T.textMuted}}>見積もり合計</div>
        <div style={{fontSize:20,fontWeight:700,color:T.text,fontVariantNumeric:"tabular-nums"}}>{fmtSec(totalEstimate)}</div>
      </Card>
      <Card style={{padding:"10px 16px",flex:1,minWidth:90}}>
        <div style={{fontSize:10,color:T.textMuted}}>実績合計</div>
        <div style={{fontSize:20,fontWeight:700,color:totalElapsed>totalEstimate&&totalEstimate>0?T.error:T.success,fontVariantNumeric:"tabular-nums"}}>{fmtSec(totalElapsed)}</div>
      </Card>
    </div>

    {/* Task List */}
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {dayTasks.map(function(task) {
        var elapsed = getElapsed(task);
        var pct = task.estimateSec > 0 ? Math.min(elapsed / task.estimateSec, 1) : 0;
        var over = elapsed > task.estimateSec && task.estimateSec > 0;
        var isRunning = task.running && !task.done;
        var barColor = task.done ? T.success : over ? T.error : isRunning ? T.accent : T.textMuted;

        return <Card key={task.id} style={{padding:0,overflow:"hidden",border:"1px solid "+(isRunning?T.accent+"55":T.border),background:isRunning?T.accent+"06":T.bgCard}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>
            {/* Done checkbox */}
            <button onClick={function(){markDone(task.id);}} style={{width:26,height:26,borderRadius:"50%",border:"2px solid "+(task.done?T.success:T.border),background:task.done?T.success+"22":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:T.success,flexShrink:0}}>
              {task.done ? "✓" : ""}
            </button>

            {/* Task info */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:task.done?T.textMuted:T.text,textDecoration:task.done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.name}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                <span style={{fontSize:11,color:T.textMuted}}>見積: {fmtSec(task.estimateSec)}</span>
              </div>
            </div>

            {/* Timer display */}
            <div style={{textAlign:"right",flexShrink:0,minWidth:80}}>
              <div style={{fontSize:22,fontWeight:700,fontVariantNumeric:"tabular-nums",fontFamily:"'SF Mono', 'Menlo', monospace, "+T.font,color:task.done?T.success:over?T.error:isRunning?T.accent:T.text,letterSpacing:1}}>
                {fmtSec(elapsed)}
              </div>
              {over && !task.done && <div style={{fontSize:10,color:T.error,marginTop:2}}>+{fmtSec(elapsed - task.estimateSec)} 超過</div>}
            </div>

            {/* Start/Stop button */}
            {!task.done ? <button onClick={function(){startStop(task.id);}} style={{width:44,height:44,borderRadius:"50%",border:"2px solid "+(isRunning?T.error:T.success),background:isRunning?T.error+"15":T.success+"15",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,transition:"all 0.2s"}}>
              {isRunning ? "⏸" : "▶"}
            </button> :
            <button onClick={function(){resetTimer(task.id);}} title="リセット" style={{width:44,height:44,borderRadius:"50%",border:"2px solid "+T.border,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,color:T.textMuted}}>↺</button>}

            {/* Delete */}
            <button onClick={function(){deleteTask(task.id);}} style={{background:"none",border:"none",color:T.textDim,cursor:"pointer",fontSize:12,opacity:0.4,flexShrink:0}}>🗑</button>
          </div>

          {/* Progress bar */}
          <div style={{height:3,background:T.border}}>
            <div style={{height:3,background:barColor,width:Math.min(pct*100,100)+"%",transition:"width 0.5s",opacity:0.7}} />
          </div>
        </Card>;
      })}
    </div>

    {/* Add task */}
    {adding ? <Card style={{border:"1px solid "+T.accent+"33"}}>
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180}}>
          <label style={{fontSize:11,color:T.textDim,display:"block",marginBottom:4}}>タスク名</label>
          <input value={newName} onChange={function(e){setNewName(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addTask();}}
            autoFocus placeholder="タスクを入力..."
            style={{width:"100%",padding:"8px 12px",background:T.bg,border:"1px solid "+T.border,borderRadius:T.radiusXs,color:T.text,fontSize:13,outline:"none",fontFamily:T.font,boxSizing:"border-box"}} />
        </div>
        <div style={{width:90}}>
          <label style={{fontSize:11,color:T.textDim,display:"block",marginBottom:4}}>見積もり(分)</label>
          <input type="number" value={newEst} onChange={function(e){setNewEst(parseInt(e.target.value)||0);}} min={1}
            style={{width:"100%",padding:"8px 6px",background:T.bg,border:"1px solid "+T.border,borderRadius:T.radiusXs,color:T.text,fontSize:13,outline:"none",fontFamily:T.font,boxSizing:"border-box"}} />
        </div>
        <Btn onClick={addTask} disabled={!newName.trim()}>追加</Btn>
        <Btn variant="ghost" onClick={function(){setAdding(false);setNewName("");}}>取消</Btn>
      </div>
    </Card> :
    <Btn variant="secondary" onClick={function(){setAdding(true);}} style={{alignSelf:"flex-start"}}>+ タスクを追加</Btn>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE / LEARNING VIEW
// ═══════════════════════════════════════════════════════════════
function KnowledgeView({ knowledge, onAdd, onDelete, agents }) {
  var [adding, setAdding] = useState(false);
  var [title, setTitle] = useState(""); var [content, setContent] = useState(""); var [cat, setCat] = useState("rule");
  var [assignedAgents, setAssignedAgents] = useState(["all"]);
  var [expanded, setExpanded] = useState(null); var [filterCat, setFilterCat] = useState("all");
  var fRef = useRef(null);

  function toggleAgent(aid) {
    if (aid==="all") { setAssignedAgents(["all"]); return; }
    var next = assignedAgents.filter(function(a){return a!=="all";});
    if (next.indexOf(aid)>=0) next=next.filter(function(a){return a!==aid;}); else next.push(aid);
    if (!next.length) next=["all"];
    setAssignedAgents(next);
  }

  function handleAdd() {
    if (!title.trim()||!content.trim()) return;
    onAdd({ id: String(Date.now()), title: title.trim(), content: content.trim(), category: cat, assignedAgents: assignedAgents, date: new Date().toISOString() });
    setTitle(""); setContent(""); setCat("rule"); setAssignedAgents(["all"]); setAdding(false);
  }

  var handleFile = useCallback(async function(e) {
    var f = e.target.files[0]; if(!f) return;
    try {
      var txt = await new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsText(f);});
      setTitle(f.name.replace(/\.[^/.]+$/,"")); setContent(txt.slice(0,10000)); setAdding(true);
    } catch(err) { alert("読取失敗"); }
    e.target.value = "";
  }, []);

  var filtered = filterCat==="all"?knowledge:knowledge.filter(function(k){return k.category===filterCat;});

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div style={{fontSize:18,fontWeight:700,color:T.text}}>📚 学習（ナレッジDB）</div>
      <div style={{display:"flex",gap:4}}>
        {!adding && <Btn onClick={function(){setAdding(true);}} style={{fontSize:12}}>+ 追加</Btn>}
        {!adding && <Btn variant="secondary" onClick={function(){fRef.current&&fRef.current.click();}} style={{fontSize:12}}>📄 読込</Btn>}
        <input ref={fRef} type="file" accept=".txt,.md,.csv,.json,.html" style={{display:"none"}} onChange={handleFile} />
      </div>
    </div>

    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      <button onClick={function(){setFilterCat("all");}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:filterCat==="all"?T.accent+"25":T.bgCard,color:filterCat==="all"?T.accent:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.font}}>すべて ({knowledge.length})</button>
      {KCATS.map(function(c){var cnt=knowledge.filter(function(k){return k.category===c.id;}).length; return cnt?<button key={c.id} onClick={function(){setFilterCat(c.id);}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:filterCat===c.id?c.color+"25":T.bgCard,color:filterCat===c.id?c.color:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.font}}>{c.icon+" "+c.label+" ("+cnt+")"}</button>:null;})}
    </div>

    {adding && <Card style={{border:"1px solid "+T.purple+"33",background:T.purple+"05"}}>
      <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:12}}>ナレッジを追加</div>
      <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>カテゴリ</div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {KCATS.map(function(c){return <button key={c.id} onClick={function(){setCat(c.id);}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:cat===c.id?c.color+"25":T.bg,color:cat===c.id?c.color:T.textDim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.font}}>{c.icon+" "+c.label}</button>;})}
      </div>
      <input value={title} onChange={function(e){setTitle(e.target.value);}} placeholder="タイトル" style={{width:"100%",padding:"8px 12px",background:T.bg,border:"1px solid "+T.border,borderRadius:T.radiusXs,color:T.text,fontSize:13,outline:"none",fontFamily:T.font,marginBottom:8,boxSizing:"border-box"}} />
      <textarea value={content} onChange={function(e){setContent(e.target.value);}} placeholder="内容を入力..." rows={4} style={{width:"100%",padding:"8px 12px",background:T.bg,border:"1px solid "+T.border,borderRadius:T.radiusXs,color:T.text,fontSize:12,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:T.font,marginBottom:12,boxSizing:"border-box"}} />
      <div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:8}}>🎓 誰が学ぶ？</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        <button onClick={function(){setAssignedAgents(["all"]);}} style={{padding:"6px 12px",borderRadius:20,border:"2px solid "+(assignedAgents.indexOf("all")>=0?T.accent:T.border),background:assignedAgents.indexOf("all")>=0?T.accent+"15":"transparent",color:assignedAgents.indexOf("all")>=0?T.accent:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.font}}>👥 全メンバー</button>
        {agents.map(function(a){var sel=assignedAgents.indexOf(a.id)>=0&&assignedAgents.indexOf("all")<0;return <button key={a.id} onClick={function(){toggleAgent(a.id);}} style={{padding:"6px 12px",borderRadius:20,border:"2px solid "+(sel?a.color:T.border),background:sel?a.color+"15":"transparent",color:sel?a.color:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.font,display:"flex",alignItems:"center",gap:4}}><span>{a.icon}</span>{a.name}</button>;})}
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn onClick={handleAdd} disabled={!title.trim()||!content.trim()}>保存</Btn>
        <Btn variant="ghost" onClick={function(){setAdding(false);}}>キャンセル</Btn>
      </div>
    </Card>}

    {filtered.length===0 ?
      <Card><div style={{textAlign:"center",color:T.textMuted,fontSize:13,padding:20}}>{knowledge.length===0?"ナレッジを追加するとチームの精度が上がります":"このカテゴリにはまだナレッジがありません"}</div></Card>
    : <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {filtered.map(function(item){
        var ci=getCat(item.category); var isExp=expanded===item.id;
        var assigned=item.assignedAgents||["all"]; var isAll=assigned.indexOf("all")>=0||!assigned.length;
        return <Card key={item.id} style={{padding:0,overflow:"hidden",cursor:"pointer"}} onClick={function(){setExpanded(isExp?null:item.id);}}>
          <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>{ci.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:T.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
              <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:ci.color}}>{ci.label}</span>
                <span style={{fontSize:10,color:T.textDim}}>·</span>
                {isAll?<span style={{fontSize:10,color:T.textDim}}>👥 全員</span>:assigned.map(function(aid){var ag=AGENTS.find(function(a){return a.id===aid;});return ag?<span key={aid} style={{fontSize:12}} title={ag.name}>{ag.icon}</span>:null;})}
              </div>
            </div>
            <span style={{fontSize:10,color:T.textDim,transform:isExp?"rotate(180deg)":"none",transition:"0.2s"}}>▼</span>
          </div>
          {isExp && <div onClick={function(e){e.stopPropagation();}} style={{padding:"0 16px 12px",borderTop:"1px solid "+T.border}}>
            <div style={{fontSize:12,color:T.textDim,lineHeight:1.7,whiteSpace:"pre-wrap",marginTop:10,maxHeight:200,overflowY:"auto"}}>{item.content}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
              <span style={{fontSize:10,color:T.textDim}}>{fmtDate(item.date)}</span>
              <Btn variant="danger" onClick={function(e){e.stopPropagation();onDelete(item.id);}} style={{fontSize:10,padding:"2px 8px"}}>削除</Btn>
            </div>
          </div>}
        </Card>;
      })}
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// WORKSPACE (AGENT TEAM + WEB SEARCH + FEEDBACK)
// ═══════════════════════════════════════════════════════════════
function WorkspaceView({ agents, agentRules, knowledge, feedbacks, onAddFeedback, onToast }) {
  var [phase, setPhase] = useState("idle");
  var [taskInput, setTaskInput] = useState("");
  var [currentTask, setCurrentTask] = useState("");
  var [plan, setPlan] = useState(null);
  var [agentStatuses, setAgentStatuses] = useState({});
  var [agentOutputs, setAgentOutputs] = useState({});
  var [discussion, setDiscussion] = useState(null);
  var [finalOutput, setFinalOutput] = useState(null);
  var [activeAgentId, setActiveAgentId] = useState(null);
  var [error, setError] = useState(null);
  var [webSearch, setWebSearch] = useState(false);
  var [fbRating, setFbRating] = useState(0);
  var [fbComment, setFbComment] = useState("");
  var [fbSent, setFbSent] = useState(false);
  var abortRef = useRef(false);

  function resetWorkflow() { setPhase("idle"); setPlan(null); setAgentStatuses({}); setAgentOutputs({}); setDiscussion(null); setFinalOutput(null); setActiveAgentId(null); setError(null); setFbRating(0); setFbComment(""); setFbSent(false); abortRef.current=false; }

  async function submitTask() {
    if (!taskInput.trim()||phase!=="idle") return;
    var task = taskInput.trim(); setTaskInput(""); setCurrentTask(task); setError(null); abortRef.current=false; setFbSent(false);
    setPhase("planning"); setAgentStatuses({pm:"working"}); setActiveAgentId("pm");
    var pmSys = buildAgentSys(agents[0], agentRules, knowledge);

    // Include recent feedbacks in PM context
    var fbContext = "";
    if (feedbacks && feedbacks.length > 0) {
      var recent = feedbacks.slice(0, 5);
      fbContext = "\n\n## 過去のフィードバック（改善に活かすこと）\n" + recent.map(function(f){return "- ["+makeStars(f.rating)+"] "+f.task+": "+f.comment;}).join("\n");
    }

    var planPrompt = "以下のタスクを分析しアサインプランを作成。\n\n## タスク\n"+task+(webSearch?"\n\n※ウェブ検索が利用可能です。リサーチが必要なメンバーには指示に含めてください。":"")+fbContext+"\n\n## メンバー\n"+agents.filter(function(a){return a.id!=="pm";}).map(function(a){return "- "+a.id+": "+a.name+"（"+a.role+"）";}).join("\n")+'\n\n## JSON形式で出力\n{"analysis":"分析","assignedAgents":["id1"],"plan":[{"agent":"id1","instruction":"指示"}]}';
    var pmResult = await callAPI(pmSys, [{role:"user",content:planPrompt}]);
    if (abortRef.current) return;
    var parsedPlan = parseJSON(pmResult);
    if (!parsedPlan||!parsedPlan.assignedAgents) { setError("PMプラン生成失敗\n\n"+pmResult); setPhase("idle"); setAgentStatuses({}); return; }
    setPlan(parsedPlan); setAgentStatuses({pm:"done"}); setPhase("user_review");
  }

  async function approveAndExecute() {
    if (!plan) return; setPhase("executing");
    var outputs = {};
    for (var i=0; i<plan.plan.length; i++) {
      if (abortRef.current) return;
      var a = plan.plan[i]; var agentDef = agents.find(function(ag){return ag.id===a.agent;});
      if (!agentDef) continue;
      setActiveAgentId(a.agent); setAgentStatuses(function(p){var n=Object.assign({},p);n[a.agent]="working";return n;});
      var result = await callAPI(buildAgentSys(agentDef,agentRules,knowledge), [{role:"user",content:"## タスク\n"+currentTask+"\n\n## 指示\n"+a.instruction+"\n\n具体的なアウトプットをマークダウンで出力。"}], 4000, webSearch);
      if (abortRef.current) return;
      outputs[a.agent] = result;
      setAgentOutputs(function(p){var n=Object.assign({},p);n[a.agent]=result;return n;});
      setAgentStatuses(function(p){var n=Object.assign({},p);n[a.agent]="done";return n;});
    }
    setPhase("reviewing"); setActiveAgentId("director"); setAgentStatuses(function(p){var n=Object.assign({},p);n.director="working";return n;});
    var dirDef = agents.find(function(a){return a.id==="director";});
    var outSum = Object.entries(outputs).map(function(e){var ag=agents.find(function(a){return a.id===e[0];});return "### "+(ag?ag.icon+" "+ag.name:e[0])+"\n"+e[1];}).join("\n\n---\n\n");
    var dirResult = await callAPI(buildAgentSys(dirDef,agentRules,knowledge), [{role:"user",content:"## タスク\n"+currentTask+"\n\n## アウトプット\n"+outSum+"\n\n品質レビューしてください。"}]);
    if (abortRef.current) return;
    setAgentStatuses(function(p){var n=Object.assign({},p);n.director="done";return n;});
    setPhase("discussing"); setActiveAgentId("pm");
    var discResult = await callAPI(buildAgentSys(agents[0],agentRules,knowledge), [{role:"user",content:"## タスク\n"+currentTask+"\n\n## アウトプット\n"+outSum+"\n\n## レビュー\n"+dirResult+"\n\n議論サマリーを簡潔に。"}]);
    if (abortRef.current) return; setDiscussion(discResult);
    setPhase("finalizing");
    var finalResult = await callAPI(buildAgentSys(agents[0],agentRules,knowledge), [{role:"user",content:"## タスク\n"+currentTask+"\n\n## アウトプット\n"+outSum+"\n\n## レビュー\n"+dirResult+"\n\n## 議論\n"+discResult+"\n\n統合して最終成果物を作成。マークダウンで。"}], 4000);
    if (abortRef.current) return;
    setFinalOutput(finalResult); setPhase("complete"); onToast("✅ タスク完了！");
  }

  function submitFeedback() {
    if (fbRating === 0) return;
    onAddFeedback({ id: String(Date.now()), task: truncate(currentTask, 60), rating: fbRating, comment: fbComment, date: new Date().toISOString() });
    setFbSent(true); onToast("📝 FB保存！次回から反映されます");
  }

  var isWorking = phase!=="idle"&&phase!=="complete"&&phase!=="user_review";

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div style={{display:"flex",gap:12,justifyContent:"center",padding:"8px 0",flexWrap:"wrap"}}>
      {agents.map(function(a){return <AgentAvatar key={a.id} agent={a} size={36} showName active={agentStatuses[a.id]==="working"||activeAgentId===a.id} />;})}
    </div>
    {(phase==="idle"||phase==="complete") && <Card style={{background:T.bgInput}}>
      <textarea value={taskInput} onChange={function(e){setTaskInput(e.target.value);}} onKeyDown={function(e){if((e.metaKey||e.ctrlKey)&&e.key==="Enter")submitTask();}}
        placeholder={"チームに依頼するタスクを入力...\n\n例:「美容クリニックのSEO記事を企画して」"} rows={4}
        style={{width:"100%",background:"transparent",color:T.text,border:"none",fontSize:14,fontFamily:T.font,lineHeight:1.7,resize:"none",outline:"none",boxSizing:"border-box"}} />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={function(){setWebSearch(!webSearch);}} style={{width:40,height:22,borderRadius:11,border:"none",background:webSearch?T.cyan:T.border,cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
            <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:webSearch?21:3,transition:"left 0.2s"}} />
          </button>
          <span style={{fontSize:12,color:webSearch?T.cyan:T.textMuted,fontWeight:500}}>{"🌐 ウェブ検索"+(webSearch?" ON":" OFF")}</span>
        </div>
        <Btn onClick={submitTask} disabled={!taskInput.trim()}>チームに依頼する 🚀</Btn>
      </div>
    </Card>}
    {currentTask&&phase!=="idle" && <Card style={{padding:"12px 16px"}}><div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:12,fontWeight:600,color:T.textDim}}>依頼:</span>
      <span style={{fontSize:13,color:T.text,flex:1}}>{truncate(currentTask,120)}</span>
      {isWorking&&<Btn variant="danger" onClick={function(){abortRef.current=true;resetWorkflow();onToast("⏹ 中断");}} style={{fontSize:11,padding:"4px 10px"}}>中断</Btn>}
      {phase==="complete"&&<Btn variant="ghost" onClick={resetWorkflow} style={{fontSize:11}}>新規</Btn>}
    </div></Card>}
    {phase!=="idle" && <PhaseProgress currentPhase={phase} />}
    {isWorking && <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:12}}>
      <span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:16}}>⚙️</span>
      <span style={{fontSize:13,color:T.textDim}}>{activeAgentId&&(function(){var ag=agents.find(function(a){return a.id===activeAgentId;});return ag?ag.icon+" "+ag.name+" が作業中...":"処理中...";})()}</span>
    </div>}
    {error && <Card style={{border:"1px solid "+T.error+"44",background:T.error+"08"}}><div style={{fontSize:13,color:T.error,whiteSpace:"pre-wrap"}}>{error}</div></Card>}
    {phase==="user_review"&&plan && <Card style={{border:"1px solid "+T.accent+"44",background:T.accent+"08"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><span style={{fontSize:18}}>📋</span><span style={{fontSize:15,fontWeight:600,color:T.text}}>PMからの実行プラン</span><span style={{fontSize:10,padding:"2px 8px",borderRadius:99,background:T.warning+"22",color:T.warning,marginLeft:"auto"}}>承認待ち</span></div>
      {plan.analysis && <div style={{fontSize:13,color:T.textDim,marginBottom:16,lineHeight:1.7,padding:"12px 16px",background:T.bg,borderRadius:T.radiusSm}}>{plan.analysis}</div>}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {(plan.assignedAgents||[]).map(function(aid){var ag=agents.find(function(a){return a.id===aid;});return ag?<div key={aid} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:99,background:ag.color+"15",border:"1px solid "+ag.color+"33"}}><span style={{fontSize:14}}>{ag.icon}</span><span style={{fontSize:12,color:ag.color}}>{ag.name}</span></div>:null;})}
      </div>
      {plan.plan&&plan.plan.map(function(p,i){var ag=agents.find(function(a){return a.id===p.agent;});return <div key={i} style={{padding:"10px 14px",background:T.bg,borderRadius:T.radiusSm,borderLeft:"3px solid "+(ag?ag.color:T.border),marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:600,color:ag?ag.color:T.text}}>{ag?ag.icon+" "+ag.name:p.agent}</span>
        <div style={{fontSize:12,color:T.textDim,marginTop:4,lineHeight:1.6}}>{p.instruction}</div>
      </div>;})}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn variant="secondary" onClick={function(){resetWorkflow();onToast("却下");}}>修正依頼</Btn>
        <Btn onClick={approveAndExecute}>承認して実行 ▶</Btn>
      </div>
    </Card>}
    {Object.keys(agentOutputs).length>0 && <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {Object.entries(agentOutputs).map(function(e){var ag=agents.find(function(a){return a.id===e[0];});return ag?<ExpandCard key={e[0]} title={ag.icon+" "+ag.name} content={e[1]} borderColor={ag.color} />:null;})}
    </div>}
    {discussion && <ExpandCard title="💬 議論サマリー" content={discussion} />}
    {finalOutput && <Card style={{border:"1px solid "+T.success+"33",background:T.success+"05"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:18}}>📄</span><span style={{fontSize:15,fontWeight:600,color:T.text}}>最終アウトプット</span></div>
      <div style={{fontSize:13,color:T.textDim,lineHeight:1.9,whiteSpace:"pre-wrap",maxHeight:600,overflow:"auto",padding:"12px 16px",background:T.bg,borderRadius:T.radiusSm}}>{finalOutput}</div>
    </Card>}

    {/* Feedback after completion */}
    {phase==="complete"&&!fbSent && <Card style={{border:"1px solid "+T.warning+"33",background:T.warning+"05"}}>
      <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:12}}>📝 フィードバック</div>
      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:12}}>
        {[1,2,3,4,5].map(function(n){return <button key={n} onClick={function(){setFbRating(n);}} style={{fontSize:24,background:"none",border:"none",cursor:"pointer",color:n<=fbRating?T.warning:T.border,transition:"color 0.15s"}}>{n<=fbRating?"★":"☆"}</button>;})}
        <span style={{fontSize:12,color:T.textMuted,marginLeft:8}}>{fbRating>0?["","改善必要","やや不満","普通","良い","最高"][fbRating]:""}</span>
      </div>
      <textarea value={fbComment} onChange={function(e){setFbComment(e.target.value);}} placeholder="改善点やコメントがあれば..." rows={2}
        style={{width:"100%",padding:"8px 12px",background:T.bg,border:"1px solid "+T.border,borderRadius:T.radiusXs,color:T.text,fontSize:12,lineHeight:1.6,resize:"none",outline:"none",fontFamily:T.font,marginBottom:8,boxSizing:"border-box"}} />
      <Btn onClick={submitFeedback} disabled={fbRating===0} style={{fontSize:12}}>FBを送信</Btn>
    </Card>}
    {fbSent && <div style={{textAlign:"center",color:T.success,fontSize:13,padding:8}}>✅ FBを保存しました。次回のタスクに反映されます。</div>}
  </div>;
}

function PhaseProgress({ currentPhase }) {
  var idx = PHASES.findIndex(function(p){return p.id===currentPhase;});
  return <div style={{display:"flex",alignItems:"center",gap:0,padding:"16px 0",overflow:"auto"}}>
    {PHASES.filter(function(p){return p.id!=="idle";}).map(function(phase,i,arr){
      var pi=PHASES.findIndex(function(p2){return p2.id===phase.id;}); var active=pi===idx,done=pi<idx;
      var clr=active?T.accent:done?T.success:T.textMuted;
      return <div key={phase.id} style={{display:"flex",alignItems:"center"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:70}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:done?T.success+"22":active?T.accent+"22":"transparent",border:"2px solid "+clr,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,boxShadow:active?"0 0 12px "+T.accent+"44":"none"}}>{done?"✓":phase.icon}</div>
          <span style={{fontSize:10,color:clr,whiteSpace:"nowrap"}}>{phase.label}</span>
        </div>
        {i<arr.length-1&&<div style={{width:24,height:2,background:done?T.success:T.border,margin:"0 2px",marginBottom:18}} />}
      </div>;
    })}
  </div>;
}

function ExpandCard({ title, content, borderColor }) {
  var [expanded, setExpanded] = useState(false);
  return <Card style={{borderLeft:borderColor?"3px solid "+borderColor:undefined}}>
    <div onClick={function(){setExpanded(!expanded);}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
      <span style={{fontSize:14,fontWeight:600,color:T.text}}>{title}</span>
      <span style={{fontSize:11,color:T.textMuted,transform:expanded?"rotate(180deg)":"none",transition:"0.2s",marginLeft:"auto"}}>▼</span>
    </div>
    {expanded && <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+T.border,fontSize:13,color:T.textDim,lineHeight:1.8,whiteSpace:"pre-wrap",maxHeight:400,overflow:"auto"}}>{content}</div>}
  </Card>;
}

// ═══════════════════════════════════════════════════════════════
// TEAM SETTINGS
// ═══════════════════════════════════════════════════════════════
function TeamSettingsView({ agents, agentRules, knowledge, feedbacks, onSaveRules }) {
  var [editing, setEditing] = useState(null);
  var [editRules, setEditRules] = useState("");

  if (editing) return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <Btn variant="ghost" onClick={function(){setEditing(null);}} style={{alignSelf:"flex-start"}}>← 戻る</Btn>
    <Card style={{borderTop:"3px solid "+editing.color}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <AgentAvatar agent={editing} size={40} active />
        <div><div style={{fontSize:16,fontWeight:600,color:T.text}}>{editing.fullName}</div><div style={{fontSize:12,color:T.textMuted}}>{editing.role}</div></div>
      </div>
      {(function(){var myKn=knowledge.filter(function(k){if(!k.assignedAgents||!k.assignedAgents.length)return true;return k.assignedAgents.indexOf("all")>=0||k.assignedAgents.indexOf(editing.id)>=0;});
        return myKn.length?<div style={{marginBottom:16}}><div style={{fontSize:12,fontWeight:600,color:T.textDim,marginBottom:6}}>📚 学習済み ({myKn.length}件)</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{myKn.map(function(k){var ci=getCat(k.category);return <span key={k.id} style={{fontSize:11,padding:"3px 8px",borderRadius:4,background:ci.color+"15",color:ci.color}}>{ci.icon} {truncate(k.title,20)}</span>;})}</div></div>:null;
      })()}
      <label style={{fontSize:12,fontWeight:600,color:T.textDim,display:"block",marginBottom:8}}>ルール（Markdown）</label>
      <textarea value={editRules} onChange={function(e){setEditRules(e.target.value);}} style={{width:"100%",minHeight:300,background:T.bg,color:T.text,border:"1px solid "+T.border,borderRadius:T.radiusSm,padding:14,fontSize:13,fontFamily:T.font,lineHeight:1.7,resize:"vertical",outline:"none",boxSizing:"border-box"}} />
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <Btn variant="ghost" onClick={function(){setEditRules(editing.defaultRules);}}>デフォルト</Btn>
        <Btn onClick={function(){onSaveRules(editing.id,editRules);setEditing(null);}}>保存</Btn>
      </div>
    </Card>
  </div>;

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div style={{fontSize:18,fontWeight:700,color:T.text}}>👥 チーム設定</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
      {agents.map(function(agent){
        var custom=agentRules[agent.id]&&agentRules[agent.id]!==agent.defaultRules;
        var knCnt=knowledge.filter(function(k){if(!k.assignedAgents||!k.assignedAgents.length)return true;return k.assignedAgents.indexOf("all")>=0||k.assignedAgents.indexOf(agent.id)>=0;}).length;
        return <Card key={agent.id} onClick={function(){setEditing(agent);setEditRules(agentRules[agent.id]||agent.defaultRules);}} style={{cursor:"pointer",borderTop:"3px solid "+agent.color}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <AgentAvatar agent={agent} size={36} active />
            <div><div style={{fontSize:14,fontWeight:600,color:T.text}}>{agent.name}</div><div style={{fontSize:11,color:T.textMuted}}>{agent.fullName}</div></div>
            {custom&&<span style={{marginLeft:"auto",fontSize:10,padding:"2px 6px",borderRadius:4,background:T.accent+"22",color:T.accent}}>カスタム</span>}
          </div>
          <div style={{fontSize:12,color:T.textDim}}>{agent.role}</div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            <span style={{fontSize:11,color:T.purple}}>📚 {knCnt}件</span>
            <span style={{fontSize:11,color:T.accent}}>編集 →</span>
          </div>
        </Card>;
      })}
    </div>

    {/* Feedback history */}
    {feedbacks.length>0 && <div style={{marginTop:8}}>
      <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:8}}>📝 フィードバック履歴（直近{Math.min(feedbacks.length,10)}件）</div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {feedbacks.slice(0,10).map(function(fb){return <Card key={fb.id} style={{padding:"10px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:T.warning}}>{makeStars(fb.rating)}</span>
            <span style={{fontSize:12,color:T.text,flex:1}}>{fb.task}</span>
            <span style={{fontSize:10,color:T.textDim}}>{fmtDate(fb.date)}</span>
          </div>
          {fb.comment&&<div style={{fontSize:11,color:T.textDim,marginTop:4}}>{fb.comment}</div>}
        </Card>;})}
      </div>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function MarketingTeamAI() {
  var [view, setView] = useState("workspace");
  var [agentRules, setAgentRules] = useState({});
  var [knowledge, setKnowledge] = useState([]);
  var [feedbacks, setFeedbacks] = useState([]);
  var [tasks, setTasks] = useState({});
  var [toast, setToast] = useState(null);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    (async function() {
      var r1 = await storeGet(SK.agents); if(r1) setAgentRules(r1);
      // Knowledge - migrate from any old key
      var r2 = await migrateGet(SK.knowledge, OLD_KNOWLEDGE_KEYS, function(oldKn) {
        return oldKn.map(function(k) { return Object.assign({}, k, { assignedAgents: k.assignedAgents || ["all"] }); });
      });
      if(r2) setKnowledge(r2);
      // Feedbacks - migrate
      var r3 = await migrateGet(SK.feedbacks, OLD_FEEDBACK_KEYS);
      if(r3) setFeedbacks(r3);
      // Tasks
      var r4 = await storeGet(SK.tasks); if(r4) setTasks(r4);
      setLoading(false);
    })();
  }, []);

  async function saveAgentRules(id, rules) {
    var n = Object.assign({}, agentRules); n[id] = rules;
    setAgentRules(n); await storeSet(SK.agents, n); setToast("✅ ルール保存");
  }
  async function addKnowledge(item) {
    var n = [item].concat(knowledge); setKnowledge(n); await storeSet(SK.knowledge, n); setToast("✅ ナレッジ追加");
  }
  async function deleteKnowledge(id) {
    var n = knowledge.filter(function(k){return k.id!==id;}); setKnowledge(n); await storeSet(SK.knowledge, n); setToast("🗑 削除");
  }
  async function addFeedback(fb) {
    var n = [fb].concat(feedbacks); setFeedbacks(n); await storeSet(SK.feedbacks, n);
  }
  async function saveTasks(t) { setTasks(t); await storeSet(SK.tasks, t); }

  if (loading) return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",color:T.textMuted,fontFamily:T.font}}>読み込み中...</div>;

  var TABS = [
    { id:"workspace", label:"🏢 ワークスペース" },
    { id:"task", label:"⏱ タスク管理" },
    { id:"learning", label:"📚 学習" },
    { id:"team", label:"👥 チーム設定" },
  ];

  return <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.font,display:"flex",flexDirection:"column"}}>
    <style>{"\n@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap');\n* { box-sizing: border-box; margin: 0; }\n::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: "+T.border+"; border-radius: 3px; }\n@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }\n@keyframes fadeIn { from { opacity:0; transform:translateY(8px) translateX(-50%); } to { opacity:1; transform:translateY(0) translateX(-50%); } }\n@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }\ntextarea:focus, input:focus { border-color: "+T.borderFocus+" !important; }\n"}</style>

    <div style={{display:"flex",alignItems:"center",padding:"12px 20px",borderBottom:"1px solid "+T.border,background:T.glass,backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:100,gap:8,overflowX:"auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginRight:12,flexShrink:0}}>
        <span style={{fontSize:20}}>🏢</span>
        <span style={{fontSize:15,fontWeight:700}}>Marketing Team AI</span>
        <span style={{fontSize:9,color:T.textMuted,padding:"2px 6px",borderRadius:4,background:T.bgCard,border:"1px solid "+T.border}}>Opus 4.6</span>
      </div>
      <div style={{display:"flex",gap:2,flexShrink:0}}>
        {TABS.map(function(t){return <Btn key={t.id} variant={view===t.id?"primary":"ghost"} onClick={function(){setView(t.id);}} style={{fontSize:11,padding:"6px 10px",whiteSpace:"nowrap"}}>{t.label}</Btn>;})}
      </div>
    </div>

    <div style={{flex:1,padding:"20px 24px",maxWidth:900,width:"100%",margin:"0 auto"}}>
      {view==="workspace" && <WorkspaceView agents={AGENTS} agentRules={agentRules} knowledge={knowledge} feedbacks={feedbacks} onAddFeedback={addFeedback} onToast={function(m){setToast(m);}} />}
      {view==="task" && <TaskManagementView tasks={tasks} onSave={saveTasks} />}
      {view==="learning" && <KnowledgeView knowledge={knowledge} onAdd={addKnowledge} onDelete={deleteKnowledge} agents={AGENTS} />}
      {view==="team" && <TeamSettingsView agents={AGENTS} agentRules={agentRules} knowledge={knowledge} feedbacks={feedbacks} onSaveRules={saveAgentRules} />}
    </div>

    {toast && <Toast msg={toast} onClose={function(){setToast(null);}} />}
  </div>;
}

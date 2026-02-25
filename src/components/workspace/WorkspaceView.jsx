import { useState, useRef } from "react";
import { T, AGENTS } from "../../lib/constants";
import { truncate, makeStars } from "../../lib/format";
import { buildAgentSys } from "../../lib/agents";
import { callAPI } from "../../lib/api";
import { parseJSON } from "../../lib/format";
import {
  buildPlanPrompt,
  buildAgentTaskPrompt,
  buildReviewPrompt,
  buildDiscussionPrompt,
  buildFinalPrompt,
} from "../../lib/prompts";
import Card from "../ui/Card";
import Btn from "../ui/Btn";
import AgentAvatar from "../ui/AgentAvatar";
import ExpandCard from "../ui/ExpandCard";
import PhaseProgress from "./PhaseProgress";

export default function WorkspaceView({ agents, agentRules, knowledge, feedbacks, onAddFeedback, onToast }) {
  const [phase, setPhase] = useState("idle");
  const [taskInput, setTaskInput] = useState("");
  const [currentTask, setCurrentTask] = useState("");
  const [plan, setPlan] = useState(null);
  const [agentStatuses, setAgentStatuses] = useState({});
  const [agentOutputs, setAgentOutputs] = useState({});
  const [discussion, setDiscussion] = useState(null);
  const [finalOutput, setFinalOutput] = useState(null);
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [error, setError] = useState(null);
  const [webSearch, setWebSearch] = useState(false);
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState("");
  const [fbSent, setFbSent] = useState(false);
  const abortRef = useRef(false);

  const resetWorkflow = () => {
    setPhase("idle");
    setPlan(null);
    setAgentStatuses({});
    setAgentOutputs({});
    setDiscussion(null);
    setFinalOutput(null);
    setActiveAgentId(null);
    setError(null);
    setFbRating(0);
    setFbComment("");
    setFbSent(false);
    abortRef.current = false;
  };

  const submitTask = async () => {
    if (!taskInput.trim() || phase !== "idle") return;
    const task = taskInput.trim();
    setTaskInput("");
    setCurrentTask(task);
    setError(null);
    abortRef.current = false;
    setFbSent(false);
    setPhase("planning");
    setAgentStatuses({ pm: "working" });
    setActiveAgentId("pm");

    const pmSys = buildAgentSys(agents[0], agentRules, knowledge);
    const planPrompt = buildPlanPrompt(task, agents, webSearch, feedbacks);
    const pmResult = await callAPI(pmSys, [{ role: "user", content: planPrompt }]);

    if (abortRef.current) return;
    const parsedPlan = parseJSON(pmResult);
    if (!parsedPlan || !parsedPlan.assignedAgents) {
      setError("PMプラン生成失敗\n\n" + pmResult);
      setPhase("idle");
      setAgentStatuses({});
      return;
    }
    setPlan(parsedPlan);
    setAgentStatuses({ pm: "done" });
    setPhase("user_review");
  };

  const approveAndExecute = async () => {
    if (!plan) return;
    setPhase("executing");
    const outputs = {};

    for (const a of plan.plan) {
      if (abortRef.current) return;
      const agentDef = agents.find((ag) => ag.id === a.agent);
      if (!agentDef) continue;

      setActiveAgentId(a.agent);
      setAgentStatuses((p) => ({ ...p, [a.agent]: "working" }));

      const result = await callAPI(
        buildAgentSys(agentDef, agentRules, knowledge),
        [{ role: "user", content: buildAgentTaskPrompt(currentTask, a.instruction) }],
        4000,
        webSearch
      );

      if (abortRef.current) return;
      outputs[a.agent] = result;
      setAgentOutputs((p) => ({ ...p, [a.agent]: result }));
      setAgentStatuses((p) => ({ ...p, [a.agent]: "done" }));
    }

    // Director review
    setPhase("reviewing");
    setActiveAgentId("director");
    setAgentStatuses((p) => ({ ...p, director: "working" }));

    const dirDef = agents.find((a) => a.id === "director");
    const outSum = Object.entries(outputs)
      .map(([id, output]) => {
        const ag = agents.find((a) => a.id === id);
        return `### ${ag ? ag.icon + " " + ag.name : id}\n${output}`;
      })
      .join("\n\n---\n\n");

    const dirResult = await callAPI(
      buildAgentSys(dirDef, agentRules, knowledge),
      [{ role: "user", content: buildReviewPrompt(currentTask, outSum) }]
    );
    if (abortRef.current) return;
    setAgentStatuses((p) => ({ ...p, director: "done" }));

    // Discussion
    setPhase("discussing");
    setActiveAgentId("pm");
    const discResult = await callAPI(
      buildAgentSys(agents[0], agentRules, knowledge),
      [{ role: "user", content: buildDiscussionPrompt(currentTask, outSum, dirResult) }]
    );
    if (abortRef.current) return;
    setDiscussion(discResult);

    // Final output
    setPhase("finalizing");
    const finalResult = await callAPI(
      buildAgentSys(agents[0], agentRules, knowledge),
      [{ role: "user", content: buildFinalPrompt(currentTask, outSum, dirResult, discResult) }],
      4000
    );
    if (abortRef.current) return;
    setFinalOutput(finalResult);
    setPhase("complete");
    onToast("✅ タスク完了！");
  };

  const submitFeedback = () => {
    if (fbRating === 0) return;
    onAddFeedback({
      id: String(Date.now()),
      task: truncate(currentTask, 60),
      rating: fbRating,
      comment: fbComment,
      date: new Date().toISOString(),
    });
    setFbSent(true);
    onToast("📝 FB保存！次回から反映されます");
  };

  const isWorking = phase !== "idle" && phase !== "complete" && phase !== "user_review";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Agent avatars */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "8px 0", flexWrap: "wrap" }}>
        {agents.map((a) => (
          <AgentAvatar
            key={a.id}
            agent={a}
            size={36}
            showName
            active={agentStatuses[a.id] === "working" || activeAgentId === a.id}
          />
        ))}
      </div>

      {/* Input area */}
      {(phase === "idle" || phase === "complete") && (
        <Card style={{ background: T.bgInput }}>
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitTask();
            }}
            placeholder={'チームに依頼するタスクを入力...\n\n例:「美容クリニックのSEO記事を企画して」'}
            rows={4}
            style={{
              width: "100%", background: "transparent", color: T.text, border: "none",
              fontSize: 14, fontFamily: T.font, lineHeight: 1.7, resize: "none", outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setWebSearch(!webSearch)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: "none",
                  background: webSearch ? T.cyan : T.border, cursor: "pointer",
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, left: webSearch ? 21 : 3, transition: "left 0.2s",
                  }}
                />
              </button>
              <span style={{ fontSize: 12, color: webSearch ? T.cyan : T.textMuted, fontWeight: 500 }}>
                🌐 ウェブ検索{webSearch ? " ON" : " OFF"}
              </span>
            </div>
            <Btn onClick={submitTask} disabled={!taskInput.trim()}>チームに依頼する 🚀</Btn>
          </div>
        </Card>
      )}

      {/* Current task bar */}
      {currentTask && phase !== "idle" && (
        <Card style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.textDim }}>依頼:</span>
            <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{truncate(currentTask, 120)}</span>
            {isWorking && (
              <Btn
                variant="danger"
                onClick={() => { abortRef.current = true; resetWorkflow(); onToast("⏹ 中断"); }}
                style={{ fontSize: 11, padding: "4px 10px" }}
              >
                中断
              </Btn>
            )}
            {phase === "complete" && (
              <Btn variant="ghost" onClick={resetWorkflow} style={{ fontSize: 11 }}>新規</Btn>
            )}
          </div>
        </Card>
      )}

      {/* Phase progress */}
      {phase !== "idle" && <PhaseProgress currentPhase={phase} />}

      {/* Working indicator */}
      {isWorking && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block", fontSize: 16 }}>⚙️</span>
          <span style={{ fontSize: 13, color: T.textDim }}>
            {activeAgentId && (() => {
              const ag = agents.find((a) => a.id === activeAgentId);
              return ag ? `${ag.icon} ${ag.name} が作業中...` : "処理中...";
            })()}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card style={{ border: `1px solid ${T.error}44`, background: T.error + "08" }}>
          <div style={{ fontSize: 13, color: T.error, whiteSpace: "pre-wrap" }}>{error}</div>
        </Card>
      )}

      {/* Plan review */}
      {phase === "user_review" && plan && (
        <Card style={{ border: `1px solid ${T.accent}44`, background: T.accent + "08" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>PMからの実行プラン</span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: T.warning + "22", color: T.warning, marginLeft: "auto" }}>
              承認待ち
            </span>
          </div>
          {plan.analysis && (
            <div style={{ fontSize: 13, color: T.textDim, marginBottom: 16, lineHeight: 1.7, padding: "12px 16px", background: T.bg, borderRadius: T.radiusSm }}>
              {plan.analysis}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {(plan.assignedAgents || []).map((aid) => {
              const ag = agents.find((a) => a.id === aid);
              return ag ? (
                <div key={aid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: ag.color + "15", border: `1px solid ${ag.color}33` }}>
                  <span style={{ fontSize: 14 }}>{ag.icon}</span>
                  <span style={{ fontSize: 12, color: ag.color }}>{ag.name}</span>
                </div>
              ) : null;
            })}
          </div>
          {plan.plan?.map((p, i) => {
            const ag = agents.find((a) => a.id === p.agent);
            return (
              <div key={i} style={{ padding: "10px 14px", background: T.bg, borderRadius: T.radiusSm, borderLeft: `3px solid ${ag ? ag.color : T.border}`, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: ag ? ag.color : T.text }}>
                  {ag ? `${ag.icon} ${ag.name}` : p.agent}
                </span>
                <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.6 }}>{p.instruction}</div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn variant="secondary" onClick={() => { resetWorkflow(); onToast("却下"); }}>修正依頼</Btn>
            <Btn onClick={approveAndExecute}>承認して実行 ▶</Btn>
          </div>
        </Card>
      )}

      {/* Agent outputs */}
      {Object.keys(agentOutputs).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(agentOutputs).map(([id, output]) => {
            const ag = agents.find((a) => a.id === id);
            return ag ? (
              <ExpandCard key={id} title={`${ag.icon} ${ag.name}`} content={output} borderColor={ag.color} />
            ) : null;
          })}
        </div>
      )}

      {/* Discussion */}
      {discussion && <ExpandCard title="💬 議論サマリー" content={discussion} />}

      {/* Final output */}
      {finalOutput && (
        <Card style={{ border: `1px solid ${T.success}33`, background: T.success + "05" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📄</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>最終アウトプット</span>
          </div>
          <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.9, whiteSpace: "pre-wrap", maxHeight: 600, overflow: "auto", padding: "12px 16px", background: T.bg, borderRadius: T.radiusSm }}>
            {finalOutput}
          </div>
        </Card>
      )}

      {/* Feedback */}
      {phase === "complete" && !fbSent && (
        <Card style={{ border: `1px solid ${T.warning}33`, background: T.warning + "05" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>📝 フィードバック</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setFbRating(n)}
                style={{ fontSize: 24, background: "none", border: "none", cursor: "pointer", color: n <= fbRating ? T.warning : T.border, transition: "color 0.15s" }}
              >
                {n <= fbRating ? "★" : "☆"}
              </button>
            ))}
            <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 8 }}>
              {fbRating > 0 ? ["", "改善必要", "やや不満", "普通", "良い", "最高"][fbRating] : ""}
            </span>
          </div>
          <textarea
            value={fbComment}
            onChange={(e) => setFbComment(e.target.value)}
            placeholder="改善点やコメントがあれば..."
            rows={2}
            style={{
              width: "100%", padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: T.radiusXs, color: T.text, fontSize: 12, lineHeight: 1.6, resize: "none",
              outline: "none", fontFamily: T.font, marginBottom: 8, boxSizing: "border-box",
            }}
          />
          <Btn onClick={submitFeedback} disabled={fbRating === 0} style={{ fontSize: 12 }}>FBを送信</Btn>
        </Card>
      )}

      {fbSent && (
        <div style={{ textAlign: "center", color: T.success, fontSize: 13, padding: 8 }}>
          ✅ FBを保存しました。次回のタスクに反映されます。
        </div>
      )}
    </div>
  );
}

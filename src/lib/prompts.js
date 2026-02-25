import { makeStars } from "./format";

export const buildPlanPrompt = (task, agents, webSearch, feedbacks) => {
  let fbContext = "";
  if (feedbacks && feedbacks.length > 0) {
    const recent = feedbacks.slice(0, 5);
    fbContext =
      "\n\n## 過去のフィードバック（改善に活かすこと）\n" +
      recent.map((f) => `- [${makeStars(f.rating)}] ${f.task}: ${f.comment}`).join("\n");
  }

  const memberList = agents
    .filter((a) => a.id !== "pm")
    .map((a) => `- ${a.id}: ${a.name}（${a.role}）`)
    .join("\n");

  return (
    "以下のタスクを分析しアサインプランを作成。\n\n## タスク\n" +
    task +
    (webSearch ? "\n\n※ウェブ検索が利用可能です。リサーチが必要なメンバーには指示に含めてください。" : "") +
    fbContext +
    "\n\n## メンバー\n" +
    memberList +
    '\n\n## JSON形式で出力\n{"analysis":"分析","assignedAgents":["id1"],"plan":[{"agent":"id1","instruction":"指示"}]}'
  );
};

export const buildAgentTaskPrompt = (task, instruction) =>
  `## タスク\n${task}\n\n## 指示\n${instruction}\n\n具体的なアウトプットをマークダウンで出力。`;

export const buildReviewPrompt = (task, outputSummary) =>
  `## タスク\n${task}\n\n## アウトプット\n${outputSummary}\n\n品質レビューしてください。`;

export const buildDiscussionPrompt = (task, outputSummary, review) =>
  `## タスク\n${task}\n\n## アウトプット\n${outputSummary}\n\n## レビュー\n${review}\n\n議論サマリーを簡潔に。`;

export const buildFinalPrompt = (task, outputSummary, review, discussion) =>
  `## タスク\n${task}\n\n## アウトプット\n${outputSummary}\n\n## レビュー\n${review}\n\n## 議論\n${discussion}\n\n統合して最終成果物を作成。マークダウンで。`;

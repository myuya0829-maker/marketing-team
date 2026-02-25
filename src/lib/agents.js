export const buildAgentSys = (agent, agentRules, knowledge) => {
  const rules = agentRules[agent.id] || agent.defaultRules;
  let s = `あなたは「${agent.fullName}」です。\n\n## 役割\n${agent.role}\n\n## ルール\n${rules}`;

  if (knowledge && knowledge.length > 0) {
    const myKn = knowledge.filter((k) => {
      if (!k.assignedAgents || k.assignedAgents.length === 0) return true;
      return k.assignedAgents.includes("all") || k.assignedAgents.includes(agent.id);
    });

    if (myKn.length > 0) {
      s += "\n\n## 学習済みナレッジ（必ず遵守）\n";
      for (const kn of myKn) {
        s += `\n### ${kn.title}\n${kn.content}\n`;
      }
    }
  }

  return s;
};

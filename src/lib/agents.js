import { WRITING_RULES, WRITING_AGENTS, getCat } from "./constants";
import { truncate } from "./format";
import { stripHtml } from "./format";

/**
 * Build system prompt for an agent (auto-filters knowledge by assignedAgents)
 */
export const buildAgentSys = (agent, agentRules, knowledge) => {
  const rules = agentRules[agent.id] || agent.defaultRules;
  let s = `あなたは「${agent.fullName}」です。\n\n## 役割\n${agent.role}\n\n## ルール\n${rules}`;

  if (WRITING_AGENTS.includes(agent.id)) s += WRITING_RULES;

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

/**
 * Build system prompt with SELECTED knowledge only (for workspace with manual knowledge selection)
 */
export const buildAgentSysFiltered = (agent, agentRules, selectedKnowledge) => {
  const rules = agentRules[agent.id] || agent.defaultRules;
  let s = `あなたは「${agent.fullName}」です。\n\n## 役割\n${agent.role}\n\n## ルール\n${rules}`;

  if (WRITING_AGENTS.includes(agent.id)) s += WRITING_RULES;

  if (selectedKnowledge && selectedKnowledge.length > 0) {
    s += "\n\n## 参照ナレッジ（必ず遵守）\n";
    for (const kn of selectedKnowledge) {
      s += `\n### ${kn.title}\n${kn.content}\n`;
    }
  }

  return s;
};

/**
 * Build a lightweight knowledge index for PM (titles only, no content)
 */
export const buildKnowledgeIndex = (localKnowledge, netlifyIndex) => {
  const items = [];
  for (const k of localKnowledge) {
    items.push({
      id: k.id,
      title: k.title,
      category: getCat(k.category).label,
      source: "local",
      preview: truncate(k.content, 100),
    });
  }
  for (const n of netlifyIndex) {
    items.push({
      id: "netlify:" + n.id,
      title: n.title,
      category: n.category || "その他",
      source: "netlify",
      tags: (n.tags || []).join(", "),
    });
  }
  return items;
};

/**
 * Resolve selected knowledge IDs to full content
 */
export const resolveKnowledge = async (selectedIds, localKnowledge, netlifyIndex, netlifyUrl) => {
  const resolved = [];
  for (const id of selectedIds) {
    if (id.startsWith("netlify:")) {
      const nId = id.replace("netlify:", "");
      const nItem = netlifyIndex.find((n) => n.id === nId);
      if (nItem && netlifyUrl) {
        const text = await fetchNetlifyPage(netlifyUrl, nItem.url);
        if (text) resolved.push({ id, title: nItem.title, content: truncate(text, 3000) });
      }
    } else {
      const lItem = localKnowledge.find((k) => k.id === id);
      if (lItem) resolved.push({ id, title: lItem.title, content: lItem.content });
    }
  }
  return resolved;
};

/**
 * Fetch Netlify knowledge index
 */
export const fetchNetlifyIndex = async (baseUrl) => {
  try {
    const url = baseUrl.replace(/\/$/, "") + "/knowledge.json";
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Netlify index fetch failed:", e);
    return [];
  }
};

/**
 * Fetch and strip a Netlify page
 */
export const fetchNetlifyPage = async (baseUrl, pagePath) => {
  try {
    const url = baseUrl.replace(/\/$/, "") + "/" + pagePath.replace(/^\//, "");
    const res = await fetch(url);
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch (e) {
    console.error("Netlify page fetch failed:", e);
    return "";
  }
};

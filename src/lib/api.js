export const callAPI = async (sys, msgs, maxTok = 4000, useSearch = false) => {
  try {
    const body = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTok,
      system: sys,
      messages: msgs,
    };
    if (useSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.error) return "APIエラー: " + (data.error.message || JSON.stringify(data.error));
    if (data.content)
      return data.content
        .map((b) => b.text || "")
        .filter(Boolean)
        .join("\n");
    return "応答なし";
  } catch (e) {
    return "エラー: " + e.message;
  }
};

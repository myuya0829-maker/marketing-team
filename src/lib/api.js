/**
 * Call Anthropic Messages API
 * @param {string} sys - System prompt
 * @param {Array} msgs - Messages array
 * @param {number} maxTok - Max tokens (default 4000)
 * @param {boolean} useSearch - Enable web search tool
 * @param {string} model - Model to use (default claude-sonnet-4-20250514)
 */
export const callAPI = async (sys, msgs, maxTok = 4000, useSearch = false, model = "claude-sonnet-4-20250514") => {
  try {
    const body = {
      model,
      max_tokens: maxTok,
      system: sys,
      messages: msgs,
    };
    if (useSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json();

    if (data.error) return "APIエラー: " + (data.error.message || JSON.stringify(data.error));
    if (data.content)
      return data.content
        .map((b) => b.text || "")
        .filter(Boolean)
        .join("\n");
    return "応答なし";
  } catch (e) {
    return "エラー: " + (e.name === "AbortError" ? "タイムアウト（120秒）" : e.message);
  }
};

/**
 * Quick API call using Haiku model (for fast, cheap tasks like message generation, AI estimates)
 */
export const callAPIQuick = async (sys, msgs, maxTok = 1500) => {
  return callAPI(sys, msgs, maxTok, false, "claude-haiku-4-5-20251001");
};

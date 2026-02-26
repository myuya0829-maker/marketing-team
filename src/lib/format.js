export const truncate = (s, n) =>
  s && s.length > n ? s.slice(0, n) + "…" : s || "";

export const fmtDate = (d) => {
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

export const makeStars = (r) => {
  let s = "";
  for (let i = 0; i < r; i++) s += "★";
  for (let j = 0; j < 5 - r; j++) s += "☆";
  return s;
};

export const fmtSec = (totalSec) => {
  if (totalSec < 0) totalSec = 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const parseJSON = (t) => {
  try {
    return JSON.parse(t.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    return null;
  }
};

/** Strip HTML tags and normalize whitespace */
export const stripHtml = (html) => {
  let txt = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  txt = txt.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  txt = txt.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  txt = txt.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  txt = txt.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  txt = txt.replace(/<[^>]+>/g, " ");
  txt = txt.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  txt = txt.replace(/\s+/g, " ").trim();
  return txt;
};

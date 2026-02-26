const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const dateLabel = (key) => {
  const p = key.split("-");
  const month = p[1].replace(/^0/, "");
  const day = p[2].replace(/^0/, "");
  const dayName = DAY_NAMES[new Date(key).getDay()];
  return `${month}/${day}（${dayName}）`;
};

// ── Deadline helpers ──

/** Extract date part "YYYY-MM-DD" from deadline string */
export const dlDate = (dl) => (dl ? dl.slice(0, 10) : "");

/** Extract time part "HH:MM" from deadline string (if present) */
export const dlTime = (dl) => (dl && dl.length > 10 ? dl.slice(11, 16) : "");

/** Join date + optional time into deadline string */
export const dlJoin = (d, t) => {
  const full = d.length === 10 ? d : toISO(d);
  return full ? (t ? full + "T" + t : full) : "";
};

/** Get end-of-day Date for a deadline */
export const dlEnd = (dl) =>
  dl && dl.length > 10 ? new Date(dl) : new Date(dl + "T23:59:59");

/** Display deadline as "MM/DD HH:MM" or "MM/DD" */
export const dlDisplay = (dl) => {
  const d = dl ? dl.slice(5, 10).replace(/-/g, "/") : "";
  const t = dlTime(dl);
  return t ? d + " " + t : d;
};

// ── Month helpers ──

/** "YYYY-MM-DD" → "MM/DD" */
export const toMMDD = (iso) => (iso ? iso.slice(5, 10).replace(/-/g, "/") : "");

/** "YYYY-MM-DD" → "M/D" (no leading zeros) */
export const toShortDate = (iso) => {
  const p = iso.slice(5, 10).split("-");
  return parseInt(p[0]) + "/" + parseInt(p[1]);
};

/** Current month key "YYYY-MM" */
export const curMonth = () => new Date().toISOString().slice(0, 7);

/** "YYYY-MM" → "YYYY年M月" */
export const monthLabel = (m) => {
  if (!m) return "";
  const p = m.split("-");
  return p[0] + "年" + parseInt(p[1]) + "月";
};

/** Previous month key */
export const prevMonthKey = (m) => {
  const d = new Date(m + "-15");
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};

/** Next month key */
export const nextMonthKey = (m) => {
  const d = new Date(m + "-15");
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
};

// ── Conversion helpers ──

/** Convert "MM/DD" to "YYYY-MM-DD" (guesses year) */
export const toISO = (mmdd) => {
  if (!mmdd) return "";
  const p = mmdd.replace(/[／]/g, "/").split("/");
  if (p.length !== 2) return "";
  const m = parseInt(p[0]) || 0;
  const d = parseInt(p[1]) || 0;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  let y = new Date().getFullYear();
  // If the date is more than 2 months in the past, assume next year
  const candidate = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (candidate < now && now - candidate > 60 * 86400000) y++;
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
};

/** Format input value as "MM/DD" while typing */
export const fmtDateInput = (v) => {
  const digits = v.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length > 2) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
};

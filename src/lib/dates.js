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

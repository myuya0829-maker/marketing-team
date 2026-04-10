import { useState, useEffect } from "react";
import { T } from "../../lib/constants";
import { useApp } from "../../contexts/AppContext";
import { fetchLastSheetSyncAt } from "../../hooks/useStorage";

// 相対時刻フォーマット (ja)
function formatRelative(iso, now) {
  if (!iso) return "未同期";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "未同期";
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 45) return "たった今";
  if (diffSec < 90) return "1分前";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "昨日";
  if (diffDay < 7) return `${diffDay}日前`;
  // 1週間以上前は日付表示
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// sync が 15 分以上止まってたら警告色
function getSyncColor(iso, now) {
  if (!iso) return T.textMuted;
  const diffMin = (now - new Date(iso).getTime()) / 60000;
  if (diffMin > 15) return T.warning;
  if (diffMin > 30) return T.error;
  return T.textMuted;
}

/**
 * 施策管理シートの最終同期時刻バッジ (Phase J-6)
 *
 * - DB から tasks.sheet_synced_at の MAX を取得
 * - 60秒ごとに DB 再取得、10秒ごとに相対時刻を更新
 * - AppContext の taskRefreshSignal でも再取得
 * - hover でツールチップに ISO 時刻
 */
export default function SheetSyncBadge() {
  const { taskRefreshSignal } = useApp();
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  // 初回 + 60秒ごと + taskRefreshSignal で DB 取得
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      const v = await fetchLastSheetSyncAt();
      if (!cancelled) setLastSyncAt(v);
    };
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [taskRefreshSignal]);

  // 10秒ごとに相対時刻を再計算 (tick)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const label = formatRelative(lastSyncAt, now);
  const color = getSyncColor(lastSyncAt, now);
  const title = lastSyncAt
    ? `📚 施策管理シートとの最終同期: ${new Date(lastSyncAt).toLocaleString("ja-JP")}\n5分ごとに自動同期されます`
    : "📚 施策管理シートとの同期記録なし";

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        color,
        padding: "2px 6px",
        borderRadius: 99,
        background: color + "14",
        border: `1px solid ${color}22`,
        fontFamily: T.font,
        cursor: "help",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 9 }}>🔄</span>
      {label}
    </span>
  );
}

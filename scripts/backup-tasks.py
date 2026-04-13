#!/usr/bin/env python3
"""
backup-tasks.py — 完了タスクの作業実績を Google Sheets に記録

毎日1回実行し、前日までに完了したタスクを月別タブに追記する。
- 月別タブ（例: "2026-04"）にクライアント×タスクの作業時間を記録
- クライアントごとの合計時間サマリーを別タブに自動更新
- 重複防止: 既に記録済みのタスクIDはスキップ

使い方:
  python3 backup-tasks.py [--dry-run] [--verbose] [--force]
"""

import os
import sys
import json
import time
import socket
import datetime
import argparse
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import HTTPError, URLError


def wait_for_network(max_wait_sec=600, check_interval=10):
    """ネットワークが繋がるまで待機（最大10分）。
    Mac スリープ復帰直後の DNS 解決失敗を回避するため。
    """
    start = time.time()
    attempt = 0
    while time.time() - start < max_wait_sec:
        attempt += 1
        try:
            socket.create_connection(("oauth2.googleapis.com", 443), timeout=5).close()
            if attempt > 1:
                print(f"[wait_for_network] OK (after {attempt} attempts, {int(time.time() - start)}s)")
            return True
        except (socket.gaierror, socket.timeout, OSError) as e:
            print(f"[wait_for_network] attempt {attempt} failed: {e}, retry in {check_interval}s")
            time.sleep(check_interval)
    print(f"[wait_for_network] giving up after {max_wait_sec}s")
    return False

# === パス定数 ===
STACK_ROOT = Path(__file__).resolve().parent.parent
TOKENS_DIR = STACK_ROOT / "tokens"
LOGS_DIR = STACK_ROOT / "logs"
ENV_SYNC_FILE = STACK_ROOT / ".env.sync"
BACKUP_SPREADSHEET_ID = "11RLIlR7LYbUGKAzzU9E8UK_hV5C_hkn8s_BLnaRmnHk"
LOG_FILE = LOGS_DIR / "backup.log"

# === 設定 ===
RECORD_COLUMNS = ["完了日", "クライアント", "タスク名", "プロジェクト", "作業時間(h:mm)", "タスクID"]

# === CLI ===
parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--verbose", action="store_true")
parser.add_argument("--force", action="store_true", help="既存タブでも再書き込み")
args = parser.parse_args()
DRY_RUN = args.dry_run
VERBOSE = args.verbose
FORCE = args.force


def log(msg, level="INFO"):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line)
    try:
        LOGS_DIR.mkdir(exist_ok=True)
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def vlog(msg):
    if VERBOSE:
        log(msg, "DEBUG")


# ============================================================
# 環境変数
# ============================================================

def load_env():
    if not ENV_SYNC_FILE.exists():
        log(f".env.sync not found: {ENV_SYNC_FILE}", "ERROR")
        sys.exit(2)
    env = {}
    for line in ENV_SYNC_FILE.read_text().strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


# ============================================================
# Google OAuth
# ============================================================

def get_access_token():
    token_file = TOKENS_DIR / ".google-tokens-stack.json"
    oauth_file = TOKENS_DIR / ".google-oauth.json"
    if not token_file.exists() or not oauth_file.exists():
        log("Token/OAuth files missing", "ERROR")
        sys.exit(2)

    tokens = json.loads(token_file.read_text())
    oauth_raw = json.loads(oauth_file.read_text())
    oauth = oauth_raw.get("installed") or oauth_raw.get("web") or oauth_raw

    data = urlencode({
        "client_id": oauth["client_id"],
        "client_secret": oauth["client_secret"],
        "refresh_token": tokens["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()
    req = Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    resp = urlopen(req, timeout=30)
    result = json.loads(resp.read())

    tokens["access_token"] = result["access_token"]
    if "refresh_token" in result:
        tokens["refresh_token"] = result["refresh_token"]
    if not DRY_RUN:
        token_file.write_text(json.dumps(tokens, indent=2))
        os.chmod(token_file, 0o600)
    return result["access_token"]


# ============================================================
# Google Sheets API
# ============================================================

def sheets_api(access_token, method, path, body=None):
    url = f"https://sheets.googleapis.com/v4/spreadsheets{path}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json")
    resp = urlopen(req, timeout=60)
    return json.loads(resp.read())


def get_existing_tabs(access_token, spreadsheet_id):
    result = sheets_api(access_token, "GET", f"/{spreadsheet_id}?fields=sheets.properties")
    tabs = {}
    for sheet in result.get("sheets", []):
        props = sheet["properties"]
        tabs[props["title"]] = props["sheetId"]
    return tabs


def add_tab(access_token, spreadsheet_id, title, index=0):
    body = {
        "requests": [{
            "addSheet": {
                "properties": {"title": title, "index": index}
            }
        }]
    }
    result = sheets_api(access_token, "POST", f"/{spreadsheet_id}:batchUpdate", body)
    new_id = result["replies"][0]["addSheet"]["properties"]["sheetId"]
    vlog(f"Tab created: {title} (id={new_id})")
    return new_id


def read_tab_values(access_token, spreadsheet_id, tab_title):
    """タブの全データを読み取り"""
    range_str = quote(f"'{tab_title}'!A:F")
    try:
        result = sheets_api(access_token, "GET",
                            f"/{spreadsheet_id}/values/{range_str}")
        return result.get("values", [])
    except HTTPError as e:
        if e.code == 400:
            return []
        raise


def write_rows(access_token, spreadsheet_id, tab_title, rows):
    range_str = f"'{tab_title}'!A1"
    body = {
        "valueInputOption": "USER_ENTERED",
        "data": [{
            "range": range_str,
            "values": rows,
        }],
    }
    result = sheets_api(access_token, "POST", f"/{spreadsheet_id}/values:batchUpdate", body)
    updated = result.get("totalUpdatedCells", 0)
    vlog(f"Written {updated} cells to {tab_title}")
    return updated


def clear_tab(access_token, spreadsheet_id, tab_title):
    """タブの内容をクリア"""
    range_str = f"'{tab_title}'!A:Z"
    body = {}
    sheets_api(access_token, "POST",
               f"/{spreadsheet_id}/values/{quote(range_str)}:clear", body)


def format_header(access_token, spreadsheet_id, sheet_id):
    body = {
        "requests": [
            {
                "repeatCell": {
                    "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {"bold": True},
                            "backgroundColor": {"red": 0.85, "green": 0.92, "blue": 1.0},
                        }
                    },
                    "fields": "userEnteredFormat(textFormat,backgroundColor)",
                }
            },
            {
                "updateSheetProperties": {
                    "properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1}},
                    "fields": "gridProperties.frozenRowCount",
                }
            },
        ]
    }
    sheets_api(access_token, "POST", f"/{spreadsheet_id}:batchUpdate", body)


def format_summary_header(access_token, spreadsheet_id, sheet_id):
    body = {
        "requests": [
            {
                "repeatCell": {
                    "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {"bold": True},
                            "backgroundColor": {"red": 0.95, "green": 0.88, "blue": 0.75},
                        }
                    },
                    "fields": "userEnteredFormat(textFormat,backgroundColor)",
                }
            },
            {
                "updateSheetProperties": {
                    "properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1}},
                    "fields": "gridProperties.frozenRowCount",
                }
            },
        ]
    }
    sheets_api(access_token, "POST", f"/{spreadsheet_id}:batchUpdate", body)


# ============================================================
# Supabase
# ============================================================

def fetch_completed_tasks(env):
    """完了済みタスクを全件取得"""
    url = (env["SUPABASE_URL"].rstrip("/")
           + "/rest/v1/tasks?select=*"
           + "&done=eq.true"
           + "&order=completed_at.asc.nullsfirst"
           + "&limit=5000")
    req = Request(url, method="GET")
    req.add_header("apikey", env["SUPABASE_KEY"])
    req.add_header("Authorization", f"Bearer {env['SUPABASE_KEY']}")
    req.add_header("Content-Type", "application/json")
    resp = urlopen(req, timeout=60)
    return json.loads(resp.read())


def fmt_duration(seconds):
    """秒 → h:mm 形式"""
    if not seconds or seconds <= 0:
        return "0:00"
    h = int(seconds) // 3600
    m = (int(seconds) % 3600) // 60
    return f"{h}:{m:02d}"


def get_completed_date(task):
    """完了日を取得（completed_at > task_date > created_at）"""
    if task.get("completed_at"):
        return task["completed_at"][:10]
    if task.get("task_date"):
        return task["task_date"][:10]
    if task.get("created_at"):
        return task["created_at"][:10]
    return "不明"


def get_month_key(date_str):
    """日付文字列 → 月キー (例: "2026-04")"""
    if date_str and len(date_str) >= 7:
        return date_str[:7]
    return "不明"


# ============================================================
# メイン
# ============================================================

def main():
    log("=== Stack 作業実績バックアップ開始 ===")
    # ネットワーク復旧を待つ（スリープ復帰直後の DNS 失敗対策）
    if not wait_for_network():
        log("ネットワーク到達不可 — 終了", "ERROR")
        sys.exit(1)
    env = load_env()
    # OAuth トークン取得 (リトライ付き)
    access_token = None
    for attempt in range(3):
        try:
            access_token = get_access_token()
            break
        except Exception as e:
            log(f"トークン取得失敗 (attempt {attempt+1}/3): {e}", "WARN")
            time.sleep(15)
    if not access_token:
        log("トークン取得が3回失敗 — 終了", "ERROR")
        sys.exit(1)
    spreadsheet_id = BACKUP_SPREADSHEET_ID

    # 完了済みタスクを取得
    log("Supabase から完了タスク取得中...")
    tasks = fetch_completed_tasks(env)
    log(f"完了タスク数: {len(tasks)}")

    if not tasks:
        log("完了タスクなし — 終了")
        return

    # 月別にグループ化
    monthly = {}  # { "2026-04": [task, ...] }
    for t in tasks:
        completed = get_completed_date(t)
        month = get_month_key(completed)
        if month not in monthly:
            monthly[month] = []
        monthly[month].append(t)

    log(f"月別グループ: {', '.join(f'{k}({len(v)}件)' for k, v in sorted(monthly.items()))}")

    if DRY_RUN:
        for month, mtasks in sorted(monthly.items()):
            total_sec = sum(t.get("elapsed_sec", 0) or 0 for t in mtasks)
            log(f"[dry-run] {month}: {len(mtasks)}件, 合計 {fmt_duration(total_sec)}")
        return

    # 既存タブを確認
    tabs = get_existing_tabs(access_token, spreadsheet_id)

    # 月別タブにデータ書き込み
    for month, mtasks in sorted(monthly.items()):
        tab_title = month  # "2026-04"

        # 既存タブの記録済みIDを取得
        existing_ids = set()
        if tab_title in tabs and not FORCE:
            existing_rows = read_tab_values(access_token, spreadsheet_id, tab_title)
            for row in existing_rows[1:]:  # ヘッダー除く
                if len(row) >= 6:  # タスクID列
                    existing_ids.add(row[5])
            vlog(f"{tab_title}: 既存 {len(existing_ids)} 件")

        # 作業時間0のタスクは除外
        mtasks = [t for t in mtasks if (t.get("elapsed_sec") or 0) > 0]
        if not mtasks:
            vlog(f"{tab_title}: 作業時間ありタスクなし — スキップ")
            continue

        # 新規タスクだけフィルタ
        new_tasks = [t for t in mtasks if t.get("id", "") not in existing_ids]
        if not new_tasks and not FORCE:
            vlog(f"{tab_title}: 新規なし — スキップ")
            continue

        # タブがなければ作成
        if tab_title not in tabs:
            sheet_id = add_tab(access_token, spreadsheet_id, tab_title)
            tabs[tab_title] = sheet_id

        # FORCE時は全件書き直し、通常時は追記
        if FORCE or not existing_ids:
            # 全件書き込み
            target_tasks = sorted(mtasks, key=lambda t: get_completed_date(t))
            rows = [RECORD_COLUMNS]
            for t in target_tasks:
                completed = get_completed_date(t)
                client = t.get("client_name") or t.get("project") or ""
                name = t.get("name") or ""
                project = t.get("project") or ""
                elapsed = t.get("elapsed_sec", 0) or 0
                rows.append([completed, client, name, project, fmt_duration(elapsed), t.get("id", "")])

            # クライアント別合計を追加
            rows.append([])
            rows.append(["📊 クライアント別合計"])
            rows.append(["クライアント", "タスク数", "合計時間"])

            client_totals = {}
            for t in target_tasks:
                client = t.get("client_name") or t.get("project") or "(未設定)"
                if client not in client_totals:
                    client_totals[client] = {"count": 0, "seconds": 0}
                client_totals[client]["count"] += 1
                client_totals[client]["seconds"] += (t.get("elapsed_sec", 0) or 0)

            grand_total_sec = 0
            for client, data in sorted(client_totals.items()):
                grand_total_sec += data["seconds"]
                rows.append([client, str(data["count"]), fmt_duration(data["seconds"])])

            rows.append([])
            rows.append(["合計", str(len(target_tasks)), fmt_duration(grand_total_sec)])

            if FORCE and tab_title in tabs:
                clear_tab(access_token, spreadsheet_id, tab_title)
            write_rows(access_token, spreadsheet_id, tab_title, rows)
            format_header(access_token, spreadsheet_id, tabs[tab_title])
            log(f"✅ {tab_title}: {len(target_tasks)}件 書き込み完了")

        else:
            # 追記モード: 既存データを読み直して全件再構築
            all_tasks = sorted(mtasks, key=lambda t: get_completed_date(t))
            rows = [RECORD_COLUMNS]
            for t in all_tasks:
                completed = get_completed_date(t)
                client = t.get("client_name") or t.get("project") or ""
                name = t.get("name") or ""
                project = t.get("project") or ""
                elapsed = t.get("elapsed_sec", 0) or 0
                rows.append([completed, client, name, project, fmt_duration(elapsed), t.get("id", "")])

            # クライアント別合計
            rows.append([])
            rows.append(["📊 クライアント別合計"])
            rows.append(["クライアント", "タスク数", "合計時間"])

            client_totals = {}
            for t in all_tasks:
                client = t.get("client_name") or t.get("project") or "(未設定)"
                if client not in client_totals:
                    client_totals[client] = {"count": 0, "seconds": 0}
                client_totals[client]["count"] += 1
                client_totals[client]["seconds"] += (t.get("elapsed_sec", 0) or 0)

            grand_total_sec = 0
            for client, data in sorted(client_totals.items()):
                grand_total_sec += data["seconds"]
                rows.append([client, str(data["count"]), fmt_duration(data["seconds"])])

            rows.append([])
            rows.append(["合計", str(len(all_tasks)), fmt_duration(grand_total_sec)])

            clear_tab(access_token, spreadsheet_id, tab_title)
            write_rows(access_token, spreadsheet_id, tab_title, rows)
            format_header(access_token, spreadsheet_id, tabs[tab_title])
            log(f"✅ {tab_title}: {len(all_tasks)}件 (新規{len(new_tasks)}件追加) 書き込み完了")

    # サマリータブを更新
    update_summary(access_token, spreadsheet_id, tabs, monthly)

    log("=== 作業実績バックアップ完了 ===")


def update_summary(access_token, spreadsheet_id, tabs, monthly):
    """サマリータブ: 月×クライアント別の合計時間"""
    tab_title = "サマリー"

    if tab_title not in tabs:
        sheet_id = add_tab(access_token, spreadsheet_id, tab_title, index=0)
        tabs[tab_title] = sheet_id
    else:
        clear_tab(access_token, spreadsheet_id, tab_title)

    rows = [["月", "クライアント", "タスク数", "合計時間(h:mm)"]]

    grand_total_sec = 0
    grand_total_count = 0

    for month in sorted(monthly.keys()):
        mtasks = [t for t in monthly[month] if (t.get("elapsed_sec") or 0) > 0]
        if not mtasks:
            continue
        client_totals = {}
        for t in mtasks:
            client = t.get("client_name") or t.get("project") or "(未設定)"
            if client not in client_totals:
                client_totals[client] = {"count": 0, "seconds": 0}
            client_totals[client]["count"] += 1
            client_totals[client]["seconds"] += (t.get("elapsed_sec", 0) or 0)

        month_total_sec = 0
        month_total_count = 0
        for client, data in sorted(client_totals.items()):
            month_total_sec += data["seconds"]
            month_total_count += data["count"]
            rows.append([month, client, str(data["count"]), fmt_duration(data["seconds"])])

        rows.append([f"{month} 合計", "", str(month_total_count), fmt_duration(month_total_sec)])
        rows.append([])

        grand_total_sec += month_total_sec
        grand_total_count += month_total_count

    rows.append(["総合計", "", str(grand_total_count), fmt_duration(grand_total_sec)])

    write_rows(access_token, spreadsheet_id, tab_title, rows)
    format_summary_header(access_token, spreadsheet_id, tabs[tab_title])
    log(f"✅ サマリータブ更新完了")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ バックアップ失敗: {e}", "ERROR")
        import traceback
        traceback.print_exc()
        sys.exit(1)

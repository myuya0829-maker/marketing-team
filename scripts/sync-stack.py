#!/usr/bin/env python3
"""
sync-stack.py — 施策管理シート → Supabase (tasks テーブル) 片方向同期

Stage 1 (2026-04-10):
  - 施策管理シートを読み、担当="松下" の行を Supabase にミラー
  - Stack UI は読み取り専用で表示 (書き戻しなし)

設計:
  - トークン: ~/stack/tokens/ に独立管理 (adgeeks-ops とは分離)
  - Supabase: .env.sync から設定
  - 自然キー: "{月}::{クライアント名}::{施策内容}"
  - Orphan: シートから消えた行は task_type='sheet_orphan' (論理削除)
  - Lock: 並行実行防止

使い方:
  python3 sync-stack.py [--dry-run] [--verbose]

Exit code:
  0 = 成功 (差分 0 を含む)
  1 = エラー (リトライ推奨)
  2 = 設定ミス (リトライ無意味)
"""

import os
import sys
import json
import time
import fcntl
import hashlib
import datetime
import argparse
import traceback
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import HTTPError, URLError

# === パス定数 ===
STACK_ROOT = Path(__file__).resolve().parent.parent
TOKENS_DIR = STACK_ROOT / "tokens"
LOGS_DIR = STACK_ROOT / "logs"
LOCK_FILE = LOGS_DIR / "sync.lock"
LOG_FILE = LOGS_DIR / "sync.log"
ENV_SYNC_FILE = STACK_ROOT / ".env.sync"

# === シート定数 ===
MASTER_SHEET_ID = "1UJCwnvxI1kaF6qYJvWB-dIWFiXq-FzHFgHifHmYTtfo"
MEASURES_RANGE = "施策管理!A2:K1000"
ARTICLES_RANGE = "記事管理!A3:H251"   # 行3 がヘッダー
REPORTS_RANGE = "レポート管理!A3:G1000"  # 行3 がヘッダー
TARGET_ASSIGNEE = "松下"  # このユーザーのタスクだけ同期
USER_ID = "anonymous"  # Stack の固定ユーザー

# task_type マッピング (Phase J-1, 2026-04-10)
# シート由来の行を既存 Stack UI の task_type に自動振り分けする:
#   - 依頼先 が自分以外 → delegation   (👥 依頼 / 🔄 進行中 の統合タブ)
#   - ステータス='進行中' → inprogress (🔄 進行中)
#   - それ以外           → daily       (📅 今日 / 📋 一覧)
# Phase K (2026-04-10): 記事管理 → 'article' (view-only)
# Phase L (2026-04-10): レポート管理 → 'report' (Stack 編集可)
SHEET_SOURCED_TASK_TYPES = {"daily", "inprogress", "delegation", "article", "report"}
ORPHAN_TASK_TYPE = "sheet_orphan"

# sheet_key prefix (ソース判別用)
ARTICLE_KEY_PREFIX = "article::"
REPORT_KEY_PREFIX = "report::"


def determine_task_type(sheet_row):
    """施策管理シート行 → Stack の既存 task_type に自動振り分け"""
    ball = sheet_row.get("依頼先", "").strip()
    status = sheet_row.get("ステータス", "").strip()
    # 依頼先が自分以外 → delegation
    if ball and ball != TARGET_ASSIGNEE:
        return "delegation"
    # ステータス='進行中' → inprogress
    if status == "進行中":
        return "inprogress"
    return "daily"

# === グローバル設定 (起動時に上書き) ===
DRY_RUN = False
VERBOSE = False
WRITEBACK = False  # --writeback でレポートの Stack 値をシートに逆同期


# ============================================================
# ログ
# ============================================================

def log(msg, level="INFO"):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [{level}] {msg}"
    print(line, flush=True)
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def vlog(msg):
    if VERBOSE:
        log(msg, "DEBUG")


# ============================================================
# 環境変数読み込み (.env.sync)
# ============================================================

def load_env_sync():
    """シンプルな .env パーサー。KEY=VALUE 形式のみ。"""
    if not ENV_SYNC_FILE.exists():
        log(f".env.sync が見つかりません: {ENV_SYNC_FILE}", "ERROR")
        sys.exit(2)
    env = {}
    for line in ENV_SYNC_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    required = ["SUPABASE_URL", "SUPABASE_KEY"]
    missing = [k for k in required if k not in env]
    if missing:
        log(f".env.sync に必須キー欠損: {missing}", "ERROR")
        sys.exit(2)
    return env


# ============================================================
# Google OAuth トークン管理
# ============================================================

def get_access_token():
    """Refresh token を使って access token を取得。
    トークンファイルは ~/stack/tokens/ に独立管理 (adgeeks-ops は読まない)。
    """
    token_file = TOKENS_DIR / ".google-tokens-stack.json"
    oauth_file = TOKENS_DIR / ".google-oauth.json"
    if not token_file.exists():
        log(f"トークンファイル未配置: {token_file}", "ERROR")
        log("Phase F-3 の初回トークンコピーが未実施の可能性", "ERROR")
        sys.exit(2)
    if not oauth_file.exists():
        log(f"OAuth client 設定未配置: {oauth_file}", "ERROR")
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

    try:
        resp = urlopen(req, timeout=30)
        result = json.loads(resp.read())
    except HTTPError as e:
        body = e.read().decode()
        log(f"Token refresh HTTP {e.code}: {body}", "ERROR")
        sys.exit(1)
    except URLError as e:
        log(f"Token refresh network error: {e}", "ERROR")
        sys.exit(1)

    tokens["access_token"] = result["access_token"]
    if "refresh_token" in result:
        tokens["refresh_token"] = result["refresh_token"]
    # 書き込みは個人側のみ (adgeeks-ops には触らない)
    if not DRY_RUN:
        token_file.write_text(json.dumps(tokens, indent=2))
        os.chmod(token_file, 0o600)
    vlog("Access token refreshed")
    return result["access_token"]


# ============================================================
# Google Sheets API
# ============================================================

def _read_sheet_range(access_token, range_str, headers, header_row_offset):
    """汎用シート読み取り。

    headers: 期待ヘッダー (順序固定)
    header_row_offset: シート上のヘッダー行番号 (1-indexed) ※ row_num 計算用
                       row_num はヘッダー直下のデータ行を 1 として連番に。
    """
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{MASTER_SHEET_ID}/values/{quote(range_str)}"
    req = Request(url)
    req.add_header("Authorization", f"Bearer {access_token}")
    try:
        resp = urlopen(req, timeout=30)
    except HTTPError as e:
        body = e.read().decode()
        log(f"Sheets API HTTP {e.code} ({range_str}): {body}", "ERROR")
        sys.exit(1)

    result = json.loads(resp.read())
    rows = result.get("values", [])
    parsed = []
    for i, row in enumerate(rows):
        while len(row) < len(headers):
            row.append("")
        entry = {"row_num": header_row_offset + 1 + i}
        for j, h in enumerate(headers):
            entry[h] = row[j].strip() if isinstance(row[j], str) else row[j]
        parsed.append(entry)
    return parsed


def read_measures_sheet(access_token):
    """施策管理タブの全行を読み取り、辞書リストで返す。"""
    # 施策管理は範囲が A2:K1000 (ヘッダー無しでデータ直書き)
    headers = ["クライアント名", "施策内容", "カテゴリ", "優先度", "ステータス",
               "担当", "依頼先", "期限", "完了日", "月", "出典"]
    return _read_sheet_range(access_token, MEASURES_RANGE, headers, header_row_offset=1)


def read_articles_sheet(access_token):
    """記事管理タブの全行を読み取り、辞書リストで返す。
    範囲: A4:H251 (ヘッダーは行3)
    """
    headers = ["クライアント", "KW", "ステータス", "担当",
               "構成案URL", "記事URL", "月", "構成指示"]
    # 範囲を A4:H251 に切り替え (ヘッダー行3を除外)
    range_str = ARTICLES_RANGE.replace("!A3:", "!A4:")
    return _read_sheet_range(access_token, range_str, headers, header_row_offset=3)


def read_reports_sheet(access_token):
    """レポート管理タブの全行を読み取り、辞書リストで返す。
    範囲: A4:G1000 (ヘッダーは行3)
    """
    headers = ["クライアント", "対象月", "データ取得", "レポート生成",
               "レビュー", "送信", "備考"]
    range_str = REPORTS_RANGE.replace("!A3:", "!A4:")
    return _read_sheet_range(access_token, range_str, headers, header_row_offset=3)


# ============================================================
# Supabase REST API
# ============================================================

def supabase_request(env, method, path, body=None, headers_extra=None):
    """Supabase PostgREST へのリクエスト汎用ラッパー。"""
    url = env["SUPABASE_URL"].rstrip("/") + path
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    req = Request(url, data=data, method=method)
    req.add_header("apikey", env["SUPABASE_KEY"])
    req.add_header("Authorization", f"Bearer {env['SUPABASE_KEY']}")
    req.add_header("Content-Type", "application/json")
    if headers_extra:
        for k, v in headers_extra.items():
            req.add_header(k, v)
    try:
        resp = urlopen(req, timeout=30)
        body_bytes = resp.read()
        if body_bytes:
            return json.loads(body_bytes)
        return None
    except HTTPError as e:
        err_body = e.read().decode()
        log(f"Supabase HTTP {e.code} {method} {path}: {err_body}", "ERROR")
        raise
    except URLError as e:
        log(f"Supabase network error {method} {path}: {e}", "ERROR")
        raise


def fetch_existing_sheet_tasks(env):
    """sheet_key IS NOT NULL の既存行を全取得。

    Phase J 以降、sheet 由来行は task_type='daily'|'inprogress'|'delegation'|'sheet_orphan' に
    分散するため、sheet_key の有無で識別する。
    """
    path = (
        f"/rest/v1/tasks"
        f"?user_id=eq.{USER_ID}"
        f"&sheet_key=not.is.null"
        f"&select=id,sheet_key,task_type,sheet_row_num,sheet_synced_at,"
        f"name,status,assignee,ball_holder,deadline,completed_at,done,month,"
        f"client_name,project,sheet_category,sheet_priority,sheet_source_col,"
        f"kw,outline_url,article_url,outline_instructions,"
        f"report_data,report_gen,report_review_url,report_send,report_note"
    )
    data = supabase_request(env, "GET", path)
    return data or []


# ============================================================
# 変換ロジック (Sheet row → Supabase row)
# ============================================================

def make_sheet_key(sheet_row):
    """安定自然キー: '{月}::{クライアント名}::{施策内容}'"""
    month = sheet_row.get("月", "").strip()
    client = sheet_row.get("クライアント名", "").strip()
    content = sheet_row.get("施策内容", "").strip()
    return f"{month}::{client}::{content}"


def parse_date(s):
    """Sheet の日付文字列 (YYYY/MM/DD, YYYY-MM-DD 等) → ISO date / None"""
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    # 許容フォーマット
    fmts = ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y年%m月%d日"]
    for f in fmts:
        try:
            return datetime.datetime.strptime(s, f).date().isoformat()
        except ValueError:
            continue
    vlog(f"日付パース失敗: '{s}'")
    return None


def sheet_row_to_task(sheet_row, now_iso):
    """Sheet row → Supabase tasks テーブルの行 (insert/update 用)"""
    completed_str = sheet_row.get("完了日", "").strip()
    completed_iso = parse_date(completed_str)
    deadline_iso = parse_date(sheet_row.get("期限", ""))
    task_type = determine_task_type(sheet_row)

    # ball_holder: Stack UI は固定語彙 ('self'/'worker'/'client'/'engineer'/'designer') を使うが
    # シートの「依頼先」はフリーテキスト。ここではシートの値をそのまま格納する。
    # 自分(松下) が依頼先の場合は self 扱いで null とする。
    raw_ball = sheet_row.get("依頼先", "").strip()
    if not raw_ball or raw_ball == TARGET_ASSIGNEE:
        ball_holder = "self"
    else:
        ball_holder = raw_ball  # フリーテキスト (藤田/山岸/作業者/etc)

    return {
        "user_id": USER_ID,
        "task_type": task_type,
        "sheet_key": make_sheet_key(sheet_row),
        "sheet_row_num": sheet_row.get("row_num"),
        "sheet_synced_at": now_iso,
        "name": sheet_row.get("施策内容", "") or "",
        "client_name": sheet_row.get("クライアント名", "") or None,
        "project": sheet_row.get("クライアント名", "") or None,  # 既存コード互換
        "assignee": sheet_row.get("担当", "") or None,
        "ball_holder": ball_holder,
        "status": sheet_row.get("ステータス", "") or None,
        "deadline": deadline_iso,
        "completed_at": completed_iso,
        "done": bool(completed_iso),
        "month": sheet_row.get("月", "") or None,
        "sheet_category": sheet_row.get("カテゴリ", "") or None,
        "sheet_priority": sheet_row.get("優先度", "") or None,
        "sheet_source_col": sheet_row.get("出典", "") or None,
        # task_date は null 不許可なのでデフォルト値: 期限 or 今日
        "task_date": deadline_iso or datetime.date.today().isoformat(),
    }


# Phase J-5 (2026-04-10):
# Stack 保持フィールド = ユーザーが Stack UI で操作するフィールド。
# シート由来の行でも、これらは sync で上書きしない (done は一方向アップグレードのみ)。
#   - done / completed_at: ユーザーが Stack で完了チェック → EOD に Claude Code が
#     シートへ書き戻す。シートで done=true なら Stack にも反映 (upgrade only)。
#   - ball_holder: inprogress/daily は Stack でサイクル (self↔worker↔engineer等)。
#     delegation は シート の 依頼先 が真実なので毎回上書き。
STACK_OWNED_FIELDS = {"done", "completed_at", "task_date"}

# 比較対象カラム (sync 制御カラム以外)
DIFF_FIELDS = ["name", "client_name", "project", "assignee", "ball_holder",
               "status", "deadline", "completed_at", "done", "month",
               "sheet_category", "sheet_priority", "sheet_source_col",
               "task_type", "sheet_row_num"]


def ball_holder_is_stack_owned(task_type):
    """ball_holder を Stack 側で保持すべきか (True なら sync 対象外)"""
    # delegation は シート 依頼先 が真実。それ以外 (inprogress/daily) は Stack 保持。
    return task_type != "delegation"


def task_diff(existing, proposed):
    """既存行と提案行の差分 (Stack 保持フィールドは除外)。True=変更あり。"""
    proposed_type = proposed.get("task_type")
    changes = {}
    for f in DIFF_FIELDS:
        # Stack 保持フィールドは差分判定しない
        if f in STACK_OWNED_FIELDS:
            # done は一方向アップグレードのみ: シートで新規完了した場合のみ差分扱い
            if f == "done" and proposed.get("done") and not existing.get("done"):
                changes[f] = (existing.get(f), proposed.get(f))
            if f == "completed_at" and proposed.get("done") and not existing.get("done"):
                ev = existing.get(f)
                pv = proposed.get(f)
                if ev != pv:
                    changes[f] = (ev, pv)
            continue
        if f == "ball_holder" and ball_holder_is_stack_owned(proposed_type):
            continue
        ev = existing.get(f)
        pv = proposed.get(f)
        # 日付の場合は文字列として比較 (Supabase から返る ISO datetime と自前 date string の違いを吸収)
        if f in ("deadline", "completed_at") and ev and pv:
            if str(ev).startswith(str(pv)):  # '2026-04-10T00:00:00+00:00' starts with '2026-04-10'
                continue
        if ev != pv:
            changes[f] = (ev, pv)
    return changes


def build_update_body(existing_row, proposed):
    """PATCH body を構築。Stack 保持フィールドを除外し、
    done は一方向アップグレード (シート → Stack) のみ許可する。
    """
    body = dict(proposed)  # copy
    proposed_type = proposed.get("task_type")

    # done / completed_at: 一方向アップグレードのみ
    # シートで新規完了 (既存 done=false、新 done=true) → 反映
    # それ以外 → 既存値保持 (PATCH から除外)
    sheet_newly_done = proposed.get("done") and not existing_row.get("done")
    if not sheet_newly_done:
        body.pop("done", None)
        body.pop("completed_at", None)

    # task_date: Stack 保持 (完了日ベースで管理するため sync で上書きしない)
    body.pop("task_date", None)

    # ball_holder: delegation 以外は Stack 保持
    if ball_holder_is_stack_owned(proposed_type):
        body.pop("ball_holder", None)

    return body


# ============================================================
# Phase K: 記事管理 (view-only)
# ============================================================

ARTICLE_DIFF_FIELDS = ["name", "client_name", "project", "assignee", "ball_holder",
                      "status", "done", "month", "task_type", "sheet_row_num",
                      "kw", "outline_url", "article_url", "outline_instructions"]

# 記事ステータスの遷移順 (構成完了率の表示や完了判定用)
ARTICLE_STATUS_ORDER = ["構成中", "構成完了", "承認済み", "執筆中",
                        "執筆完了", "チェック済み", "入稿完了"]


def make_article_key(sheet_row):
    """記事の自然キー: 'article::{月}::{クライアント}::{KW}'"""
    month = sheet_row.get("月", "").strip()
    client = sheet_row.get("クライアント", "").strip()
    kw = sheet_row.get("KW", "").strip()
    return f"{ARTICLE_KEY_PREFIX}{month}::{client}::{kw}"


def article_row_to_task(sheet_row, now_iso):
    """記事管理 sheet row → tasks 行 (view-only, sheet が真実)"""
    status = sheet_row.get("ステータス", "").strip()
    is_done = (status == "入稿完了")
    return {
        "user_id": USER_ID,
        "task_type": "article",
        "sheet_key": make_article_key(sheet_row),
        "sheet_row_num": sheet_row.get("row_num"),
        "sheet_synced_at": now_iso,
        "name": sheet_row.get("KW", "") or "",
        "client_name": sheet_row.get("クライアント", "") or None,
        "project": sheet_row.get("クライアント", "") or None,
        "assignee": sheet_row.get("担当", "") or None,
        "ball_holder": sheet_row.get("担当", "") or None,
        "status": status or None,
        "done": is_done,
        "completed_at": now_iso[:10] if is_done else None,
        "month": sheet_row.get("月", "") or None,
        "kw": sheet_row.get("KW", "") or None,
        "outline_url": sheet_row.get("構成案URL", "") or None,
        "article_url": sheet_row.get("記事URL", "") or None,
        "outline_instructions": sheet_row.get("構成指示", "") or None,
        "task_date": datetime.date.today().isoformat(),
    }


def article_diff(existing, proposed):
    """記事は view-only なので全フィールド単純比較 (Stack 保持なし)"""
    changes = {}
    for f in ARTICLE_DIFF_FIELDS:
        ev = existing.get(f)
        pv = proposed.get(f)
        if ev != pv:
            changes[f] = (ev, pv)
    return changes


# ============================================================
# Phase L: レポート管理 (Stack 編集可)
# ============================================================

# レポートの sheet → Stack 同期対象フィールド
# 注: report_data, report_gen, report_send は Stack が真実 (松下が編集する) ので除外。
#     初回 insert 時のみシート値をコピー、以降は Stack の値を保持。
#     report_review_url / report_note / month / client_name はシート側で管理されるのが自然なので含める。
REPORT_DIFF_FIELDS = ["name", "client_name", "project", "month",
                     "task_type", "sheet_row_num",
                     "report_review_url", "report_note"]


def make_report_key(sheet_row):
    """レポートの自然キー: 'report::{対象月}::{クライアント}'"""
    month = sheet_row.get("対象月", "").strip()
    client = sheet_row.get("クライアント", "").strip()
    return f"{REPORT_KEY_PREFIX}{month}::{client}"


def report_row_to_task(sheet_row, now_iso):
    """レポート管理 sheet row → tasks 行 (Stack 編集可)"""
    client = sheet_row.get("クライアント", "").strip()
    month = sheet_row.get("対象月", "").strip()
    send_status = sheet_row.get("送信", "").strip()
    is_done = (send_status == "完了")
    return {
        "user_id": USER_ID,
        "task_type": "report",
        "sheet_key": make_report_key(sheet_row),
        "sheet_row_num": sheet_row.get("row_num"),
        "sheet_synced_at": now_iso,
        "name": f"{client} {month} レポート" if client else (month + " レポート"),
        "client_name": client or None,
        "project": client or None,
        "assignee": TARGET_ASSIGNEE,
        "ball_holder": "self",
        "status": None,
        "done": is_done,
        "completed_at": now_iso[:10] if is_done else None,
        "month": month or None,
        "report_data": sheet_row.get("データ取得", "") or None,
        "report_gen": sheet_row.get("レポート生成", "") or None,
        "report_review_url": sheet_row.get("レビュー", "") or None,
        "report_send": send_status or None,
        "report_note": sheet_row.get("備考", "") or None,
        "task_date": datetime.date.today().isoformat(),
    }


def report_diff(existing, proposed):
    """レポートは done のみ Stack 保持 (一方向アップグレード)"""
    changes = {}
    for f in REPORT_DIFF_FIELDS:
        ev = existing.get(f)
        pv = proposed.get(f)
        if ev != pv:
            changes[f] = (ev, pv)
    # done は一方向アップグレード
    if proposed.get("done") and not existing.get("done"):
        changes["done"] = (existing.get("done"), proposed.get("done"))
        if existing.get("completed_at") != proposed.get("completed_at"):
            changes["completed_at"] = (existing.get("completed_at"), proposed.get("completed_at"))
    return changes


def build_report_update_body(existing_row, proposed):
    """レポートの PATCH body:
    - done は一方向アップグレード (sheet で完了になったときのみ Stack に反映)
    - report_data / report_gen / report_send は Stack が真実なので body から除外
      (sheet 側の他フィールドが変更されたとき巻き添えで上書きされないように)
    """
    body = dict(proposed)
    sheet_newly_done = proposed.get("done") and not existing_row.get("done")
    if not sheet_newly_done:
        body.pop("done", None)
        body.pop("completed_at", None)
    # Stack-owned stage fields は絶対に PATCH しない
    body.pop("report_data", None)
    body.pop("report_gen", None)
    body.pop("report_send", None)
    return body


# ============================================================
# メイン Sync ロジック
# ============================================================

def _apply_writes(env, label, to_insert, to_update, to_revive, to_orphan, now_iso):
    """共通の書き込み処理 (insert / update / revive / orphan)"""
    if VERBOSE:
        for row in to_insert:
            vlog(f"  [{label}] INSERT {row['sheet_key']} '{(row.get('name') or '')[:30]}'")
        for _id, _prop, changes in to_update:
            vlog(f"  [{label}] UPDATE id={_id} changes={list(changes.keys())}")
        for _id, _prop in to_revive:
            vlog(f"  [{label}] REVIVE id={_id} ({_prop['sheet_key']})")
        for _id in to_orphan:
            vlog(f"  [{label}] ORPHAN id={_id}")

    if DRY_RUN:
        log(f"[{label}] DRY RUN — 書き込みスキップ")
        return

    if to_insert:
        try:
            supabase_request(env, "POST", "/rest/v1/tasks",
                             body=to_insert,
                             headers_extra={"Prefer": "return=minimal"})
            log(f"✅ [{label}] insert {len(to_insert)} 件")
        except Exception as e:
            log(f"❌ [{label}] insert 失敗: {e}", "ERROR")

    for task_id, body, _changes in to_update:
        try:
            supabase_request(env, "PATCH",
                             f"/rest/v1/tasks?id=eq.{task_id}",
                             body=body,
                             headers_extra={"Prefer": "return=minimal"})
        except Exception as e:
            log(f"❌ [{label}] update id={task_id} 失敗: {e}", "ERROR")
    if to_update:
        log(f"✅ [{label}] update {len(to_update)} 件")

    for task_id, body in to_revive:
        try:
            supabase_request(env, "PATCH",
                             f"/rest/v1/tasks?id=eq.{task_id}",
                             body=body,
                             headers_extra={"Prefer": "return=minimal"})
        except Exception as e:
            log(f"❌ [{label}] revive id={task_id} 失敗: {e}", "ERROR")
    if to_revive:
        log(f"✅ [{label}] revive {len(to_revive)} 件 (orphan → sheet)")

    for task_id in to_orphan:
        try:
            supabase_request(env, "PATCH",
                             f"/rest/v1/tasks?id=eq.{task_id}",
                             body={"task_type": ORPHAN_TASK_TYPE, "sheet_synced_at": now_iso},
                             headers_extra={"Prefer": "return=minimal"})
        except Exception as e:
            log(f"❌ [{label}] orphan id={task_id} 失敗: {e}", "ERROR")
    if to_orphan:
        log(f"✅ [{label}] orphan 論理削除 {len(to_orphan)} 件")


def _is_measures_key(k):
    """施策管理キー (prefix なし) かどうか"""
    if not k:
        return False
    return not (k.startswith(ARTICLE_KEY_PREFIX) or k.startswith(REPORT_KEY_PREFIX))


def sync_measures(env, access_token, existing_all, now_iso):
    """施策管理シート → tasks 同期 (Phase J)"""
    log("Sheets API から施策管理シート取得中...")
    all_rows = read_measures_sheet(access_token)
    log(f"[施策] Sheet 全行数: {len(all_rows)}")

    mine = [r for r in all_rows if r.get("担当", "").strip() == TARGET_ASSIGNEE]
    log(f"[施策] 担当={TARGET_ASSIGNEE} の行: {len(mine)}")

    sheet_map = {}
    dupes = 0
    for r in mine:
        if not r.get("施策内容", "").strip():
            continue
        key = make_sheet_key(r)
        if key in sheet_map:
            log(f"[施策] 重複キー検出 (初回優先): {key}", "WARN")
            dupes += 1
            continue
        sheet_map[key] = r
    log(f"[施策] 安定キー数: {len(sheet_map)} (重複スキップ: {dupes})")

    # 既存行のうち施策キー (prefix なし) のもの
    existing_map = {r["sheet_key"]: r for r in existing_all
                    if _is_measures_key(r.get("sheet_key"))}

    to_insert, to_update, to_revive, to_orphan = [], [], [], []
    for key, sheet_row in sheet_map.items():
        proposed = sheet_row_to_task(sheet_row, now_iso)
        if key in existing_map:
            existing_row = existing_map[key]
            if existing_row.get("task_type") == ORPHAN_TASK_TYPE:
                to_revive.append((existing_row["id"], proposed))
            else:
                changes = task_diff(existing_row, proposed)
                if changes:
                    update_body = build_update_body(existing_row, proposed)
                    to_update.append((existing_row["id"], update_body, changes))
        else:
            to_insert.append(proposed)

    for key, existing_row in existing_map.items():
        if key in sheet_map:
            continue
        et = existing_row.get("task_type")
        if et in {"daily", "inprogress", "delegation"}:
            to_orphan.append(existing_row["id"])

    log(f"[施策] Diff: insert={len(to_insert)} update={len(to_update)} "
        f"revive={len(to_revive)} orphan={len(to_orphan)}")
    _apply_writes(env, "施策", to_insert, to_update, to_revive, to_orphan, now_iso)


def sync_articles(env, access_token, existing_all, now_iso):
    """記事管理シート → tasks 同期 (Phase K, view-only)"""
    log("Sheets API から記事管理シート取得中...")
    all_rows = read_articles_sheet(access_token)
    log(f"[記事] Sheet 全行数: {len(all_rows)}")

    sheet_map = {}
    dupes = 0
    for r in all_rows:
        if not r.get("KW", "").strip() or not r.get("クライアント", "").strip():
            continue
        key = make_article_key(r)
        if key in sheet_map:
            log(f"[記事] 重複キー検出 (初回優先): {key}", "WARN")
            dupes += 1
            continue
        sheet_map[key] = r
    log(f"[記事] 安定キー数: {len(sheet_map)} (重複スキップ: {dupes})")

    existing_map = {r["sheet_key"]: r for r in existing_all
                    if (r.get("sheet_key") or "").startswith(ARTICLE_KEY_PREFIX)}

    to_insert, to_update, to_revive, to_orphan = [], [], [], []
    for key, sheet_row in sheet_map.items():
        proposed = article_row_to_task(sheet_row, now_iso)
        if key in existing_map:
            existing_row = existing_map[key]
            if existing_row.get("task_type") == ORPHAN_TASK_TYPE:
                to_revive.append((existing_row["id"], proposed))
            else:
                changes = article_diff(existing_row, proposed)
                if changes:
                    # view-only なので body=proposed をそのまま使う
                    to_update.append((existing_row["id"], proposed, changes))
        else:
            to_insert.append(proposed)

    for key, existing_row in existing_map.items():
        if key in sheet_map:
            continue
        if existing_row.get("task_type") == "article":
            to_orphan.append(existing_row["id"])

    log(f"[記事] Diff: insert={len(to_insert)} update={len(to_update)} "
        f"revive={len(to_revive)} orphan={len(to_orphan)}")
    _apply_writes(env, "記事", to_insert, to_update, to_revive, to_orphan, now_iso)


def sync_reports(env, access_token, existing_all, now_iso):
    """レポート管理シート → tasks 同期 (Phase L)"""
    log("Sheets API からレポート管理シート取得中...")
    all_rows = read_reports_sheet(access_token)
    log(f"[レポート] Sheet 全行数: {len(all_rows)}")

    sheet_map = {}
    dupes = 0
    for r in all_rows:
        if not r.get("クライアント", "").strip() or not r.get("対象月", "").strip():
            continue
        key = make_report_key(r)
        if key in sheet_map:
            log(f"[レポート] 重複キー検出 (初回優先): {key}", "WARN")
            dupes += 1
            continue
        sheet_map[key] = r
    log(f"[レポート] 安定キー数: {len(sheet_map)} (重複スキップ: {dupes})")

    existing_map = {r["sheet_key"]: r for r in existing_all
                    if (r.get("sheet_key") or "").startswith(REPORT_KEY_PREFIX)}

    to_insert, to_update, to_revive, to_orphan = [], [], [], []
    for key, sheet_row in sheet_map.items():
        proposed = report_row_to_task(sheet_row, now_iso)
        if key in existing_map:
            existing_row = existing_map[key]
            if existing_row.get("task_type") == ORPHAN_TASK_TYPE:
                to_revive.append((existing_row["id"], proposed))
            else:
                changes = report_diff(existing_row, proposed)
                if changes:
                    update_body = build_report_update_body(existing_row, proposed)
                    to_update.append((existing_row["id"], update_body, changes))
        else:
            to_insert.append(proposed)

    for key, existing_row in existing_map.items():
        if key in sheet_map:
            continue
        if existing_row.get("task_type") == "report":
            to_orphan.append(existing_row["id"])

    log(f"[レポート] Diff: insert={len(to_insert)} update={len(to_update)} "
        f"revive={len(to_revive)} orphan={len(to_orphan)}")
    _apply_writes(env, "レポート", to_insert, to_update, to_revive, to_orphan, now_iso)


def writeback_reports(env, access_token):
    """[Phase L EOD] レポートの Stack stage 値をシートに逆同期。

    シート列マッピング (1-indexed):
      A=クライアント / B=対象月 / C=データ取得 / D=レポート生成 /
      E=レビュー / F=送信 / G=備考

    Stack で更新できるのは C / D / F の 3 列のみ。
    sheet_row_num は _read_sheet_range で実シート行番号 (1-indexed) を入れている
    ので、そのまま batchUpdate の range で使える。
    """
    log("[writeback] Stack → シート逆同期を開始")

    # 1. Stack 側の最新レポートを取得 (sheet_key, sheet_row_num, stages)
    rows = supabase_request(
        env, "GET",
        f"/rest/v1/tasks?user_id=eq.{USER_ID}&task_type=eq.report"
        f"&select=id,sheet_key,sheet_row_num,client_name,month,"
        f"report_data,report_gen,report_send",
    )
    if not rows:
        log("[writeback] Stack 側にレポート行なし — skip")
        return

    # 2. シート側の現在値を取得 (シートが既に同じ値なら書かない)
    sheet_rows = read_reports_sheet(access_token)
    sheet_by_key = {make_report_key(r): r for r in sheet_rows}

    # 3. 各 Stack 行を比較し、差分があるものだけ values.batchUpdate に積む
    updates = []  # [(range, value)]
    skipped = 0
    for r in rows:
        skey = r.get("sheet_key")
        row_num = r.get("sheet_row_num")
        if not skey or not row_num:
            continue
        sheet_row = sheet_by_key.get(skey)
        if not sheet_row:
            vlog(f"  [writeback] sheet 側に存在しない sheet_key: {skey} (skip)")
            continue
        sheet_excel_row = row_num  # row_num は既に実シート行番号

        def push(col_letter, sheet_field, stack_field):
            stack_v = (r.get(stack_field) or "").strip()
            sheet_v = (sheet_row.get(sheet_field) or "").strip()
            if stack_v != sheet_v:
                updates.append((
                    f"レポート管理!{col_letter}{sheet_excel_row}",
                    stack_v,
                    f"{sheet_field}: '{sheet_v}' → '{stack_v}' ({r.get('client_name')})",
                ))

        push("C", "データ取得", "report_data")
        push("D", "レポート生成", "report_gen")
        push("F", "送信", "report_send")
        if not any(u[0].endswith(f"{sheet_excel_row}") for u in updates[-3:]):
            skipped += 1

    log(f"[writeback] 差分: {len(updates)} セル / 更新候補")

    if VERBOSE or DRY_RUN:
        for _r, _v, desc in updates:
            log(f"  [writeback] {desc}", "INFO")

    if DRY_RUN:
        log("[writeback] DRY RUN — シート書き込みスキップ")
        return
    if not updates:
        log("[writeback] 差分なし — skip")
        return

    # 4. Sheets values.batchUpdate に POST
    body = {
        "valueInputOption": "USER_ENTERED",
        "data": [{"range": rng, "values": [[val]]} for rng, val, _ in updates],
    }
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{MASTER_SHEET_ID}/values:batchUpdate"
    req = Request(url, data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urlopen(req, timeout=30)
        result = json.loads(resp.read())
        log(f"✅ [writeback] {result.get('totalUpdatedCells', 0)} セル更新")
    except HTTPError as e:
        body_txt = e.read().decode()
        log(f"❌ [writeback] Sheets HTTP {e.code}: {body_txt}", "ERROR")


def sync(env):
    """3つのシート (施策/記事/レポート) を順次同期"""
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    access_token = get_access_token()

    log("Supabase から既存 sheet 行取得中...")
    existing_all = fetch_existing_sheet_tasks(env)
    log(f"Supabase 既存 sheet 行数: {len(existing_all)}")

    sync_measures(env, access_token, existing_all, now_iso)
    sync_articles(env, access_token, existing_all, now_iso)
    sync_reports(env, access_token, existing_all, now_iso)

    if WRITEBACK:
        writeback_reports(env, access_token)

    log("✅ sync 完了 (施策+記事+レポート" + (" + writeback" if WRITEBACK else "") + ")")


# ============================================================
# 並行実行防止 (flock)
# ============================================================

def acquire_lock():
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd.write(str(os.getpid()))
        fd.flush()
        return fd
    except BlockingIOError:
        fd.close()
        return None


# ============================================================
# エントリポイント
# ============================================================

def main():
    global DRY_RUN, VERBOSE, WRITEBACK
    parser = argparse.ArgumentParser(description="施策/記事/レポートシート ⇄ Supabase 同期")
    parser.add_argument("--dry-run", action="store_true", help="書き込みせず差分のみ表示")
    parser.add_argument("--verbose", action="store_true", help="詳細ログ出力")
    parser.add_argument("--writeback", action="store_true",
                        help="レポートの Stack 値をシートに逆同期 (EOD 用、デフォルト OFF)")
    args = parser.parse_args()
    DRY_RUN = args.dry_run
    VERBOSE = args.verbose
    WRITEBACK = args.writeback

    log(f"=== sync-stack.py 開始 (dry_run={DRY_RUN}, verbose={VERBOSE}, writeback={WRITEBACK}) ===")

    lock_fd = acquire_lock()
    if lock_fd is None:
        log("他の sync が実行中 (lock 取得失敗) — skip", "WARN")
        sys.exit(0)

    try:
        env = load_env_sync()
        sync(env)
    except SystemExit:
        raise
    except Exception as e:
        log(f"予期せぬ例外: {e}", "ERROR")
        log(traceback.format_exc(), "ERROR")
        sys.exit(1)
    finally:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()
            LOCK_FILE.unlink(missing_ok=True)
        except Exception:
            pass


if __name__ == "__main__":
    main()

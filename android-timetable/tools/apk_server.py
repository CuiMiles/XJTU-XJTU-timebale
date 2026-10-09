#!/usr/bin/env python3
"""Serve a fixed public APK allowlist and an anonymous first-open counter."""

import argparse
import base64
import hashlib
import hmac
import html
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from download_stats import DownloadStats


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
LOGO = ROOT / "app/src/main/res/drawable-nodpi/xiaojiao_logo.png"
STATS = DownloadStats()
ADMIN_PASSWORD_FILE = Path.home() / ".local/share/xiaojiao-timetable/admin_password"
TEST_DEVICES_FILE = Path.home() / ".local/share/xiaojiao-timetable/test_devices.json"


def test_device_ips():
    try:
        value = json.loads(TEST_DEVICES_FILE.read_text())
        return validated_test_ips(value)
    except (OSError, ValueError, TypeError):
        return []


def validated_test_ips(value):
    if not isinstance(value, dict) or set(value) != {"ips"} or not isinstance(value["ips"], list) or len(value["ips"]) > 32:
        raise ValueError("invalid test devices")
    result = []
    for item in value["ips"]:
        if not isinstance(item, str):
            raise ValueError("invalid test IP")
        address = ipaddress.ip_address(item.strip())
        if not address.is_private or address.is_multicast or address.is_unspecified:
            raise ValueError("only private test addresses are allowed")
        result.append(str(address))
    return sorted(set(result))


def save_test_devices(value):
    ips = validated_test_ips(value)
    TEST_DEVICES_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    pending = TEST_DEVICES_FILE.with_suffix(".tmp")
    fd = os.open(str(pending), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump({"ips": ips}, stream)
    os.replace(str(pending), str(TEST_DEVICES_FILE))


def testing_client(ip):
    return ip in ("127.0.0.1", "::1") or ip in test_device_ips()


def published_apk(testing=False):
    digest_file = DIST / ("test-sha256.txt" if testing else "sha256.txt")
    if not digest_file.is_file():
        raise FileNotFoundError("APK is not built")
    match = re.fullmatch(
        r"([0-9a-f]{64})  (xiaojiao-timetable-[0-9A-Za-z.+_-]+\.apk)\s*",
        digest_file.read_text(),
    )
    if match is None:
        raise ValueError("invalid published APK metadata")
    digest, filename = match.groups()
    if testing and "-test." not in filename:
        raise ValueError("test channel requires a test version")
    file = DIST / filename
    if not file.is_file() or file.resolve().parent != DIST.resolve():
        raise FileNotFoundError("published APK is missing")
    return digest, filename, file


def admin_password():
    ADMIN_PASSWORD_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        return ADMIN_PASSWORD_FILE.read_text().strip()
    except FileNotFoundError:
        password = secrets.token_urlsafe(24)
        try:
            fd = os.open(str(ADMIN_PASSWORD_FILE), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            return ADMIN_PASSWORD_FILE.read_text().strip()
        with os.fdopen(fd, "w") as stream:
            stream.write(password + "\n")
        return password


def admin_page(query):
    try:
        page = max(1, int(parse_qs(query).get("page", ["1"])[0]))
    except ValueError:
        page = 1
    page = min(page, 100000)
    unique_ips, total, rows = STATS.overview(page=page)
    activations, activation_ips, activation_rows = STATS.activation_overview(page=page)
    table_rows = "".join(
        "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(
            html.escape(ip), count,
            time.strftime("%Y-%m-%d %H:%M", time.localtime(first_at)),
            time.strftime("%Y-%m-%d %H:%M", time.localtime(last_at)),
        ) for ip, count, first_at, last_at in rows
    )
    if not table_rows:
        table_rows = '<tr><td colspan="4">暂无下载记录</td></tr>'
    activation_table = "".join(
        "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(
            html.escape(ip), count,
            time.strftime("%Y-%m-%d %H:%M", time.localtime(first_at)),
            time.strftime("%Y-%m-%d %H:%M", time.localtime(last_at)),
        ) for ip, count, first_at, last_at in activation_rows
    ) or '<tr><td colspan="4">暂无首次打开记录</td></tr>'
    previous = '<a href="/admin?page={}">上一页</a>'.format(page - 1) if page > 1 else ""
    following = '<a href="/admin?page={}">下一页</a>'.format(page + 1) if page * 100 < max(unique_ips, activation_ips) else ""
    try:
        _, test_name, _ = published_apk(testing=True)
        test_info = '已发布 {}。<a href="/test/version.json">检查测试版更新</a>'.format(html.escape(test_name))
    except (OSError, ValueError):
        test_info = "尚未发布测试版"
    devices = html.escape("\n".join(test_device_ips()))
    test_panel = """<h2>管理员测试更新</h2><p>{}</p>
<p>填管理员手机当前校园网 IP（每行一个）。这些手机的现有 App 点击检查更新会获取测试版，其他手机继续获取正式版。手机 IP 变化后需在此更新；共用同一出口 IP 的设备可能获得相同通道。</p>
<textarea id="test-devices" rows="4" style="width:100%;box-sizing:border-box">{}</textarea>
<button id="save-test-devices" type="button">保存测试设备</button><span id="test-result"></span>
<script src="/admin-ui.js" defer></script>""".format(test_info, devices)
    return """<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>小交课表 · 下载统计</title>
<style>body{{font-family:system-ui,sans-serif;color:#273449;background:#f5f8fc;margin:0;padding:24px}}
main{{max-width:900px;margin:auto;background:#fff;padding:24px;border-radius:16px}}
h1{{font-size:23px}}p{{color:#758196}}table{{width:100%;border-collapse:collapse}}
th,td{{padding:10px;text-align:left;border-bottom:1px solid #e7ebf0}}
th{{background:#f6f8fb}}nav{{display:flex;gap:20px;margin-top:18px}}a{{color:#527fb6}}
</style><main><h1>小交课表 · 使用统计</h1>
<p>校园网 APK 下载：{} 次（{} 个 IP）　首次打开：{} 次（{} 个 IP）</p>
<p>下载只统计本服务成功发送的 APK；网盘下载不在此列。首次打开按随机安装 ID 去重，需手机曾连通校园网；它代表激活，不等于网盘下载量。旧版用户升级后的首次打开也计入。</p>
<h2>校园网下载</h2>
<p>仅统计非本机 IP 的完整 APK 响应或续传末段；同一 IP、同一版本 30 秒内重试合并。</p>
<table><thead><tr><th>IP</th><th>下载次数</th><th>首次下载</th><th>最近下载</th></tr></thead>
<tbody>{}</tbody></table><h2>首次打开</h2>
<table><thead><tr><th>IP</th><th>设备数</th><th>最早记录</th><th>最近记录</th></tr></thead>
<tbody>{}</tbody></table><nav>{} {}</nav>{}</main></html>""".format(
        total, unique_ips, activations, activation_ips,
        table_rows, activation_table, previous, following, test_panel).encode()


ADMIN_SCRIPT = b"""document.getElementById('save-test-devices').addEventListener('click', async function(){
  const result = document.getElementById('test-result');
  const ips = document.getElementById('test-devices').value.split(/\\s+/).filter(Boolean);
  try {
    const response = await fetch('/admin/test-devices', {method:'POST',
      headers:{'Content-Type':'application/json','X-Xiaojiao-Admin':'1'},body:JSON.stringify({ips})});
    result.textContent = response.ok ? '\\u5df2\\u4fdd\\u5b58' : '\\u4fdd\\u5b58\\u5931\\u8d25\\uff0c\\u8bf7\\u6838\\u5bf9 IP';
  } catch (_) { result.textContent = '\\u8fde\\u63a5\\u5931\\u8d25'; }
});"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def authorize_admin(self):
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            self.send_error(404)
            return False
        expected = "Basic " + base64.b64encode(("admin:" + admin_password()).encode()).decode()
        if not hmac.compare_digest(self.headers.get("Authorization", ""), expected):
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="Xiaojiao admin"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.close_connection = True
            self.end_headers()
            return False
        return True

    def do_POST(self):
        request_url = urlsplit(self.path)
        if request_url.path == "/admin/test-devices" and not request_url.query:
            if not self.authorize_admin():
                return
            origin = self.headers.get("Origin")
            if (self.headers.get("X-Xiaojiao-Admin") != "1" or
                    self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json" or
                    (origin and urlsplit(origin).netloc != self.headers.get("Host"))):
                self.send_error(403)
                return
            length = self.headers.get("Content-Length", "")
            if not length.isdecimal() or not 1 <= int(length) <= 2048:
                self.send_error(413)
                return
            try:
                self.connection.settimeout(5)
                save_test_devices(json.loads(self.rfile.read(int(length))))
            except (ValueError, TypeError, UnicodeError, TimeoutError):
                self.send_error(400)
                return
            except OSError:
                self.send_error(503)
                return
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.close_connection = True
            self.end_headers()
            return
        if request_url.path != "/api/activate" or request_url.query:
            self.send_error(404)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self.send_error(415)
            return
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal():
            self.send_error(411)
            return
        if not 1 <= int(length) <= 256:
            self.send_error(413)
            return
        try:
            self.connection.settimeout(5)
            payload = json.loads(self.rfile.read(int(length)))
            if not isinstance(payload, dict) or set(payload) != {"installId", "versionCode"}:
                raise ValueError("invalid activation payload")
            STATS.record_activation(payload["installId"], self.client_address[0], payload["versionCode"])
        except (ValueError, TypeError, UnicodeError, TimeoutError):
            self.send_error(400)
            return
        except (OSError, sqlite3.Error) as error:
            self.log_error("activation storage failed: %s", error)
            self.send_error(503)
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.close_connection = True
        self.end_headers()

    def do_HEAD(self):
        self.respond(head_only=True)

    def do_GET(self):
        self.respond(head_only=False)

    def respond(self, head_only: bool):
        request_url = urlsplit(self.path)
        path = request_url.path
        filename = "xiaojiao-timetable.apk"
        if path in ("/admin", "/admin-ui.js"):
            if not self.authorize_admin():
                return
            body = admin_page(request_url.query) if path == "/admin" else ADMIN_SCRIPT
            mime = "text/html; charset=utf-8" if path == "/admin" else "application/javascript"
        elif path == "/":
            try:
                digest, filename, _ = published_apk()
            except (OSError, ValueError):
                self.send_error(503, "APK is not built")
                return
            body = f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>小交课表 · 下载</title><style>
body{{margin:0;background:#f5f8fc;color:#273449;font-family:system-ui,sans-serif}}
main{{max-width:420px;margin:9vh auto;padding:26px;text-align:center;background:white;border-radius:20px;box-shadow:0 10px 35px #dce4ed}}
img{{width:96px;height:96px;border-radius:20px}}h1{{font-size:24px;margin:14px 0 5px}}p{{color:#758196;line-height:1.6}}
a{{display:block;background:#527fb6;color:white;text-decoration:none;border-radius:12px;padding:14px;margin:22px 0;font-weight:600}}
small{{word-break:break-all;color:#758196}}
</style><main><img src="/logo.png" alt="小交课表"><h1>小交课表</h1>
<p>手机连接校园网后，可在浏览器手动打开本页下载。</p><a href="/{html.escape(filename)}">下载 / 更新 App</a>
<small>SHA-256：{html.escape(digest)}<br>版本文件：{html.escape(filename)}</small></main></html>""".encode()
            mime = "text/html; charset=utf-8"
        else:
            allowed = {
                "/xiaojiao-timetable.apk": DIST / "xiaojiao-timetable.apk",
                "/sha256.txt": DIST / "sha256.txt",
                "/version.json": DIST / "version.json",
                "/logo.png": LOGO,
            }
            try:
                _, filename, file = published_apk()
                allowed["/" + filename] = file
            except (OSError, ValueError):
                pass
            try:
                _, test_name, test_file = published_apk(testing=True)
                if self.client_address[0] in test_device_ips():
                    allowed["/version.json"] = DIST / "test-version.json"
                if testing_client(self.client_address[0]):
                    allowed["/test/version.json"] = DIST / "test-version.json"
                    allowed["/test/sha256.txt"] = DIST / "test-sha256.txt"
                    allowed["/" + test_name] = test_file
            except (OSError, ValueError):
                pass
            file = allowed.get(path)
            if file is None or not file.is_file() or file.resolve().parent not in (DIST.resolve(), LOGO.parent.resolve()):
                self.send_error(404)
                return
            body = file.read_bytes()
            if path.endswith(".apk") and file.name != "xiaojiao-timetable.apk":
                filename = file.name
            mime = "application/vnd.android.package-archive" if path.endswith(".apk") else (
                "image/png" if path.endswith(".png") else (
                    "application/json; charset=utf-8" if path.endswith(".json") else "text/plain; charset=utf-8"))
        status = 200
        total = len(body)
        content_range = None
        etag = None
        range_end = None
        if path.endswith(".apk"):
            etag = '"' + hashlib.sha256(body).hexdigest() + '"'
            requested_range = self.headers.get("Range")
            if requested_range and self.headers.get("If-Range", etag) == etag:
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested_range.strip())
                if match and (match.group(1) or match.group(2)):
                    if match.group(1):
                        start = int(match.group(1))
                        end = min(int(match.group(2)) if match.group(2) else total - 1, total - 1)
                    else:
                        count = int(match.group(2))
                        start, end = max(0, total - count), total - 1
                    if start < total and start <= end and (match.group(1) or count > 0):
                        content_range = "bytes {}-{}/{}".format(start, end, total)
                        range_end = end
                        body = body[start:end + 1]
                        status = 206
                if status != 206:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */{}".format(total))
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.close_connection = True
        if path in ("/", "/admin"):
            self.send_header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; " +
                ("script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" if path == "/admin" else ""))
        if path == "/admin":
            self.send_header("X-Frame-Options", "DENY")
        if path.endswith(".apk"):
            self.send_header("Content-Disposition", 'attachment; filename="{}"'.format(filename))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("ETag", etag)
            if content_range:
                self.send_header("Content-Range", content_range)
        self.end_headers()
        if not head_only:
            try:
                for offset in range(0, len(body), 64 * 1024):
                    self.wfile.write(body[offset:offset + 64 * 1024])
            except (BrokenPipeError, ConnectionResetError):
                pass
            else:
                if (path.endswith(".apk") and self.client_address[0] not in ("127.0.0.1", "::1")
                        and (status == 200 or range_end == total - 1)):
                    try:
                        STATS.record(self.client_address[0], filename)
                    except Exception as error:
                        self.log_error("download statistics failed: %s", error)


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

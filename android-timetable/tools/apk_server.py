#!/usr/bin/env python3
"""Serve only the public installer and its digest on the local network."""

import argparse
import html
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
LOGO = ROOT / "app/src/main/res/drawable-nodpi/xiaojiao_logo.png"


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.respond(head_only=True)

    def do_GET(self):
        self.respond(head_only=False)

    def respond(self, head_only: bool):
        path = urlsplit(self.path).path
        if path == "/":
            digest_file = DIST / "sha256.txt"
            if not digest_file.exists():
                self.send_error(503, "APK is not built")
                return
            digest, filename = digest_file.read_text().strip().split("  ", 1)
            if not (DIST / filename).is_file():
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
<p>安卓安装包 · 局域网下载</p><a href="/xiaojiao-timetable.apk">下载 / 更新 App</a>
<small>SHA-256：{html.escape(digest)}<br>版本文件：{html.escape(filename)}</small></main></html>""".encode()
            mime = "text/html; charset=utf-8"
        else:
            allowed = {
                "/xiaojiao-timetable.apk": DIST / "xiaojiao-timetable.apk",
                "/sha256.txt": DIST / "sha256.txt",
                "/logo.png": LOGO,
            }
            digest_file = DIST / "sha256.txt"
            if digest_file.exists():
                _, filename = digest_file.read_text().strip().split("  ", 1)
                allowed["/" + filename] = DIST / filename
            file = allowed.get(path)
            if file is None or not file.is_file():
                self.send_error(404)
                return
            body = file.read_bytes()
            mime = "application/vnd.android.package-archive" if path.endswith(".apk") else (
                "image/png" if path.endswith(".png") else "text/plain; charset=utf-8")
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        if path == "/":
            self.send_header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
        if path.endswith(".apk"):
            self.send_header("Content-Disposition", 'attachment; filename="xiaojiao-timetable.apk"')
        self.end_headers()
        if not head_only:
            self.wfile.write(body)


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

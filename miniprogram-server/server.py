"""Loopback-only GMIS import API. Put a verified HTTPS reverse proxy in front."""
from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from gmis_browser import ImportFailed, fetch_schedule

_LOCK = threading.Lock()
_LAST_START = 0.0


class Handler(BaseHTTPRequestHandler):
    server_version = "XiaojiaoImporter"
    sys_version = ""

    def log_message(self, *_args):
        # Requests contain credentials. Deliberately suppress the default access log.
        return

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        global _LAST_START
        if self.path != "/api/gmis/import":
            self._json(404, {"error": "not found"})
            return
        if self.headers.get("X-Forwarded-Proto") != "https":
            self._json(403, {"error": "https required"})
            return
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            self._json(415, {"error": "json required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 2 or length > 8192:
            self._json(413, {"error": "invalid request size"})
            return
        try:
            data = json.loads(self.rfile.read(length))
            username = data.get("username", "")
            password = data.get("password", "")
            if (not isinstance(username, str) or not isinstance(password, str) or
                    not 1 <= len(username) <= 100 or not 1 <= len(password) <= 200):
                raise ValueError
        except (ValueError, AttributeError, TypeError):
            self._json(400, {"error": "invalid credentials format"})
            return
        if not _LOCK.acquire(blocking=False):
            self._json(429, {"error": "try again later"})
            return
        try:
            if time.monotonic() - _LAST_START < 3:
                self._json(429, {"error": "try again later"})
                return
            _LAST_START = time.monotonic()
            result = fetch_schedule(username, password)
            self._json(200, result)
        except ImportFailed:
            self._json(401, {"error": "login or timetable unavailable"})
        except Exception:
            self._json(502, {"error": "school service unavailable"})
        finally:
            _LOCK.release()

    def do_GET(self):
        self._json(404, {"error": "not found"})


def main():
    port = int(os.environ.get("XIAOJIAO_IMPORT_PORT", "8766"))
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()

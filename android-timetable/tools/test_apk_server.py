"""HTTP download behavior used by Android browsers and download managers."""

import base64
import hashlib
import http.client
import tempfile
import threading
import unittest
from pathlib import Path

import apk_server
from download_stats import DownloadStats


class InstallerServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_dist, cls.old_logo = apk_server.DIST, apk_server.LOGO
        cls.old_stats, cls.old_password_file = apk_server.STATS, apk_server.ADMIN_PASSWORD_FILE
        apk_server.DIST = Path(cls.temp.name)
        apk_server.LOGO = apk_server.DIST / "logo.png"
        apk_server.STATS = DownloadStats(apk_server.DIST / "downloads.sqlite3")
        apk_server.ADMIN_PASSWORD_FILE = apk_server.DIST / "admin_password"
        apk_server.LOGO.write_bytes(b"png")
        cls.body = bytes(range(256)) * 1024
        cls.filename = "xiaojiao-timetable-0.5.0.apk"
        (apk_server.DIST / cls.filename).write_bytes(cls.body)
        (apk_server.DIST / "xiaojiao-timetable.apk").write_bytes(cls.body)
        digest = hashlib.sha256(cls.body).hexdigest()
        (apk_server.DIST / "sha256.txt").write_text("{}  {}\n".format(digest, cls.filename))
        cls.server = apk_server.ThreadingHTTPServer(("127.0.0.1", 0), apk_server.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        apk_server.DIST, apk_server.LOGO = cls.old_dist, cls.old_logo
        apk_server.STATS, apk_server.ADMIN_PASSWORD_FILE = cls.old_stats, cls.old_password_file
        cls.temp.cleanup()

    def request(self, path, headers=None, method="GET"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_page_links_versioned_apk(self):
        status, _, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b'href="/xiaojiao-timetable-0.5.0.apk"', body)
        self.assertIn("校园网".encode(), body)

    def test_admin_requires_credentials_and_shows_ip_counts(self):
        status, headers, body = self.request("/admin")
        self.assertEqual(status, 401)
        self.assertIn("Basic", headers["WWW-Authenticate"])
        self.assertEqual(body, b"")
        apk_server.STATS.record("192.0.2.42", self.filename)
        password = apk_server.ADMIN_PASSWORD_FILE.read_text().strip()
        token = base64.b64encode(("admin:" + password).encode()).decode()
        status, _, body = self.request("/admin", {"Authorization": "Basic " + token})
        self.assertEqual(status, 200)
        self.assertIn(b"192.0.2.42", body)
        self.assertNotIn(password.encode(), body)

    def test_stats_deduplicate_retry_and_count_separate_ips(self):
        with tempfile.TemporaryDirectory() as directory:
            stats = DownloadStats(Path(directory) / "stats.sqlite3")
            self.assertTrue(stats.record("192.0.2.1", self.filename, now=1000))
            self.assertFalse(stats.record("192.0.2.1", self.filename, now=1010))
            self.assertTrue(stats.record("192.0.2.1", self.filename, now=1031))
            self.assertTrue(stats.record("192.0.2.2", self.filename, now=1010))
            unique, total, rows = stats.overview()
            self.assertEqual((unique, total), (2, 3))
            self.assertEqual({row[0]: row[1] for row in rows}, {"192.0.2.1": 2, "192.0.2.2": 1})

    def test_full_and_resumed_download_reconstruct_same_file(self):
        path = "/" + self.filename
        count_before = apk_server.STATS.overview()[1]
        status, headers, full = self.request(path)
        self.assertEqual(status, 200)
        self.assertEqual(headers["Accept-Ranges"], "bytes")
        self.assertEqual(full, self.body)
        status, headers, first = self.request(path, {"Range": "bytes=0-131071"})
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Range"], "bytes 0-131071/262144")
        status, _, second = self.request(path, {"Range": "bytes=131072-"})
        self.assertEqual(status, 206)
        self.assertEqual(first + second, full)
        self.assertEqual(hashlib.sha256(first + second).digest(), hashlib.sha256(full).digest())
        self.assertEqual(count_before, apk_server.STATS.overview()[1])

    def test_suffix_and_invalid_ranges(self):
        path = "/" + self.filename
        status, _, tail = self.request(path, {"Range": "bytes=-16"})
        self.assertEqual(status, 206)
        self.assertEqual(tail, self.body[-16:])
        status, headers, body = self.request(path, {"Range": "bytes=999999-"})
        self.assertEqual(status, 416)
        self.assertEqual(headers["Content-Range"], "bytes */262144")
        self.assertEqual(body, b"")

    def test_head_and_if_range(self):
        path = "/xiaojiao-timetable.apk"
        status, headers, body = self.request(path, {"Range": "bytes=0-7"}, "HEAD")
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Length"], "8")
        self.assertEqual(body, b"")
        status, _, body = self.request(path, {"Range": "bytes=0-7", "If-Range": '"old"'})
        self.assertEqual(status, 200)
        self.assertEqual(body, self.body)

    def test_private_files_are_not_served(self):
        status, _, _ = self.request("/.env")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()

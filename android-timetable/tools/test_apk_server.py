"""HTTP download behavior used by Android browsers and download managers."""

import base64
import hashlib
import http.client
import json
import tempfile
import threading
import unittest
import uuid
from unittest.mock import patch
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
        cls.filename = "xiaojiao-timetable-0.7.0.apk"
        (apk_server.DIST / cls.filename).write_bytes(cls.body)
        (apk_server.DIST / "xiaojiao-timetable.apk").write_bytes(cls.body)
        digest = hashlib.sha256(cls.body).hexdigest()
        (apk_server.DIST / "sha256.txt").write_text("{}  {}\n".format(digest, cls.filename))
        (apk_server.DIST / "version.json").write_text(json.dumps({
            "versionCode": 8, "versionName": "0.7.0", "apk": cls.filename, "sha256": digest,
        }))
        cls.test_filename = "xiaojiao-timetable-0.8.0-test.1.apk"
        (apk_server.DIST / cls.test_filename).write_bytes(b"test APK")
        (apk_server.DIST / "test-sha256.txt").write_text(
            hashlib.sha256(b"test APK").hexdigest() + "  " + cls.test_filename + "\n")
        (apk_server.DIST / "test-version.json").write_text(json.dumps({
            "versionCode": 10, "versionName": "0.8.0-test.1", "apk": cls.test_filename,
            "sha256": hashlib.sha256(b"test APK").hexdigest(),
        }))
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

    def request(self, path, headers=None, method="GET", body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_page_links_versioned_apk(self):
        status, _, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(('href="/' + self.test_filename + '"').encode(), body)
        self.assertIn(b'href="/xiaojiao-timetable-0.7.0.apk"', body)
        self.assertIn("校园网".encode(), body)
        self.assertIn("下载测试版 0.8.0-test.1".encode(), body)

    def test_version_endpoint_matches_published_apk(self):
        status, headers, body = self.request("/version.json")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(headers["Cache-Control"], "no-store")
        metadata = json.loads(body)
        self.assertEqual(metadata["versionCode"], 10)
        self.assertEqual(metadata["versionName"], "0.8.0-test.1")
        self.assertEqual(metadata["apk"], self.test_filename)
        self.assertEqual(metadata["sha256"], hashlib.sha256(b"test APK").hexdigest())
        self.assertEqual(json.loads(self.request("/stable/version.json")[2])["versionCode"], 8)

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

    def test_first_open_count_is_idempotent_and_separate_from_downloads(self):
        install_id = str(uuid.uuid4())
        body = json.dumps({"installId": install_id, "versionCode": 8}).encode()
        headers = {"Content-Type": "application/json"}
        downloads_before = apk_server.STATS.overview()[1]
        status, _, _ = self.request("/api/activate", headers, "POST", body)
        self.assertEqual(status, 204)
        status, _, _ = self.request("/api/activate", headers, "POST", body)
        self.assertEqual(status, 204)
        total, _, rows = apk_server.STATS.activation_overview()
        self.assertEqual(total, 1)
        self.assertEqual(rows[0][1], 1)
        self.assertEqual(downloads_before, apk_server.STATS.overview()[1])
        status, _, page = self.request("/admin", {
            "Authorization": "Basic " + base64.b64encode((
                "admin:" + apk_server.ADMIN_PASSWORD_FILE.read_text().strip()).encode()).decode(),
        })
        self.assertEqual(status, 200)
        self.assertIn("首次打开：1 次".encode(), page)
        self.assertNotIn(install_id.encode(), page)

    def test_activation_rejects_bad_payloads_and_other_post_paths(self):
        headers = {"Content-Type": "application/json"}
        for body in (b"{}", b"{\"installId\":\"bad\",\"versionCode\":8}", b"x" * 257):
            status, _, _ = self.request("/api/activate", headers, "POST", body)
            self.assertIn(status, (400, 413))
        status, _, _ = self.request("/admin", headers, "POST", b"{}")
        self.assertEqual(status, 404)

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
        self.assertEqual(body, b"test APK")
        self.assertEqual(headers["Content-Disposition"],
                         'attachment; filename="' + self.test_filename + '"')

    def test_private_files_are_not_served(self):
        (apk_server.DIST / "private.secret").write_text("do not serve")
        for path in ("/.env", "/private.secret", "/../private.secret",
                     "/%2e%2e/private.secret", "/app/build/outputs/apk/release/app-release.apk"):
            status, _, _ = self.request(path)
            self.assertEqual(status, 404, path)

    def test_test_release_is_public_but_administration_is_private(self):
        original_setup = apk_server.Handler.setup

        def remote_setup(handler):
            original_setup(handler)
            handler.client_address = ("192.0.2.99", handler.client_address[1])

        with patch.object(apk_server.Handler, "setup", remote_setup):
            for path in ("/version.json", "/test/version.json"):
                status, _, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["versionCode"], 10)
            status, _, body = self.request("/" + self.test_filename)
            self.assertEqual(status, 200)
            self.assertEqual(body, b"test APK")
            self.assertEqual(self.request("/admin")[0], 404)
            self.assertEqual(self.request("/admin-ui.js")[0], 404)
            self.assertEqual(self.request("/test_devices.json")[0], 404)
            self.assertEqual(self.request("/admin/test-devices",
                {"Content-Type": "application/json"}, "POST", b"{}")[0], 404)

    def test_missing_test_release_falls_back_to_stable(self):
        checksum = apk_server.DIST / "test-sha256.txt"
        saved = checksum.read_bytes()
        checksum.unlink()
        try:
            for path in ("/version.json", "/test/version.json"):
                status, _, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["versionCode"], 8)
            self.assertEqual(self.request("/" + self.test_filename)[0], 404)
            self.assertIn("下载正式版 0.7.0".encode(), self.request("/")[2])
        finally:
            checksum.write_bytes(saved)

    def test_newer_stable_updates_both_existing_and_test_apps(self):
        metadata_file = apk_server.DIST / "version.json"
        saved = metadata_file.read_bytes()
        metadata = json.loads(saved)
        metadata["versionCode"] = 11
        metadata_file.write_text(json.dumps(metadata))
        try:
            for path in ("/version.json", "/test/version.json"):
                status, _, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["versionCode"], 11)
                self.assertEqual(json.loads(body)["apk"], self.filename)
            self.assertEqual(self.request("/xiaojiao-timetable.apk")[2], self.body)
            self.assertIn("下载正式版 0.7.0".encode(), self.request("/")[2])
        finally:
            metadata_file.write_bytes(saved)


if __name__ == "__main__":
    unittest.main()

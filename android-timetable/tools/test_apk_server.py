"""HTTP download behavior used by Android browsers and download managers."""

import hashlib
import http.client
import tempfile
import threading
import unittest
from pathlib import Path

import apk_server


class InstallerServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_dist, cls.old_logo = apk_server.DIST, apk_server.LOGO
        apk_server.DIST = Path(cls.temp.name)
        apk_server.LOGO = apk_server.DIST / "logo.png"
        apk_server.LOGO.write_bytes(b"png")
        cls.body = bytes(range(256)) * 1024
        cls.filename = "xiaojiao-timetable-0.3.0.apk"
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
        self.assertIn(b'href="/xiaojiao-timetable-0.3.0.apk"', body)

    def test_full_and_resumed_download_reconstruct_same_file(self):
        path = "/" + self.filename
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

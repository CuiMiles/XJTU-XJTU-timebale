import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        server._LAST_START = 0

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)

    def request(self, secure):
        connection = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port)
        headers = {'Content-Type': 'application/json'}
        if secure:
            headers['X-Forwarded-Proto'] = 'https'
        connection.request('POST', '/api/gmis/import', json.dumps({'username': 'test', 'password': 'secret'}), headers)
        response = connection.getresponse()
        result = (response.status, dict(response.getheaders()), json.loads(response.read()))
        connection.close()
        return result

    def test_https_proxy_required(self):
        with patch.object(server, 'fetch_schedule') as fetch:
            status, headers, body = self.request(False)
            self.assertEqual(status, 403)
            self.assertEqual(headers['Cache-Control'], 'no-store')
            fetch.assert_not_called()

    def test_returns_only_parsed_course_schema(self):
        fixture = {'schemaVersion': 1, 'semesterId': '2026-fall', 'courses': []}
        with patch.object(server, 'fetch_schedule', return_value=fixture) as fetch:
            status, headers, body = self.request(True)
            self.assertEqual(status, 200)
            self.assertEqual(body, fixture)
            self.assertEqual(headers['Cache-Control'], 'no-store')
            fetch.assert_called_once_with('test', 'secret')


if __name__ == '__main__':
    unittest.main()

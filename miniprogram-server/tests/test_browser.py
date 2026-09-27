import unittest
from gmis_browser import _school_host

class HostTest(unittest.TestCase):
    def test_only_school_https_hosts(self):
        self.assertTrue(_school_host('https://login.xjtu.edu.cn/cas/login'))
        self.assertFalse(_school_host('https://xjtu.edu.cn.evil.example/'))

if __name__ == '__main__':
    unittest.main()

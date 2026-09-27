import unittest
from gmis_parser import parse_html

HTML = '''<table id="tbl"><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th><th>星期六</th><th>星期日</th></tr>
<tr><td>3</td><td></td><td></td><td>课程：体育<br>班级：1班<br>教师：张老师<br>教室：体育馆<br>节次：3-4<br>周次：第1-8周</td><td></td><td></td><td></td><td></td></tr></table>'''

class ParserTest(unittest.TestCase):
    def test_sport_and_stable_id(self):
        result = parse_html(HTML)
        course = result['courses'][0]
        self.assertEqual(course['weekday'], 3)
        self.assertEqual(course['sections'], [3, 4])
        self.assertEqual(course['weeks'], list(range(1, 9)))
        self.assertEqual(course['id'], parse_html(HTML)['courses'][0]['id'])

    def test_missing_table_rejected(self):
        with self.assertRaises(ValueError):
            parse_html('<html></html>')

if __name__ == '__main__':
    unittest.main()

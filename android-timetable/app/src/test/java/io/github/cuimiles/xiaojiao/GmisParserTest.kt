package io.github.cuimiles.xiaojiao

import org.junit.Assert.*
import org.junit.Test

class GmisParserTest {
    private val html = """<table id="tbl"><tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th><th>星期六</th><th>星期日</th></tr>
        <tr><td>3</td><td></td><td></td><td>课程：体育<br>班级：1班<br>教师：张老师<br>教室：体育馆<br>节次：3-4<br>周次：第1-8周</td><td></td><td></td><td></td><td></td></tr></table>"""
    @Test fun parsesCourseAndStableIdentity() {
        val course = GmisParser.parse(html).single()
        assertEquals(3, course.weekday)
        assertEquals(listOf(3, 4), course.sections)
        assertEquals((1..8).toList(), course.weeks)
        assertEquals(course.id, GmisParser.parse(html).single().id)
    }
    @Test fun missingTableFails() {
        try { GmisParser.parse("<html></html>"); fail("expected parse failure") }
        catch (_: IllegalStateException) { }
    }
}

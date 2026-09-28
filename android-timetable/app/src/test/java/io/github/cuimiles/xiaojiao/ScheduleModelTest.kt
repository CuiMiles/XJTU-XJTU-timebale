package io.github.cuimiles.xiaojiao

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class ScheduleModelTest {
    private val course = Course("manual-sport", "体育", weekday = 3, sections = listOf(3, 4), weeks = (1..8).toList(), color = "mint")
    @Test fun backupRoundTripAndWeekFilter() {
        val data = ScheduleCodec.decode(ScheduleCodec.encode(ScheduleData(courses = listOf(course))))
        assertEquals("mint", data.courses.single().color)
        assertEquals(1, ScheduleEngine.occurrences(data, 1).size)
        assertEquals(0, ScheduleEngine.occurrences(data, 9).size)
    }
    @Test fun adjustedOccurrenceMovesAcrossWeeks() {
        val moved = Adjustment(course.id, "2026-09-16", false, "2026-09-23", listOf(5, 6), "新地点")
        val data = ScheduleData(courses = listOf(course), adjustments = listOf(moved))
        assertEquals(0, ScheduleEngine.occurrences(data, 1).size)
        assertEquals("新地点", ScheduleEngine.occurrences(data, 2).first { it.adjusted }.room)
    }
    @Test fun dateBoundariesAndCurrentWeek() {
        assertEquals(1, CalendarRules.weekOf(LocalDate.parse("2026-09-14")))
        assertEquals(0, CalendarRules.weekOf(LocalDate.parse("2026-09-13")))
        assertEquals(18, CalendarRules.weekOf(LocalDate.parse("2027-01-17")))
    }
}

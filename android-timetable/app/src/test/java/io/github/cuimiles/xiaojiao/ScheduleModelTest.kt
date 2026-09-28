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
    @Test fun defaultColorsAreDistinctAndStayStableForSameCourse() {
        val courses = (1..10).map { number ->
            course.copy(id = "course-$number", name = "课程 $number", color = null)
        } + course.copy(id = "second-session", name = "课程 1", color = null)
        val assigned = PastelPalette.assignDefaults(courses)
        assertEquals(10, assigned.take(10).map { it.color }.toSet().size)
        assertEquals(assigned.first().color, assigned.last().color)
        assertEquals("soft-sky", assigned.first().color)
        assertTrue(assigned.take(10).all { item ->
            val background = PastelPalette.byId(item.color)!!.background
            listOf(16, 8, 0).all { shift -> ((background ushr shift) and 0xFF) >= 0xD0 }
        })
        assertEquals("mint", PastelPalette.assignDefaults(listOf(course)).single().color)
    }
    @Test fun customColorWithAlphaSurvivesBackupAndLegacyDefaultsBecomeSoft() {
        val custom = PastelPalette.custom(0x80302060)
        assertEquals("#80302060", custom)
        assertEquals(0x80302060, PastelPalette.byId(custom)!!.background)
        assertEquals(0xFFFFFFFF, PastelPalette.byId("#FF101040")!!.text)
        assertEquals(0xFF273449, PastelPalette.byId("#40101040")!!.text)
        val data = ScheduleCodec.decode(ScheduleCodec.encode(ScheduleData(courses = listOf(course.copy(color = custom)))))
        assertEquals(custom, data.courses.single().color)
        assertNull(PastelPalette.byId("#GG302060"))

        val old = listOf(course,
            course.copy(id = "gmis-one", name = "算法", color = "rose"),
            course.copy(id = "gmis-two", name = "数据库", color = "blue"),
            course.copy(id = "gmis-custom", name = "机器学习", color = custom))
        val migrated = PastelPalette.migrateLegacyDefaults(old)
        assertEquals("mint", migrated[0].color)
        assertEquals("soft-sky", migrated[1].color)
        assertEquals("soft-mint", migrated[2].color)
        assertEquals(custom, migrated[3].color)
    }
}

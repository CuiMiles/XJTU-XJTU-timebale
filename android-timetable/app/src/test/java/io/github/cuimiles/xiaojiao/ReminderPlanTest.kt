package io.github.cuimiles.xiaojiao

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDateTime

class ReminderPlanTest {
    private val course = Course("manual-test", "示例课程", room = "教室A", weekday = 1,
        sections = listOf(3, 4), weeks = listOf(1))
    private fun instant(value: String) = LocalDateTime.parse(value).atZone(ReminderPlan.zone).toInstant().toEpochMilli()

    @Test fun everyPeriodGetsItsOwnHalfHourReminderAndSeasonalTime() {
        val lessons = ReminderPlan.lessons(ScheduleData(courses = listOf(course)), ReminderSettings(enabled = true))
        assertEquals(2, lessons.size)
        assertEquals(instant("2026-09-14T09:40:00"), lessons[0].remindAt)
        assertEquals(instant("2026-09-14T10:10:00"), lessons[0].startAt)
        assertEquals(instant("2026-09-14T11:00:00"), lessons[0].endAt)
        assertNotEquals(lessons[0].key, lessons[1].key)
        val afternoon = course.copy(sections = listOf(5), weeks = listOf(1, 4))
        val times = ReminderPlan.lessons(ScheduleData(courses = listOf(afternoon)), ReminderSettings(enabled = true))
        assertEquals("14:30", ReminderPlan.timeText(times[0].startAt))
        assertEquals("14:00", ReminderPlan.timeText(times[1].startAt))
    }

    @Test fun mergedModeAndCustomLeadProduceOneReminder() {
        val lesson = ReminderPlan.lessons(ScheduleData(courses = listOf(course)),
            ReminderSettings(enabled = true, leadMinutes = 15, mergeConsecutive = true)).single()
        assertEquals(listOf(3, 4), lesson.sections)
        assertEquals(instant("2026-09-14T09:55:00"), lesson.remindAt)
        assertEquals(instant("2026-09-14T12:00:00"), lesson.endAt)
    }

    @Test fun holidaysCancellationAndMovedCourseUseActualSchedule() {
        val holiday = course.copy(weekday = 4, weeks = listOf(3))
        assertTrue(ReminderPlan.lessons(ScheduleData(courses = listOf(holiday)), ReminderSettings(enabled = true)).isEmpty())
        val cancelled = Adjustment(course.id, "2026-09-14", true, "2026-09-15", listOf(5), "教室B")
        assertTrue(ReminderPlan.lessons(ScheduleData(courses = listOf(course), adjustments = listOf(cancelled)),
            ReminderSettings(enabled = true)).isEmpty())
        val moved = cancelled.copy(cancelled = false)
        val lesson = ReminderPlan.lessons(ScheduleData(courses = listOf(course), adjustments = listOf(moved)),
            ReminderSettings(enabled = true)).single()
        assertEquals(instant("2026-09-15T14:30:00"), lesson.startAt)
        assertEquals("教室B", lesson.room)
    }

    @Test fun visibilityEndsExactlyAtEndAndNextAlarmSkipsPastTransitions() {
        val lesson = ReminderPlan.lessons(ScheduleData(courses = listOf(course)),
            ReminderSettings(enabled = true)).first()
        assertFalse(lesson.visibleAt(lesson.remindAt - 1))
        assertTrue(lesson.visibleAt(lesson.remindAt))
        assertFalse(lesson.visibleAt(lesson.endAt))
        assertEquals(lesson.startAt, ReminderPlan.nextChange(listOf(lesson), lesson.remindAt, true))
        assertEquals(lesson.endAt, ReminderPlan.nextChange(listOf(lesson), lesson.remindAt, false))
        assertNull(ReminderPlan.nextChange(listOf(lesson), lesson.endAt, true))
        assertTrue(ReminderPlan.lessons(ScheduleData(courses = listOf(course)), ReminderSettings()).isEmpty())
    }

    @Test fun conflictsAreNotDroppedAndNonconsecutiveSectionsDoNotMerge() {
        val other = course.copy(id = "other", name = "另一门课")
        val lessons = ReminderPlan.lessons(ScheduleData(courses = listOf(course, other)), ReminderSettings(enabled = true))
        assertEquals(4, lessons.size)
        assertEquals(4, lessons.map { it.key }.toSet().size)
        val separated = course.copy(sections = listOf(3, 5))
        assertEquals(2, ReminderPlan.lessons(ScheduleData(courses = listOf(separated)),
            ReminderSettings(enabled = true, mergeConsecutive = true)).size)
    }
}

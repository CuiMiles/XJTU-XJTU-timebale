package io.github.cuimiles.xiaojiao

import java.security.MessageDigest
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

data class ReminderSettings(
    val enabled: Boolean = false,
    val leadMinutes: Int = 30,
    val liveEnabled: Boolean = true,
    val mergeConsecutive: Boolean = false,
)

data class ReminderLesson(
    val key: String,
    val title: String,
    val room: String,
    val sections: List<Int>,
    val startAt: Long,
    val endAt: Long,
    val remindAt: Long,
) {
    fun visibleAt(now: Long): Boolean = now >= remindAt && now < endAt
}

/** Shares the timetable's actual dates, holiday filtering, adjustments and seasonal slots. */
object ReminderPlan {
    val zone: ZoneId = ZoneId.of("Asia/Shanghai")

    fun lessons(data: ScheduleData, settings: ReminderSettings): List<ReminderLesson> {
        require(settings.leadMinutes in 0..180)
        if (!settings.enabled) return emptyList()
        return (1..18).flatMap { week ->
            ScheduleEngine.blocks(ScheduleEngine.occurrences(data, week)).flatMap { block ->
                val groups = if (settings.mergeConsecutive) listOf(block.sections)
                    else block.sections.map { listOf(it) }
                val date = block.first.date
                val slots = CalendarRules.slots(date)
                groups.map { sections ->
                    val start = date.atTime(LocalTime.parse(slots[sections.first() - 1].substringBefore('-')))
                        .atZone(zone).toInstant().toEpochMilli()
                    val end = date.atTime(LocalTime.parse(slots[sections.last() - 1].substringAfter('-')))
                        .atZone(zone).toInstant().toEpochMilli()
                    val identity = block.members.map { it.course.id }.distinct().sorted().joinToString("|") +
                        "@$date:${sections.joinToString(",")}" + ":${block.first.room}:${block.first.course.name}"
                    val key = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray())
                        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
                    ReminderLesson(key, block.first.course.name, block.first.room, sections, start, end,
                        start - settings.leadMinutes * 60_000L)
                }
            }
        }.distinctBy { it.key }.sortedWith(compareBy({ it.remindAt }, { it.title }))
    }

    fun nextChange(lessons: List<ReminderLesson>, now: Long, liveEnabled: Boolean): Long? =
        lessons.asSequence().flatMap {
            (if (liveEnabled) listOf(it.remindAt, it.startAt, it.endAt)
                else listOf(it.remindAt, it.endAt)).asSequence()
        }.filter { it > now }.minOrNull()

    fun timeText(epoch: Long): String = Instant.ofEpochMilli(epoch).atZone(zone).toLocalTime()
        .withSecond(0).withNano(0).toString()
}

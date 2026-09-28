package io.github.cuimiles.xiaojiao

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

@Serializable
data class Course(
    val id: String,
    val name: String,
    val className: String = "",
    val teachers: List<String> = emptyList(),
    val room: String = "",
    val weekday: Int,
    val sections: List<Int>,
    val weeks: List<Int>,
    val note: String = "",
    val color: String? = null,
)

@Serializable
data class Adjustment(
    val courseId: String,
    val originalDate: String,
    val cancelled: Boolean,
    val date: String,
    val sections: List<Int>,
    val room: String,
)

@Serializable
data class ScheduleData(
    val schemaVersion: Int = 1,
    val semesterId: String = "2026-fall",
    val courses: List<Course> = emptyList(),
    val adjustments: List<Adjustment> = emptyList(),
    val backupVersion: Int? = 1,
)

data class Occurrence(
    val course: Course,
    val originalDate: LocalDate,
    val date: LocalDate,
    val sections: List<Int>,
    val room: String,
    val adjusted: Boolean,
)

data class CourseBlock(val members: List<Occurrence>, val start: Int, val end: Int) {
    val first: Occurrence get() = members.first()
    val sections: List<Int> get() = (start..end).toList()
}

object ScheduleCodec {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    fun encode(data: ScheduleData): String = json.encodeToString(ScheduleData.serializer(), data)
    fun decode(text: String): ScheduleData {
        require(text.length <= 2_000_000) { "课表文件过大" }
        val data = json.decodeFromString(ScheduleData.serializer(), text)
        require(data.schemaVersion == 1 && data.semesterId == "2026-fall") { "仅支持 2026 秋季课表" }
        require(data.courses.size <= 500) { "课程数量过多" }
        val ids = HashSet<String>()
        data.courses.forEach { c ->
            require(c.id.isNotBlank() && c.id.length <= 100 && ids.add(c.id)) { "课程 ID 缺失或重复" }
            require(c.name.isNotBlank() && c.name.length <= 100) { "课程名称无效" }
            require(c.weekday in 1..7) { "星期无效" }
            require(validNumbers(c.sections, 11) && validNumbers(c.weeks, 18)) { "节次或周次无效" }
            require(c.room.length <= 200 && c.note.length <= 500 && c.className.length <= 100) { "课程文本过长" }
            require(c.teachers.size <= 20 && c.teachers.all { it.length <= 100 }) { "教师列表无效" }
            require(c.color == null || PastelPalette.byId(c.color) != null) { "课程颜色无效" }
        }
        val byId = data.courses.associateBy { it.id }
        val adjustmentKeys = HashSet<String>()
        require(data.adjustments.size <= 10_000) { "调课记录过多" }
        data.adjustments.forEach { a ->
            val c = byId[a.courseId] ?: error("调课课程不存在")
            val original = LocalDate.parse(a.originalDate)
            val target = LocalDate.parse(a.date)
            require(CalendarRules.weekOf(original) in c.weeks && original.dayOfWeek.value == c.weekday) { "调课原日期无效" }
            require(CalendarRules.weekOf(target) in 1..18 && validNumbers(a.sections, 11)) { "调课目标无效" }
            require(adjustmentKeys.add(a.courseId + "@" + a.originalDate)) { "调课记录重复" }
        }
        return data
    }
    private fun validNumbers(values: List<Int>, max: Int) =
        values.isNotEmpty() && values.size <= max && values.distinct().size == values.size && values.all { it in 1..max }
}

object CalendarRules {
    val start: LocalDate = LocalDate.of(2026, 9, 14)
    val holidays = setOf("2026-09-25", "2026-10-01", "2026-10-02", "2026-10-03", "2027-01-01")
    val dayNames = listOf("一", "二", "三", "四", "五", "六", "日")
    private val winter = listOf("08:00-08:50", "09:00-09:50", "10:10-11:00", "11:10-12:00", "14:00-14:50", "15:00-15:50", "16:10-17:00", "17:10-18:00", "19:10-20:00", "20:10-21:00", "21:10-22:00")
    private val summer = listOf("08:00-08:50", "09:00-09:50", "10:10-11:00", "11:10-12:00", "14:30-15:20", "15:30-16:20", "16:40-17:30", "17:40-18:30", "19:40-20:30", "20:40-21:30", "21:40-22:30")
    fun today(): LocalDate = LocalDate.now(ZoneId.of("Asia/Shanghai"))
    fun weekOf(date: LocalDate): Int = Math.floorDiv(ChronoUnit.DAYS.between(start, date), 7L).toInt() + 1
    fun dateOf(week: Int, weekday: Int): LocalDate = start.plusDays(((week - 1) * 7 + weekday - 1).toLong())
    fun slots(date: LocalDate): List<String> {
        val md = date.monthValue * 100 + date.dayOfMonth
        return if (md in 501 until 1001) summer else winter
    }
    fun timeRange(date: LocalDate, sections: List<Int>): String {
        val slots = slots(date)
        return "${slots[sections.min() - 1].substringBefore('-')}–${slots[sections.max() - 1].substringAfter('-')}"
    }
    fun nowRowPosition(week: Int, now: LocalTime = LocalTime.now(ZoneId.of("Asia/Shanghai"))): Float? {
        if (weekOf(today()) != week) return null
        val slots = slots(today()).map { LocalTime.parse(it.substringBefore('-')) to LocalTime.parse(it.substringAfter('-')) }
        if (now < slots.first().first || now > slots.last().second) return null
        slots.forEachIndexed { i, (from, to) ->
            if (!now.isAfter(to)) {
                val duration = ChronoUnit.SECONDS.between(from, to).coerceAtLeast(1)
                val elapsed = ChronoUnit.SECONDS.between(from, now).coerceAtLeast(0)
                return i + elapsed.toFloat() / duration
            }
            if (i + 1 < slots.size && now < slots[i + 1].first) return (i + 1).toFloat()
        }
        return null
    }
}

object ScheduleEngine {
    fun occurrences(data: ScheduleData, week: Int): List<Occurrence> = buildList {
        data.courses.forEach { course ->
            course.weeks.forEach { originalWeek ->
                val original = CalendarRules.dateOf(originalWeek, course.weekday)
                val adjustment = data.adjustments.firstOrNull { it.courseId == course.id && it.originalDate == original.toString() }
                val date = adjustment?.date?.let(LocalDate::parse) ?: original
                if (CalendarRules.weekOf(date) == week && adjustment?.cancelled != true && (adjustment != null || original.toString() !in CalendarRules.holidays)) {
                    add(Occurrence(course, original, date, adjustment?.sections ?: course.sections, adjustment?.room ?: course.room, adjustment != null))
                }
            }
        }
    }.sortedWith(compareBy({ it.date }, { it.sections.min() }))

    fun blocks(items: List<Occurrence>): List<CourseBlock> {
        val separate = items.flatMap { occurrence ->
            occurrence.sections.sorted().fold(mutableListOf<MutableList<Int>>()) { groups, section ->
                if (groups.lastOrNull()?.lastOrNull() == section - 1) groups.last().add(section)
                else groups.add(mutableListOf(section))
                groups
            }.map { CourseBlock(listOf(occurrence), it.first(), it.last()) }
        }.sortedWith(compareBy({ it.first.date }, { it.start }))
        val merged = mutableListOf<CourseBlock>()
        separate.forEach { block ->
            val index = merged.indexOfFirst { previous ->
                val a = previous.first
                val b = block.first
                a.date == b.date && previous.end + 1 == block.start &&
                    a.course.name == b.course.name && a.room == b.room &&
                    a.course.className == b.course.className &&
                    a.course.teachers.toSet() == b.course.teachers.toSet() &&
                    a.adjusted == b.adjusted
            }
            if (index >= 0) {
                val old = merged[index]
                merged[index] = CourseBlock(old.members + block.members, old.start, block.end)
            } else merged.add(block)
        }
        return merged
    }
}

data class Pastel(val id: String, val background: Long, val text: Long)
object PastelPalette {
    val all = listOf(
        Pastel("rose", 0xFFF6DCE5, 0xFF613A4B), Pastel("blue", 0xFFDAE8F8, 0xFF334C69),
        Pastel("mint", 0xFFD9EFE6, 0xFF345B4C), Pastel("peach", 0xFFF7E1D5, 0xFF6B493D),
        Pastel("lavender", 0xFFE8E2F7, 0xFF53476B), Pastel("cyan", 0xFFDCEFF1, 0xFF355B61),
        Pastel("sand", 0xFFF5ECCF, 0xFF66583E), Pastel("slate", 0xFFE3EAF2, 0xFF425367),
    )
    fun byId(id: String?) = all.firstOrNull { it.id == id }
    fun forCourse(course: Course): Pastel = byId(course.color) ?: all[(course.name.hashCode() and Int.MAX_VALUE) % all.size]
}

package io.github.cuimiles.xiaojiao

import android.content.Context
import java.io.File

class ScheduleRepository(context: Context) {
    private val file = File(context.filesDir, "timetable-2026-fall.json")
    fun load(): ScheduleData {
        if (!file.exists()) return ScheduleData()
        val data = ScheduleCodec.decode(file.readText(Charsets.UTF_8))
        return data.copy(courses = PastelPalette.migrateLegacyDefaults(data.courses))
    }
    fun save(data: ScheduleData) {
        val checked = ScheduleCodec.decode(ScheduleCodec.encode(data))
        val temp = File(file.parentFile, file.name + ".tmp")
        temp.outputStream().use { stream ->
            stream.write(ScheduleCodec.encode(checked).toByteArray(Charsets.UTF_8))
            stream.flush()
            stream.fd.sync()
        }
        if (!temp.renameTo(file)) {
            temp.delete()
            error("课表保存失败")
        }
    }
    fun mergeRemote(current: ScheduleData, incoming: List<Course>): ScheduleData {
        require(incoming.isNotEmpty() && incoming.all { it.id.startsWith("gmis-") }) { "教务网未返回课程" }
        val previous = current.courses.associateBy { it.id }
        val remote = incoming.map { c ->
            val old = previous[c.id]
            if (old == null) c else c.copy(color = old.color, note = old.note)
        }
        val courses = current.courses.filterNot { it.id.startsWith("gmis-") } + remote
        val ids = courses.map { it.id }.toSet()
        return current.copy(courses = courses, adjustments = current.adjustments.filter { it.courseId in ids })
    }
}
